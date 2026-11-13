import type { PermissionSet } from '@domain/access/permission-set';
import type { RawGlobalFilter } from '@domain/jira/global-filter';
import type { Granularity } from '@domain/jira/period-window';
import { buildSlaReport, type SlaReport } from '@domain/jira/sla-report';
import { err, ok, type Result } from '@shared/result';
import { planChart, prepareReport, type FilterPanel, type ReportDeps } from './report-context';

export interface SlaPage {
  /** The moment the report was built, for "vence en…" style texts. */
  readonly now: Date;
  readonly panel: FilterPanel;
  readonly report: SlaReport;
  readonly granularity: Granularity;
}

/** Data for /sla: compliance over the chosen period, its breakdowns and the clocks running now. */
export class GetSlaReport {
  constructor(private readonly deps: ReportDeps) {}

  async execute(
    permissions: PermissionSet,
    raw: RawGlobalFilter,
  ): Promise<Result<SlaPage, 'forbidden'>> {
    if (!permissions.has('section.sla')) return err('forbidden');
    const context = await prepareReport(this.deps, raw);
    const { window } = context.panel.filter;
    // A percentage over a single day of one to three cycles is noise, so weeks are the finest bar.
    const chart = planChart(window, 'weekly');
    return ok({
      now: context.now,
      panel: context.panel,
      report: buildSlaReport({
        tickets: context.tickets,
        records: context.records,
        range: window.range,
        buckets: chart.buckets,
        trimLeadingEmpty: true,
        now: context.now,
      }),
      granularity: chart.granularity,
    });
  }
}
