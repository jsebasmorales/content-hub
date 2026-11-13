import type { PermissionSet } from '@domain/access/permission-set';
import { buildExecutiveSummary, type ExecutiveSummary } from '@domain/jira/executive-summary';
import type { RawGlobalFilter } from '@domain/jira/global-filter';
import { previousPeriodWindow, type DayWindow, type Granularity } from '@domain/jira/period-window';
import { err, ok, type Result } from '@shared/result';
import { planChart, prepareReport, type FilterPanel, type ReportDeps } from './report-context';

export interface ExecutivePage {
  readonly now: Date;
  readonly panel: FilterPanel;
  readonly summary: ExecutiveSummary;
  /** The days the figures are set against. */
  readonly previous: DayWindow;
  readonly granularity: Granularity;
}

/**
 * Figures for the executive page, read from the cached tickets (never from Jira, SDD §6.1). The
 * period and the request types come from the global filter. The section permission is checked here
 * as well as by the route, so the use case is safe to reuse from anywhere (SDD §10.3).
 */
export class GetExecutiveSummary {
  constructor(private readonly deps: ReportDeps) {}

  async execute(
    permissions: PermissionSet,
    raw: RawGlobalFilter,
  ): Promise<Result<ExecutivePage, 'forbidden'>> {
    if (!permissions.has('section.exec')) return err('forbidden');
    const context = await prepareReport(this.deps, raw);
    const { window } = context.panel.filter;
    const previous = previousPeriodWindow(window);
    const chart = planChart(window);
    return ok({
      now: context.now,
      panel: context.panel,
      summary: buildExecutiveSummary({
        tickets: context.tickets,
        cycles: context.records.map((record) => record.cycle),
        current: window,
        previous,
        buckets: chart.buckets,
        trimLeadingEmpty: chart.trimLeadingEmpty,
        now: context.now,
      }),
      previous,
      granularity: chart.granularity,
    });
  }
}
