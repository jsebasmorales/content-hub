import type { PermissionSet } from '@domain/access/permission-set';
import { bucketsOf } from '@domain/jira/chart-buckets';
import type { ComparisonPlan } from '@domain/jira/comparison';
import type { RawGlobalFilter } from '@domain/jira/global-filter';
import type { Granularity } from '@domain/jira/period-window';
import { buildSummaryReport, type SummaryReport } from '@domain/jira/summary-report';
import { err, ok, type Result } from '@shared/result';
import { planChart, prepareReport, type FilterPanel, type ReportDeps } from './report-context';

export interface SummaryPage {
  readonly now: Date;
  readonly panel: FilterPanel;
  readonly report: SummaryReport;
  readonly granularity: Granularity;
  readonly comparison: ComparisonPlan;
}

/** Data for /resumen: the base view of tickets, open to every role that may see the section. */
export class GetSummary {
  constructor(private readonly deps: ReportDeps) {}

  async execute(
    permissions: PermissionSet,
    raw: RawGlobalFilter,
  ): Promise<Result<SummaryPage, 'forbidden'>> {
    if (!permissions.has('section.summary')) return err('forbidden');
    const context = await prepareReport(this.deps, raw);
    const { window } = context.panel.filter;
    const chart = planChart(window);
    const { comparison } = context;
    const reaches = comparison.volume.coverage !== 'none';
    return ok({
      now: context.now,
      panel: context.panel,
      report: buildSummaryReport({
        tickets: context.tickets,
        range: window.range,
        buckets: chart.buckets,
        trimLeadingEmpty: chart.trimLeadingEmpty && !comparison.yearOn,
        ...(comparison.yearOn
          ? {
              year: reaches
                ? {
                    range: comparison.previous.range,
                    buckets: bucketsOf(comparison.previous, chart.granularity),
                  }
                : null,
            }
          : {}),
      }),
      granularity: chart.granularity,
      comparison,
    });
  }
}
