import type { PermissionSet } from '@domain/access/permission-set';
import type { RawGlobalFilter } from '@domain/jira/global-filter';
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
import { prepareReport, type FilterPanel, type ReportDeps } from './report-context';

export interface BreachesInput {
  /** The global filter: period and request types. */
  readonly global: RawGlobalFilter;
  /** The filters of the list itself, as the address bar sent them: not trusted until sanitised. */
  readonly filter: Partial<Record<keyof BreachFilter, string | null | undefined>>;
  readonly page: number;
}

export interface BreachesPage {
  readonly now: Date;
  readonly panel: FilterPanel;
  /** Summary of the whole period, before the list filters narrow the list. */
  readonly summary: BreachSummary;
  readonly options: BreachOptions;
  readonly filter: BreachFilter;
  readonly rows: PageOf<BreachRow>;
}

/** Data for /incumplimientos: every SLA cycle that missed its goal in the period, worst first. */
export class GetSlaBreaches {
  constructor(private readonly deps: ReportDeps) {}

  async execute(
    permissions: PermissionSet,
    input: BreachesInput,
  ): Promise<Result<BreachesPage, 'forbidden'>> {
    if (!permissions.has('section.breach')) return err('forbidden');
    const context = await prepareReport(this.deps, input.global);
    const { window } = context.panel.filter;
    const report = buildBreachReport({
      tickets: context.tickets,
      records: context.records,
      range: window.range,
      now: context.now,
    });
    const filter = sanitizeBreachFilter(input.filter, report.options);
    const matching = report.rows.filter((row) => matchesBreachFilter(row, filter));
    return ok({
      now: context.now,
      panel: context.panel,
      summary: report.summary,
      options: report.options,
      filter,
      rows: paginate(matching, input.page),
    });
  }
}
