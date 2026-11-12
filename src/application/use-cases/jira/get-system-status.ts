import type { PermissionSet } from '@domain/access/permission-set';
import { buildDataQuality, type DataQuality } from '@domain/jira/data-quality';
import { err, ok, type Result } from '@shared/result';
import type { IssueRepository } from '../../ports/jira';
import type { Clock } from '../../ports/services';
import type { SyncRun, SyncRunRepository } from '../../ports/sync';
import { GetSyncStatus, type SyncStatus } from './get-sync-status';

/** How many past runs the status page lists. */
export const RUNS_LISTED = 20;

export interface SystemStatus {
  readonly status: SyncStatus;
  /** Newest first. */
  readonly runs: readonly SyncRun[];
  readonly quality: DataQuality;
}

export interface GetSystemStatusDeps {
  readonly runs: SyncRunRepository;
  readonly issues: IssueRepository;
  readonly clock: Clock;
}

/**
 * Data for /estado: how fresh the data is, what the last syncs did and what the cache looks like.
 * Shown to whoever may request a sync, because they are the ones who act on it.
 */
export class GetSystemStatus {
  private readonly syncStatus: GetSyncStatus;

  constructor(private readonly deps: GetSystemStatusDeps) {
    this.syncStatus = new GetSyncStatus({ runs: deps.runs, clock: deps.clock });
  }

  async execute(permissions: PermissionSet): Promise<Result<SystemStatus, 'forbidden'>> {
    if (!permissions.has('action.sync')) return err('forbidden');
    const [status, runs, tickets, stored] = await Promise.all([
      this.syncStatus.execute(),
      this.deps.runs.recent(RUNS_LISTED),
      this.deps.issues.listTickets(),
      this.deps.issues.listSlaCycles(),
    ]);
    return ok({ status, runs, quality: buildDataQuality({ tickets, records: stored }) });
  }
}
