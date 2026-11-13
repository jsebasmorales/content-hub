import type { Bucket } from './chart-buckets';
import {
  createdIn,
  flowPoints,
  flowPointsCompared,
  medianResolutionDays,
  resolvedIn,
  type FlowPoint,
} from './executive-summary';
import type { TimeRange } from './quarter';
import type { FilterOption } from './task-list';
import { isDone, isObsoleteRequestType, type Ticket } from './ticket';

export interface TypeSummary {
  readonly requestType: string;
  readonly created: number;
  readonly resolved: number;
  /** Of what was created in the period, the share already completed. Null when nothing was created. */
  readonly completionPercent: number | null;
  /** Open right now, whenever they were created. */
  readonly openNow: number;
}

export interface OpenNow {
  readonly total: number;
  /** Jira groups these as "in progress": being worked on or waiting on something. */
  readonly inProgress: number;
  readonly notStarted: number;
  /** Open tickets by status, most first. */
  readonly byStatus: readonly { readonly status: string; readonly count: number }[];
}

export interface SummaryReport {
  /** Tickets created in the period. */
  readonly created: number;
  /** Tickets completed in the period, whenever they were created. */
  readonly resolved: number;
  /** Of the tickets created in the period, how many are completed by now. */
  readonly createdAndCompleted: number;
  readonly completionPercent: number | null;
  /** Median days from creation to completion of what was completed in the period. */
  readonly resolutionDays: number | null;
  readonly openNow: OpenNow;
  /** One entry per bar of the chart (day, week or month), oldest first. */
  readonly flow: readonly FlowPoint[];
  /** Most created first. Retired request types are left out of this table (not out of the totals). */
  readonly byType: readonly TypeSummary[];
  /**
   * The same figures one year earlier (the comparison is on and the data reaches it), or null. The
   * open-now figures and the bars of the chart are not repeated there: they are not compared.
   */
  readonly previous: PreviousSummary | null;
}

export type PreviousSummary = Pick<
  SummaryReport,
  'created' | 'resolved' | 'createdAndCompleted' | 'completionPercent' | 'resolutionDays' | 'byType'
>;

const oneDecimal = (value: number): number => Math.round(value * 10) / 10;

const percentOf = (part: number, whole: number): number | null =>
  whole === 0 ? null : oneDecimal((part / whole) * 100);

function openNowOf(tickets: readonly Ticket[]): OpenNow {
  const open = tickets.filter((ticket) => !isDone(ticket));
  const counts = new Map<string, number>();
  for (const ticket of open) counts.set(ticket.status, (counts.get(ticket.status) ?? 0) + 1);
  return {
    total: open.length,
    inProgress: open.filter((ticket) => ticket.statusCategory === 'indeterminate').length,
    notStarted: open.filter((ticket) => ticket.statusCategory === 'new').length,
    byStatus: [...counts]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status, 'es')),
  };
}

function typeSummaries(tickets: readonly Ticket[], range: TimeRange): TypeSummary[] {
  const types = new Set(tickets.map((ticket) => ticket.requestType));
  return [...types]
    .filter((type) => !isObsoleteRequestType(type))
    .map((requestType) => {
      const ofType = tickets.filter((ticket) => ticket.requestType === requestType);
      const created = createdIn(ofType, range);
      return {
        requestType,
        created: created.length,
        resolved: resolvedIn(ofType, range).length,
        completionPercent: percentOf(created.filter(isDone).length, created.length),
        openNow: ofType.filter((ticket) => !isDone(ticket)).length,
      };
    })
    .filter((row) => row.created > 0 || row.resolved > 0 || row.openNow > 0)
    .sort((a, b) => b.created - a.created || a.requestType.localeCompare(b.requestType, 'es'));
}

/** The request types offered in the filter, with how many tickets each has overall. */
export function summaryTypeOptions(tickets: readonly Ticket[]): FilterOption[] {
  const counts = new Map<string, number>();
  for (const ticket of tickets) {
    if (isObsoleteRequestType(ticket.requestType)) continue;
    counts.set(ticket.requestType, (counts.get(ticket.requestType) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

function previousFigures(tickets: readonly Ticket[], range: TimeRange): PreviousSummary {
  const created = createdIn(tickets, range);
  const resolved = resolvedIn(tickets, range);
  const createdAndCompleted = created.filter(isDone).length;
  return {
    created: created.length,
    resolved: resolved.length,
    createdAndCompleted,
    completionPercent: percentOf(createdAndCompleted, created.length),
    resolutionDays: medianResolutionDays(resolved),
    byType: typeSummaries(tickets, range),
  };
}

/**
 * Pure: the base view of tickets for a period: how many were created and completed, how many are
 * open now, bar by bar and by request type. `tickets` is already narrowed to the request types of
 * the global filter, so every figure on the page agrees with it.
 */
export function buildSummaryReport(input: {
  tickets: readonly Ticket[];
  range: TimeRange;
  buckets: readonly Bucket[];
  /** Drop the bars before the first with activity (long periods drawn month by month). */
  trimLeadingEmpty?: boolean;
  /**
   * The previous year, when the comparison is on: its days, and its bars to line up with these. Its
   * bars are all kept (a bar dropped would shift the positions). Null when the data does not reach it.
   */
  year?: { range: TimeRange; buckets: readonly Bucket[] } | null;
}): SummaryReport {
  const { tickets, range } = input;
  const created = createdIn(tickets, range);
  const resolved = resolvedIn(tickets, range);
  const createdAndCompleted = created.filter(isDone).length;
  return {
    created: created.length,
    resolved: resolved.length,
    createdAndCompleted,
    completionPercent: percentOf(createdAndCompleted, created.length),
    resolutionDays: medianResolutionDays(resolved),
    openNow: openNowOf(tickets),
    flow:
      input.year === undefined
        ? flowPoints(tickets, input.buckets, input.trimLeadingEmpty ?? false)
        : flowPointsCompared(tickets, input.buckets, input.year?.buckets ?? []),
    byType: typeSummaries(tickets, range),
    previous: input.year ? previousFigures(tickets, input.year.range) : null,
  };
}
