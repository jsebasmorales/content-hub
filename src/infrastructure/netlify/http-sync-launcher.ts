import type { SyncKind, SyncLauncher, SyncMode } from '@application/ports/sync';
import { createOutboundGuard, type OutboundGuard } from '../config/outbound-guard';
import { SYNC_FUNCTION_PATH, SYNC_SECRET_HEADER } from './sync-contract';

/** The background function could not be started. Carries no secret and no response body. */
export class SyncLaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncLaunchError';
  }
}

export interface HttpSyncLauncherConfig {
  /** The site's own public address (`PUBLIC_APP_URL`). */
  readonly baseUrl: string;
  readonly secret: string;
}

export interface HttpSyncLauncherDeps {
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Starts the sync by calling the site's own background function with the shared secret. Netlify
 * answers 202 at once, so this never waits for Jira (D-035, D-048). The only host it can reach is
 * the site itself.
 */
export class HttpSyncLauncher implements SyncLauncher {
  private readonly guard: OutboundGuard;
  private readonly origin: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: HttpSyncLauncherConfig,
    deps: HttpSyncLauncherDeps = {},
  ) {
    this.origin = new URL(config.baseUrl).origin;
    this.guard = createOutboundGuard([this.origin]);
    this.fetchFn = deps.fetch ?? fetch;
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async launch(kind: SyncKind, mode: SyncMode): Promise<void> {
    const url = this.guard.check(`${this.origin}${SYNC_FUNCTION_PATH}`);
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SYNC_SECRET_HEADER]: this.config.secret },
        body: JSON.stringify({ kind, mode }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new SyncLaunchError('The sync function could not be reached');
    }
    if (!response.ok) {
      throw new SyncLaunchError(`The sync function answered ${String(response.status)}`);
    }
  }
}
