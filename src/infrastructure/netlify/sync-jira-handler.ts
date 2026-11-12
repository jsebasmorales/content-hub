import type { SyncInput, SyncResult } from '@application/use-cases/jira/run-jira-sync';
import { logEvent } from '@shared/log';
import { safeEqual } from '../auth/constant-time';
import { MAX_SYNC_BODY_BYTES, SYNC_SECRET_HEADER, syncRequestSchema } from './sync-contract';

/** The part of a Netlify function event this handler reads. */
export interface SyncFunctionEvent {
  readonly httpMethod: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: string | null;
}

export interface SyncFunctionResponse {
  readonly statusCode: number;
  readonly body: string;
}

export interface SyncHandlerDeps {
  readonly secret: string;
  readonly execute: (input: SyncInput) => Promise<SyncResult>;
}

/** Same empty 404 as an unknown route: nothing reveals that this endpoint exists (SDD §10.3). */
const NOT_FOUND: SyncFunctionResponse = { statusCode: 404, body: '' };

/**
 * The background sync function. Whoever cannot present the shared secret gets a 404 with no body,
 * so the function cannot be probed or triggered from outside the app (D-048). Netlify answers the
 * caller with 202 at once and runs this for up to 15 minutes; the response here matters only
 * for tests and local runs.
 */
export function createSyncHandler(deps: SyncHandlerDeps) {
  return async (event: SyncFunctionEvent): Promise<SyncFunctionResponse> => {
    if (event.httpMethod !== 'POST') return NOT_FOUND;
    const presented = event.headers[SYNC_SECRET_HEADER];
    if (presented === undefined || !safeEqual(presented, deps.secret)) {
      logEvent('warn', 'sync.function_rejected', { reason: 'bad_or_missing_secret' });
      return NOT_FOUND;
    }

    const body = event.body ?? '';
    if (Buffer.byteLength(body) > MAX_SYNC_BODY_BYTES) return { statusCode: 400, body: '' };
    const request = parseRequest(body);
    if (request === null) return { statusCode: 400, body: '' };

    const result = await deps.execute({ kind: request.kind, mode: request.mode });
    logEvent('warn', 'sync.function_finished', {
      kind: request.kind,
      mode: request.mode,
      status: result.status,
      items: result.status === 'busy' ? 0 : result.items,
    });
    return { statusCode: 202, body: JSON.stringify({ status: result.status }) };
  };
}

function parseRequest(body: string): { kind: SyncInput['kind']; mode: SyncInput['mode'] } | null {
  try {
    const parsed = syncRequestSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
