import type { PermissionSet } from '@domain/access/permission-set';
import { bucketsOf } from '@domain/jira/chart-buckets';
import type { ComparisonPlan } from '@domain/jira/comparison';
import { buildExecutiveSummary, type ExecutiveSummary } from '@domain/jira/executive-summary';
import type { RawGlobalFilter } from '@domain/jira/global-filter';
import type { DayWindow, Granularity } from '@domain/jira/period-window';
import { err, ok, type Result } from '@shared/result';
import { planChart, prepareReport, type FilterPanel, type ReportDeps } from './report-context';

export interface ExecutivePage {
  readonly now: Date;
  readonly panel: FilterPanel;
  readonly summary: ExecutiveSummary;
  /** The days the figures are set against: the previous period, or with the switch on, the year before. */
  readonly previous: DayWindow;
  readonly comparison: ComparisonPlan;
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
    const { comparison } = context;
    const previous = comparison.previous;
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
        // With the year before beside it, no bar is dropped: the positions have to match.
        trimLeadingEmpty: chart.trimLeadingEmpty && !comparison.yearOn,
        ...(comparison.yearOn
          ? {
              year: {
                previousBuckets: bucketsOf(previous, chart.granularity),
                volume: comparison.volume.coverage !== 'none',
                sla: comparison.sla.coverage !== 'none',
              },
            }
          : {}),
        now: context.now,
      }),
      previous,
      comparison,
      granularity: chart.granularity,
    });
  }
}
