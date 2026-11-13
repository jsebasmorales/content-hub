import { bucketsOf, type Bucket } from '@domain/jira/chart-buckets';
import { planComparison, type ComparisonPlan, type DataStart } from '@domain/jira/comparison';
import {
  filterRecordsByTypes,
  filterTicketsByTypes,
  resolveGlobalFilter,
  type RawGlobalFilter,
  type ResolvedFilter,
} from '@domain/jira/global-filter';
import {
  dayOf,
  granularityFor,
  type DayWindow,
  type Granularity,
} from '@domain/jira/period-window';
import { monthOf, type YearMonthDay } from '@domain/jira/quarter';
import type { SlaCycleRecord } from '@domain/jira/sla-report';
import { summaryTypeOptions } from '@domain/jira/summary-report';
import type { FilterOption } from '@domain/jira/task-list';
import type { Ticket } from '@domain/jira/ticket';
import type { IssueRepository } from '../../ports/jira';
import type { Clock } from '../../ports/services';

/**
 * The comparison with the previous year is drawn by every report page or by none (D-0k): the
 * switch only appears, and `comparar` is only read, once this is true.
 */
export const COMPARE_ENABLED = false;

export interface ReportDeps {
  readonly issues: IssueRepository;
  readonly clock: Clock;
  /** Tests turn the switch on; the application leaves it as `COMPARE_ENABLED`. */
  readonly compareEnabled?: boolean;
}

/** What the filter card of a page needs to draw itself. */
export interface FilterPanel {
  readonly filter: ResolvedFilter;
  /** The request types that exist, with how many tickets each has: the box of choices. */
  readonly typeOptions: readonly FilterOption[];
  /** Years offered next to the quarter chips, newest first. */
  readonly years: readonly number[];
  /** Today in the reporting time zone: the page hands it to its script so the browser's clock is never used. */
  readonly today: YearMonthDay;
  readonly compareAvailable: boolean;
}

export interface ReportContext {
  readonly now: Date;
  readonly panel: FilterPanel;
  /** Tickets and cycles narrowed to the request types of the filter. */
  readonly tickets: readonly Ticket[];
  readonly records: readonly SlaCycleRecord[];
  /** What the previous side is, and how much of it the data covers. */
  readonly comparison: ComparisonPlan;
}

/** The first record of each kind, over everything (not narrowed to the request types chosen). */
export function dataStartOf(
  tickets: readonly Ticket[],
  records: readonly SlaCycleRecord[],
): DataStart {
  const earliest = (moments: readonly Date[]): Date | null =>
    moments.length === 0 ? null : new Date(Math.min(...moments.map((moment) => moment.getTime())));
  return {
    tickets: earliest(tickets.map((ticket) => ticket.createdAt)),
    cycles: earliest(records.map((record) => record.cycle.startedAt)),
  };
}

/** The years from the oldest ticket to this one, newest first; this year alone when there is none. */
export function yearsOffered(tickets: readonly Ticket[], now: Date): number[] {
  const current = monthOf(now).year;
  const oldest = tickets.reduce<number>(
    (year, ticket) => Math.min(year, monthOf(ticket.createdAt).year),
    current,
  );
  return Array.from({ length: current - oldest + 1 }, (_, i) => current - i);
}

/**
 * The two reads every report page makes (tickets and SLA cycles), the filter resolved against what
 * exists, and both narrowed to the request types chosen. Never more than two queries, however many
 * windows the page then computes from them.
 */
export async function prepareReport(
  deps: ReportDeps,
  raw: RawGlobalFilter,
): Promise<ReportContext> {
  const now = deps.clock.now();
  const [allTickets, stored] = await Promise.all([
    deps.issues.listTickets(),
    deps.issues.listSlaCycles(),
  ]);
  const typeOptions = summaryTypeOptions(allTickets);
  const compareAvailable = deps.compareEnabled ?? COMPARE_ENABLED;
  const filter = resolveGlobalFilter(raw, {
    now,
    knownTypes: typeOptions.map((option) => option.value),
    compareAvailable,
  });
  return {
    now,
    panel: {
      filter,
      typeOptions,
      years: yearsOffered(allTickets, now),
      today: dayOf(now),
      compareAvailable,
    },
    tickets: filterTicketsByTypes(allTickets, filter.types),
    records: filterRecordsByTypes(stored, allTickets, filter.types),
    comparison: planComparison(filter.window, filter.compare, dataStartOf(allTickets, stored)),
  };
}

export interface ChartPlan {
  readonly granularity: Granularity;
  readonly buckets: readonly Bucket[];
  /** Month-by-month charts of a long period skip the empty months before the data begins. */
  readonly trimLeadingEmpty: boolean;
}

/** How a period is split into bars. SLA percentages ask for weeks at the finest. */
export function planChart(window: DayWindow, minimum: Granularity = 'daily'): ChartPlan {
  const granularity = granularityFor(window.days, minimum);
  return {
    granularity,
    buckets: bucketsOf(window, granularity),
    trimLeadingEmpty: granularity === 'monthly',
  };
}
