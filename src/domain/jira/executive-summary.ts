import type { Bucket } from './chart-buckets';
import type { DayWindow } from './period-window';
import { addMonths, startOfMonth, type TimeRange, type YearMonth } from './quarter';
import type { SlaCycle } from './sla';
import { cycleInPeriod, slaCompliance, type SlaCompliance } from './sla-compliance';
import { isDone, type Ticket } from './ticket';

const DAY_MS = 86_400_000;
export const MONTHS_IN_TREND = 6;

/** A figure for the period next to the same figure for the one it is set against. */
export interface Comparison {
  readonly current: number | null;
  readonly previous: number | null;
}

export interface MonthPoint {
  readonly month: YearMonth;
  readonly created: number;
  readonly resolved: number;
}

/** What one bar of the volume chart shows: tickets created and resolved over its days. */
export interface FlowPoint {
  readonly bucket: Bucket;
  readonly created: number;
  readonly resolved: number;
  /** The same bar one year earlier (the comparison is on and the data reaches it). */
  readonly previousCreated?: number;
  readonly previousResolved?: number;
}

export interface RequestTypeCount {
  readonly requestType: string;
  readonly count: number;
  /** Created in the same days one year earlier; only with the comparison on. */
  readonly previousCount?: number;
}

/**
 * What the executive page shows (SDD §5): the period chosen in the global filter, set against
 * another window of the same length (the one the caller passes as `previous`). Volumes are always
 * compared over the same number of days, so a short period is never set against a long one.
 */
export interface ExecutiveSummary {
  /** Days of the period. */
  readonly days: number;
  readonly created: Comparison;
  readonly resolved: Comparison;
  /** Tickets not yet done as of now: a photo of today, not of the period. */
  readonly openNow: number;
  /** Median days from creation to resolution of the tickets resolved in the period. */
  readonly resolutionDays: Comparison;
  readonly sla: SlaCompliance;
  /** Null when the data does not reach the previous side at all. */
  readonly previousSla: SlaCompliance | null;
  /** One entry per bar of the chart, oldest first. */
  readonly flow: readonly FlowPoint[];
  /** Tickets created in the period, most frequent first. */
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

/**
 * Created and resolved per bar. `trimLeadingEmpty` drops the bars before the first one with
 * activity, which is what the monthly charts always did so a long period does not open with empty
 * space; a chart that must line up with another period keeps every bar. A period with no activity
 * at all has no bars.
 */
export function flowPoints(
  tickets: readonly Ticket[],
  buckets: readonly Bucket[],
  trimLeadingEmpty: boolean,
): FlowPoint[] {
  const points = buckets.map((bucket) => ({
    bucket,
    created: createdIn(tickets, bucket.range).length,
    resolved: resolvedIn(tickets, bucket.range).length,
  }));
  const first = points.findIndex((point) => point.created > 0 || point.resolved > 0);
  // Nothing happened in the whole period: no bars at all, so the page can say so instead of drawing zeros.
  if (first === -1) return [];
  return trimLeadingEmpty ? points.slice(first) : points;
}

/**
 * Bars with the bars of another stretch beside them, lined up by position (D-0i): bar 3 of this
 * period against bar 3 of the one a year earlier. Every bar is kept, empty ones included, or the
 * positions would stop matching. Nothing at all happened on either side: no bars.
 */
export function flowPointsCompared(
  tickets: readonly Ticket[],
  buckets: readonly Bucket[],
  previousBuckets: readonly Bucket[],
): FlowPoint[] {
  const points = buckets.map((bucket, index) => {
    const before = previousBuckets[index];
    return {
      bucket,
      created: createdIn(tickets, bucket.range).length,
      resolved: resolvedIn(tickets, bucket.range).length,
      ...(before === undefined
        ? {}
        : {
            previousCreated: createdIn(tickets, before.range).length,
            previousResolved: resolvedIn(tickets, before.range).length,
          }),
    };
  });
  const active = points.some(
    (point) =>
      point.created > 0 ||
      point.resolved > 0 ||
      (point.previousCreated ?? 0) > 0 ||
      (point.previousResolved ?? 0) > 0,
  );
  return active ? points : [];
}

/**
 * Created per request type. With `previous`, a type that had tickets a year ago and none now is
 * listed too (with 0), so the comparison does not hide what disappeared.
 */
export function requestTypeCounts(
  created: readonly Ticket[],
  previous?: readonly Ticket[] | null,
): RequestTypeCount[] {
  const count = (list: readonly Ticket[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const ticket of list) {
      counts.set(ticket.requestType, (counts.get(ticket.requestType) ?? 0) + 1);
    }
    return counts;
  };
  const now = count(created);
  const before = previous === undefined || previous === null ? null : count(previous);
  const names = new Set([...now.keys(), ...(before?.keys() ?? [])]);
  return [...names]
    .map((requestType) => ({
      requestType,
      count: now.get(requestType) ?? 0,
      ...(before === null ? {} : { previousCount: before.get(requestType) ?? 0 }),
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (b.previousCount ?? 0) - (a.previousCount ?? 0) ||
        a.requestType.localeCompare(b.requestType),
    );
}

function complianceIn(cycles: readonly SlaCycle[], range: TimeRange, now: Date): SlaCompliance {
  return slaCompliance(
    cycles.filter((cycle) => cycleInPeriod(cycle, range, now)),
    now,
  );
}

/**
 * Pure: the same tickets, cycles and windows at the same moment always give the same summary.
 * `tickets` and `cycles` arrive already narrowed to the request types of the filter.
 */
export function buildExecutiveSummary(input: {
  tickets: readonly Ticket[];
  cycles: readonly SlaCycle[];
  current: DayWindow;
  previous: DayWindow;
  buckets: readonly Bucket[];
  trimLeadingEmpty?: boolean;
  /**
   * The comparison with the previous year is on: the bars are lined up with those of the previous
   * side (none are dropped) and each request type carries its previous count. `volume` and `sla` say
   * whether the data reaches the previous side at all; when it does not, nothing is computed there.
   */
  year?: { previousBuckets: readonly Bucket[]; volume: boolean; sla: boolean };
  now: Date;
}): ExecutiveSummary {
  const { tickets, cycles, current, previous, buckets, now, year } = input;
  const volume = year?.volume ?? true;
  const createdNow = createdIn(tickets, current.range);
  const createdBefore = volume ? createdIn(tickets, previous.range) : null;
  const resolvedBefore = volume ? resolvedIn(tickets, previous.range) : null;
  return {
    days: current.days,
    created: { current: createdNow.length, previous: createdBefore?.length ?? null },
    resolved: {
      current: resolvedIn(tickets, current.range).length,
      previous: resolvedBefore?.length ?? null,
    },
    openNow: tickets.filter((ticket) => !isDone(ticket)).length,
    resolutionDays: {
      current: medianResolutionDays(resolvedIn(tickets, current.range)),
      previous: resolvedBefore === null ? null : medianResolutionDays(resolvedBefore),
    },
    sla: complianceIn(cycles, current.range, now),
    previousSla: year?.sla === false ? null : complianceIn(cycles, previous.range, now),
    flow:
      year === undefined
        ? flowPoints(tickets, buckets, input.trimLeadingEmpty ?? false)
        : flowPointsCompared(tickets, buckets, volume ? year.previousBuckets : []),
    requestTypes: requestTypeCounts(createdNow, year === undefined ? undefined : createdBefore),
  };
}
