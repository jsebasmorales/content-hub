import type { PermissionSet } from '@domain/access/permission-set';
import type { Quarter } from '@domain/jira/quarter';
import {
  recentQuarters,
  resolvePeriod,
  type RawPeriod,
  type ResolvedPeriod,
} from '@domain/jira/report-period';
import { buildSlaReport, type SlaReport } from '@domain/jira/sla-report';
import { err, ok, type Result } from '@shared/result';
import type { IssueRepository } from '../../ports/jira';
import type { Clock } from '../../ports/services';

export interface SlaPage {
  /** The moment the report was built, for "vence en…" style texts. */
  readonly now: Date;
  readonly resolved: ResolvedPeriod;
  readonly report: SlaReport;
  /** The quarters offered as quick choices, newest first. */
  readonly quarters: readonly Quarter[];
}

/** Data for /sla: compliance over the chosen period, its breakdowns and the clocks running now. */
export class GetSlaReport {
  constructor(private readonly deps: { readonly issues: IssueRepository; readonly clock: Clock }) {}

  async execute(permissions: PermissionSet, raw: RawPeriod): Promise<Result<SlaPage, 'forbidden'>> {
    if (!permissions.has('section.sla')) return err('forbidden');
    const now = this.deps.clock.now();
    const resolved = resolvePeriod(raw, now);
    const [tickets, records] = await Promise.all([
      this.deps.issues.listTickets(),
      this.deps.issues.listSlaCycles(),
    ]);
    return ok({
      now,
      resolved,
      report: buildSlaReport({ tickets, records, range: resolved.period.range, now }),
      quarters: recentQuarters(now),
    });
  }
}
