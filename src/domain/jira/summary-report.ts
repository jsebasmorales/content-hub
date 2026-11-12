import { createdIn, medianResolutionDays, resolvedIn } from './executive-summary';
import {
  REPORTING_TIME_ZONE,
  addMonths,
  intersectRanges,
  monthOf,
  startOfMonth,
  type TimeRange,
  type YearMonth,
} from './quarter';
import { monthsIn } from './sla-report';
import type { FilterOption } from './task-list';
import { isDone, isObsoleteRequestType, type Ticket } from './ticket';

/** One month of the period: what was created and completed in it. Edge months count only their days inside. */
export interface MonthFlow {
  readonly month: YearMonth;
  readonly created: number;
  readonly resolved: number;
}

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
  /** One entry per month, from the first one with activity to the current one. */
  readonly months: readonly MonthFlow[];
  /** Most created first. Retired request types are left out of this table (not out of the totals). */
  readonly byType: readonly TypeSummary[];
}

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

function monthFlows(
  tickets: readonly Ticket[],
  range: TimeRange,
  now: Date,
  zone: string,
): MonthFlow[] {
  const current = monthOf(now, zone);
  const currentIndex = current.year * 12 + current.month;
  const flows = monthsIn(range, zone)
    .filter((month) => month.year * 12 + month.month <= currentIndex)
    .map((month) => {
      const inside = intersectRanges(
        { from: startOfMonth(month, zone), to: startOfMonth(addMonths(month, 1), zone) },
        range,
      );
      return {
        month,
        created: createdIn(tickets, inside).length,
        resolved: resolvedIn(tickets, inside).length,
      };
    });
  const first = flows.findIndex((flow) => flow.created > 0 || flow.resolved > 0);
  return first === -1 ? [] : flows.slice(first);
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

/**
 * Pure: the base view of tickets for a period: how many were created and completed, how many are
 * open now, month by month and by request type. `tickets` is already filtered by type when the
 * person chose one, so every figure on the page agrees with the filter.
 */
export function buildSummaryReport(
  input: { tickets: readonly Ticket[]; range: TimeRange; now: Date },
  zone: string = REPORTING_TIME_ZONE,
): SummaryReport {
  const { tickets, range, now } = input;
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
    months: monthFlows(tickets, range, now, zone),
    byType: typeSummaries(tickets, range),
  };
}
