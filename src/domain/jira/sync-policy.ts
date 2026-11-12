/** Data older than this is refreshed when someone opens the dashboard (SDD §6.1, D-035). */
export const LAZY_SYNC_STALE_AFTER_MS = 15 * 60 * 1000;
/** A lazy refresh is attempted at most this often, whatever the number of visitors. */
export const LAZY_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;
/** Incremental syncs re-read this much before the last success, to absorb clock skew. */
export const INCREMENTAL_OVERLAP_MS = 5 * 60 * 1000;

/**
 * A run still marked "running" after this long is presumed dead (a background function lasts at
 * most 15 minutes), so it no longer blocks new syncs or counts as "in progress".
 */
export const SYNC_RUN_STALE_AFTER_MS = 15 * 60 * 1000;

/** Never deletes more than this share of the cache in one pass: a Jira glitch must not wipe it. */
export const MAX_DELETE_SHARE = 0.2;
/** Small caches can lose a few tickets without tripping the guard above. */
export const DELETE_GUARD_FLOOR = 10;

export interface SyncHistory {
  readonly lastSuccessAt: Date | null;
  readonly lastAttemptAt: Date | null;
  readonly running: boolean;
}

export function isStale(lastSuccessAt: Date | null, now: Date): boolean {
  return (
    lastSuccessAt === null || now.getTime() - lastSuccessAt.getTime() > LAZY_SYNC_STALE_AFTER_MS
  );
}

export function isRunInProgress(
  run: { readonly status: string; readonly startedAt: Date },
  now: Date,
): boolean {
  return (
    run.status === 'running' && now.getTime() - run.startedAt.getTime() < SYNC_RUN_STALE_AFTER_MS
  );
}

/** True when removing `toDelete` of `stored` tickets looks like a real clean-up, not a glitch. */
export function isSafeDeletion(toDelete: number, stored: number): boolean {
  if (toDelete <= DELETE_GUARD_FLOOR) return true;
  return toDelete <= stored * MAX_DELETE_SHARE;
}

/** Whether opening a page should start a background sync (D-035). */
export function shouldTriggerLazySync(history: SyncHistory, now: Date): boolean {
  if (history.running || !isStale(history.lastSuccessAt, now)) return false;
  const recentlyTried =
    history.lastAttemptAt !== null &&
    now.getTime() - history.lastAttemptAt.getTime() < LAZY_SYNC_MIN_INTERVAL_MS;
  return !recentlyTried;
}

/**
 * Lower bound for the incremental search (`updated >= …`). Null means there is no successful sync
 * yet, so a full load is needed.
 */
export function incrementalSince(lastSuccessAt: Date | null): Date | null {
  return lastSuccessAt === null ? null : new Date(lastSuccessAt.getTime() - INCREMENTAL_OVERLAP_MS);
}
