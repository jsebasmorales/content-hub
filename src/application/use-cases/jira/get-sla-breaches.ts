import type { PermissionSet } from '@domain/access/permission-set';
import type { Quarter } from '@domain/jira/quarter';
import {
  recentQuarters,
  resolvePeriod,
  type RawPeriod,
  type ResolvedPeriod,
} from '@domain/jira/report-period';
import {
  buildBreachReport,
  matchesBreachFilter,
  sanitizeBreachFilter,
  type BreachFilter,
  type BreachOptions,
  type BreachRow,
  type BreachSummary,
} from '@domain/jira/sla-breaches';
import { paginate, type PageOf } from '@domain/jira/task-list';
import { err, ok, type Result } from '@shared/result';
import type { IssueRepository } from '../../ports/jira';
import type { Clock } from '../../ports/services';

export interface BreachesInput {
  readonly period: RawPeriod;
  /** As the address bar sent them: not trusted until sanitised. */
  readonly filter: Partial<Record<keyof BreachFilter, string | null | undefined>>;
  readonly page: number;
}

export interface BreachesPage {
  readonly now: Date;
  readonly resolved: ResolvedPeriod;
  readonly quarters: readonly Quarter[];
  /** Summary of the whole period, before the filters narrow the list. */
  readonly summary: BreachSummary;
  readonly options: BreachOptions;
  readonly filter: BreachFilter;
  readonly rows: PageOf<BreachRow>;
}

/** Data for /incumplimientos: every SLA cycle that missed its goal in the period, worst first. */
export class GetSlaBreaches {
  constructor(private readonly deps: { readonly issues: IssueRepository; readonly clock: Clock }) {}

  async execute(
    permissions: PermissionSet,
    input: BreachesInput,
  ): Promise<Result<BreachesPage, 'forbidden'>> {
    if (!permissions.has('section.breach')) return err('forbidden');
    const now = this.deps.clock.now();
    const resolved = resolvePeriod(input.period, now);
    const [tickets, records] = await Promise.all([
      this.deps.issues.listTickets(),
      this.deps.issues.listSlaCycles(),
    ]);
    const report = buildBreachReport({ tickets, records, range: resolved.period.range, now });
    const filter = sanitizeBreachFilter(input.filter, report.options);
    const matching = report.rows.filter((row) => matchesBreachFilter(row, filter));
    return ok({
      now,
      resolved,
      quarters: recentQuarters(now),
      summary: report.summary,
      options: report.options,
      filter,
      rows: paginate(matching, input.page),
    });
  }
}
