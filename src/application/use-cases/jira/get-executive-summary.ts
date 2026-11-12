import type { PermissionSet } from '@domain/access/permission-set';
import { buildExecutiveSummary, type ExecutiveSummary } from '@domain/jira/executive-summary';
import { err, ok, type Result } from '@shared/result';
import type { IssueRepository } from '../../ports/jira';
import type { Clock } from '../../ports/services';

export interface GetExecutiveSummaryDeps {
  readonly issues: IssueRepository;
  readonly clock: Clock;
}

/**
 * Figures for the executive page, read from the cached tickets (never from Jira, SDD §6.1).
 * The section permission is checked here as well as by the route, so the use case is safe
 * to reuse from anywhere (SDD §10.3, layered checks).
 */
export class GetExecutiveSummary {
  constructor(private readonly deps: GetExecutiveSummaryDeps) {}

  async execute(permissions: PermissionSet): Promise<Result<ExecutiveSummary, 'forbidden'>> {
    if (!permissions.has('section.exec')) return err('forbidden');
    const [tickets, stored] = await Promise.all([
      this.deps.issues.listTickets(),
      this.deps.issues.listSlaCycles(),
    ]);
    return ok(
      buildExecutiveSummary({
        tickets,
        cycles: stored.map((item) => item.cycle),
        now: this.deps.clock.now(),
      }),
    );
  }
}
