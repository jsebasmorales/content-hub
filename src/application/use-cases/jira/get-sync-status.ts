import type { Clock } from '@application/ports/services';
import type { SyncRunRepository } from '@application/ports/sync';
import { isRunInProgress, isStale } from '@domain/jira/sync-policy';

export interface SyncStatus {
  /** Shown as "Última actualización" (D-038). Null until the first sync succeeds. */
  readonly lastUpdateAt: Date | null;
  /** True when the most recent attempt failed, so stale data is not mistaken for fresh data. */
  readonly lastAttemptFailed: boolean;
  /** Short and safe to show to the Leader. */
  readonly lastError: string | null;
  readonly running: boolean;
  readonly stale: boolean;
}

/** What every dashboard page needs to say how fresh its data is. Reads only. */
export class GetSyncStatus {
  constructor(private readonly deps: { readonly runs: SyncRunRepository; readonly clock: Clock }) {}

  async execute(): Promise<SyncStatus> {
    const { runs, clock } = this.deps;
    const now = clock.now();
    const [success, latest, running] = await Promise.all([
      runs.latestSucceeded(),
      runs.latest(),
      runs.findRunning(),
    ]);
    const lastUpdateAt = success?.finishedAt ?? null;
    const failed = latest?.status === 'failed';
    return {
      lastUpdateAt,
      lastAttemptFailed: failed,
      lastError: failed ? latest.error : null,
      running: running !== null && isRunInProgress(running, now),
      stale: isStale(lastUpdateAt, now),
    };
  }
}
