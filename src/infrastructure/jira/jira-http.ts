import type { JiraError } from '@application/ports/jira';
import { logEvent } from '@shared/log';
import { err, ok, type Result } from '@shared/result';
import { createOutboundGuard, type OutboundGuard } from '../config/outbound-guard';

export interface JiraHttpConfig {
  /** `https://<site>.atlassian.net`, already validated by the environment rules. */
  readonly baseUrl: string;
  readonly email: string;
  readonly apiToken: string;
}

/** Injectable so tests run without a network or real waiting. */
export interface JiraHttpDeps {
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly maxAttempts?: number;
  readonly timeoutMs?: number;
}

const DEFAULT_ATTEMPTS = 4;
const DEFAULT_TIMEOUT_MS = 15_000;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;
/** Longer than this and a serverless function would be killed while waiting: give up instead. */
const MAX_RETRY_AFTER_SECONDS = 20;

type Attempt =
  | { readonly done: true; readonly result: Result<unknown, JiraError> }
  | { readonly done: false; readonly error: JiraError };

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The only code that talks to Jira over the network. It adds authentication, a timeout,
 * retries with exponential backoff and jitter, and respects `Retry-After` (SDD §6.4). Errors never
 * carry response bodies, headers or credentials.
 */
export class JiraHttp {
  private readonly guard: OutboundGuard;
  private readonly origin: string;
  private readonly authorization: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;

  constructor(config: JiraHttpConfig, deps: JiraHttpDeps = {}) {
    this.origin = new URL(config.baseUrl).origin;
    this.guard = createOutboundGuard([this.origin]);
    this.authorization = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`;
    this.fetchFn = deps.fetch ?? fetch;
    this.sleep = deps.sleep ?? defaultSleep;
    this.random = deps.random ?? Math.random;
    this.maxAttempts = deps.maxAttempts ?? DEFAULT_ATTEMPTS;
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** `path` starts with `/rest/`; the host is always the configured one. */
  async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<Result<unknown, JiraError>> {
    const url = this.guard.check(`${this.origin}${path}`);
    for (let attempt = 1; ; attempt += 1) {
      const outcome = await this.attempt(url, method, body);
      if (outcome.done) return outcome.result;
      const wait = this.waitBeforeRetry(outcome.error, attempt);
      if (attempt >= this.maxAttempts || wait === null) return err(outcome.error);
      logEvent('warn', 'jira.retry', { attempt, kind: outcome.error.kind });
      await this.sleep(wait);
    }
  }

  private async attempt(url: URL, method: 'GET' | 'POST', body: unknown): Promise<Attempt> {
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method,
        headers: {
          Authorization: this.authorization,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      return { done: false, error: { kind: 'unavailable', message: 'Jira did not respond' } };
    }
    return this.classify(response);
  }

  private async classify(response: Response): Promise<Attempt> {
    const { status } = response;
    if (status === 401 || status === 403) {
      return fail({
        kind: 'unauthorized',
        message: `Jira refused the credentials (${String(status)})`,
      });
    }
    if (status === 429) {
      const retryAfterSeconds = Number(response.headers.get('retry-after') ?? '');
      return {
        done: false,
        error: {
          kind: 'rate_limited',
          message: 'Jira asked to slow down',
          ...(Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? { retryAfterSeconds }
            : {}),
        },
      };
    }
    if (status >= 500) {
      return {
        done: false,
        error: { kind: 'unavailable', message: `Jira failed (${String(status)})` },
      };
    }
    if (!response.ok) {
      return fail({
        kind: 'invalid_response',
        message: `Jira rejected the request (${String(status)})`,
      });
    }
    try {
      return { done: true, result: ok(await response.json()) };
    } catch {
      return fail({ kind: 'invalid_response', message: 'Jira sent a body that is not JSON' });
    }
  }

  /** Milliseconds to wait, or null when waiting is pointless (non-retryable or too long). */
  private waitBeforeRetry(error: JiraError, attempt: number): number | null {
    if (error.kind !== 'unavailable' && error.kind !== 'rate_limited') return null;
    if (error.retryAfterSeconds !== undefined) {
      return error.retryAfterSeconds > MAX_RETRY_AFTER_SECONDS
        ? null
        : error.retryAfterSeconds * 1000;
    }
    const exponential = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1));
    // Jitter: between 50 % and 100 % of the step, so parallel callers do not retry in lockstep.
    return Math.round(exponential * (0.5 + this.random() / 2));
  }
}

const fail = (error: JiraError): Attempt => ({ done: true, result: err(error) });
