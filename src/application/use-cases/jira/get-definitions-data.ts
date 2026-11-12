import type { PermissionSet } from '@domain/access/permission-set';
import { buildDataQuality, type DataQuality } from '@domain/jira/data-quality';
import { err, ok, type Result } from '@shared/result';
import type { IssueRepository } from '../../ports/jira';
import type { Clock } from '../../ports/services';
import type { SyncRunRepository } from '../../ports/sync';
import { GetSyncStatus, type SyncStatus } from './get-sync-status';

export interface DefinitionsData {
  /** The cut-off date: when the data was last refreshed from Jira. */
  readonly status: SyncStatus;
  /** Counts only, never people or tickets, so every role may see them. */
  readonly quality: DataQuality;
}

/**
 * The live part of /definiciones: the date the data is cut at and how complete it is. The wording of
 * the definitions is fixed text; these two blocks are what changes with each sync.
 */
export class GetDefinitionsData {
  private readonly syncStatus: GetSyncStatus;

  constructor(
    private readonly deps: {
      readonly runs: SyncRunRepository;
      readonly issues: IssueRepository;
      readonly clock: Clock;
    },
  ) {
    this.syncStatus = new GetSyncStatus({ runs: deps.runs, clock: deps.clock });
  }

  async execute(permissions: PermissionSet): Promise<Result<DefinitionsData, 'forbidden'>> {
    if (!permissions.has('section.defs')) return err('forbidden');
    const [status, tickets, records] = await Promise.all([
      this.syncStatus.execute(),
      this.deps.issues.listTickets(),
      this.deps.issues.listSlaCycles(),
    ]);
    return ok({ status, quality: buildDataQuality({ tickets, records }) });
  }
}
