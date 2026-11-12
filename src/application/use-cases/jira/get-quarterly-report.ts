import type { PermissionSet } from '@domain/access/permission-set';
import { buildQuarterlyReport, type QuarterlyReport } from '@domain/jira/quarterly';
import { err, ok, type Result } from '@shared/result';
import type { IssueRepository } from '../../ports/jira';
import type { Clock } from '../../ports/services';

/** Data for /trimestres: the same figures for each of the last quarters. */
export class GetQuarterlyReport {
  constructor(private readonly deps: { readonly issues: IssueRepository; readonly clock: Clock }) {}

  async execute(permissions: PermissionSet): Promise<Result<QuarterlyReport, 'forbidden'>> {
    if (!permissions.has('section.qoq')) return err('forbidden');
    const [tickets, stored] = await Promise.all([
      this.deps.issues.listTickets(),
      this.deps.issues.listSlaCycles(),
    ]);
    return ok(
      buildQuarterlyReport({
        tickets,
        cycles: stored.map((item) => item.cycle),
        now: this.deps.clock.now(),
      }),
    );
  }
}
