import type { PermissionSet } from '@domain/access/permission-set';
import { TEAM_MEMBERS, buildCapacityReport, type CapacityReport } from '@domain/jira/capacity';
import { err, ok, type Result } from '@shared/result';
import type { IssueRepository } from '../../ports/jira';
import type { Clock } from '../../ports/services';

/** Data for /capacidad: how open work is spread over people, and how work arrives and leaves. */
export class GetCapacity {
  constructor(
    private readonly deps: {
      readonly issues: IssueRepository;
      readonly clock: Clock;
      /** The people studied; the configured team unless a test says otherwise. */
      readonly team?: readonly string[];
    },
  ) {}

  async execute(permissions: PermissionSet): Promise<Result<CapacityReport, 'forbidden'>> {
    if (!permissions.has('section.capacity')) return err('forbidden');
    const tickets = await this.deps.issues.listTickets();
    const team = this.deps.team ?? TEAM_MEMBERS;
    return ok(buildCapacityReport({ tickets, now: this.deps.clock.now(), team }));
  }
}
