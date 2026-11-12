import {
  REPORTING_TIME_ZONE,
  addMonths,
  monthOf,
  previousQuarter,
  quarterOf,
  quarterRange,
  startOfMonth,
  type Quarter,
  type TimeRange,
  type YearMonth,
} from './quarter';
import type { SlaCycle } from './sla';
import { cycleInPeriod, slaCompliance, type SlaCompliance } from './sla-compliance';
import { isDone, type Ticket } from './ticket';

const DAY_MS = 86_400_000;
export const MONTHS_IN_TREND = 6;

/** A figure for this quarter next to the same figure for the previous one. */
export interface Comparison {
  readonly current: number | null;
  readonly previous: number | null;
}

export interface MonthPoint {
  readonly month: YearMonth;
  readonly created: number;
  readonly resolved: number;
}

export interface RequestTypeCount {
  readonly requestType: string;
  readonly count: number;
}

/**
 * What the executive page shows (SDD §5): the current quarter, set against the one before.
 * Volumes (`created`, `resolved`, `resolutionDays`) compare the quarter so far with the SAME
 * stretch of the previous quarter, not with all of it: six weeks of T4 against three full months
 * of T3 would always read as a collapse that never happened.
 */
export interface ExecutiveSummary {
  readonly quarter: Quarter;
  readonly previousQuarter: Quarter;
  /** Days of the current quarter that have passed, which is also the stretch compared. */
  readonly elapsedDays: number;
  readonly created: Comparison;
  readonly resolved: Comparison;
  /** Tickets not yet done as of now. */
  readonly openNow: number;
  /** Median days from creation to resolution of the tickets resolved in the quarter. */
  readonly resolutionDays: Comparison;
  readonly sla: SlaCompliance;
  readonly previousSla: SlaCompliance;
  /** Oldest month first, ending with the current one. */
  readonly months: readonly MonthPoint[];
  /** Tickets created in the quarter, most frequent first. */
  readonly requestTypes: readonly RequestTypeCount[];
}

const within = (moment: Date | null, range: TimeRange): boolean =>
  moment !== null &&
  moment.getTime() >= range.from.getTime() &&
  moment.getTime() < range.to.getTime();

export const createdIn = (tickets: readonly Ticket[], range: TimeRange): Ticket[] =>
  tickets.filter((ticket) => within(ticket.createdAt, range));

export const resolvedIn = (tickets: readonly Ticket[], range: TimeRange): Ticket[] =>
  tickets.filter((ticket) => within(ticket.resolvedAt, range));

/** The middle value, so a few very old tickets do not distort the "typical" time. */
export function medianResolutionDays(resolved: readonly Ticket[]): number | null {
  const days = resolved
    .flatMap((ticket) =>
      ticket.resolvedAt === null
        ? []
        : [(ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / DAY_MS],
    )
    .sort((a, b) => a - b);
  if (days.length === 0) return null;
  const middle = Math.floor(days.length / 2);
  const value =
    days.length % 2 === 1 ? days[middle] : ((days[middle - 1] ?? 0) + (days[middle] ?? 0)) / 2;
  return value === undefined ? null : Math.round(value * 10) / 10;
}

export function monthPoint(tickets: readonly Ticket[], month: YearMonth, zone: string): MonthPoint {
  const range = { from: startOfMonth(month, zone), to: startOfMonth(addMonths(month, 1), zone) };
  return {
    month,
    created: createdIn(tickets, range).length,
    resolved: resolvedIn(tickets, range).length,
  };
}

function requestTypeCounts(created: readonly Ticket[]): RequestTypeCount[] {
  const counts = new Map<string, number>();
  for (const ticket of created) {
    counts.set(ticket.requestType, (counts.get(ticket.requestType) ?? 0) + 1);
  }
  return [...counts]
    .map(([requestType, count]) => ({ requestType, count }))
    .sort((a, b) => b.count - a.count || a.requestType.localeCompare(b.requestType));
}

function complianceIn(cycles: readonly SlaCycle[], range: TimeRange, now: Date): SlaCompliance {
  return slaCompliance(
    cycles.filter((cycle) => cycleInPeriod(cycle, range, now)),
    now,
  );
}

/** Pure: the same tickets and cycles at the same moment always give the same summary. */
export function buildExecutiveSummary(
  input: { tickets: readonly Ticket[]; cycles: readonly SlaCycle[]; now: Date },
  zone: string = REPORTING_TIME_ZONE,
): ExecutiveSummary {
  const { tickets, cycles, now } = input;
  const quarter = quarterOf(now, zone);
  const before = previousQuarter(quarter);
  const range = quarterRange(quarter, zone);
  const beforeRange = quarterRange(before, zone);
  const current = monthOf(now, zone);
  const elapsedMs = now.getTime() - range.from.getTime();
  // The same stretch of the previous quarter (its first `elapsedMs`), never past its end.
  const sameStretch: TimeRange = {
    from: beforeRange.from,
    to: new Date(Math.min(beforeRange.to.getTime(), beforeRange.from.getTime() + elapsedMs)),
  };

  return {
    quarter,
    previousQuarter: before,
    elapsedDays: Math.max(1, Math.ceil(elapsedMs / DAY_MS)),
    created: {
      current: createdIn(tickets, range).length,
      previous: createdIn(tickets, sameStretch).length,
    },
    resolved: {
      current: resolvedIn(tickets, range).length,
      previous: resolvedIn(tickets, sameStretch).length,
    },
    openNow: tickets.filter((ticket) => !isDone(ticket)).length,
    resolutionDays: {
      current: medianResolutionDays(resolvedIn(tickets, range)),
      previous: medianResolutionDays(resolvedIn(tickets, sameStretch)),
    },
    sla: complianceIn(cycles, range, now),
    previousSla: complianceIn(cycles, beforeRange, now),
    months: Array.from({ length: MONTHS_IN_TREND }, (_, i) =>
      monthPoint(tickets, addMonths(current, i - (MONTHS_IN_TREND - 1)), zone),
    ),
    requestTypes: requestTypeCounts(createdIn(tickets, range)),
  };
}
