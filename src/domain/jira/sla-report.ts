import {
  REPORTING_TIME_ZONE,
  addMonths,
  intersectRanges,
  monthOf,
  startOfMonth,
  type TimeRange,
  type YearMonth,
} from './quarter';
import { cycleOutcome, type SlaCycle, type SlaMetric } from './sla';
import { cycleInPeriod, slaCompliance, type SlaCompliance } from './sla-compliance';
import { isDone, isObsoleteRequestType, type Ticket } from './ticket';

/** A cycle with the key of the ticket it belongs to. */
export interface SlaCycleRecord {
  readonly ticketKey: string;
  readonly cycle: SlaCycle;
}

export interface MonthCompliance {
  readonly month: YearMonth;
  readonly compliance: SlaCompliance;
}

export interface RequestTypeCompliance {
  readonly requestType: string;
  readonly compliance: SlaCompliance;
  /** Cycles measured, both metrics together: used to rank the rows. */
  readonly measured: number;
}

/** A running clock, for the "ciclos en curso" list. Paused clocks are not in it. */
export interface OngoingCycle {
  readonly ticketKey: string;
  readonly summary: string;
  readonly assigneeName: string | null;
  readonly metric: SlaMetric;
  readonly breachAt: Date | null;
  /** Already past its limit, so it will count as breached. */
  readonly breached: boolean;
}

export interface SlaReport {
  readonly overall: SlaCompliance;
  readonly byMonth: readonly MonthCompliance[];
  readonly byRequestType: readonly RequestTypeCompliance[];
  /**
   * Running clocks of tickets that are still open, most urgent first. Independent of the chosen
   * period: they are about now.
   */
  readonly ongoing: readonly OngoingCycle[];
  /** Open tickets whose clock is paused: not shown, not counted as breached. */
  readonly pausedCount: number;
  /**
   * Cycles still open on tickets that are already done. Jira keeps counting them, but nobody can
   * act on them, so they are reported as a number and not listed.
   */
  readonly closedWithOpenClockCount: number;
}

/** The most months the monthly breakdown draws; a longer period shows its latest ones. */
export const MAX_MONTHS_SHOWN = 36;

/** The calendar months the range touches, oldest first. */
export function monthsIn(range: TimeRange, zone: string): YearMonth[] {
  const last = monthOf(new Date(range.to.getTime() - 1), zone);
  const months: YearMonth[] = [];
  let month = monthOf(range.from, zone);
  while (months.length < 1000) {
    months.push(month);
    if (month.year === last.year && month.month === last.month) break;
    month = addMonths(month, 1);
  }
  return months.slice(-MAX_MONTHS_SHOWN);
}

const monthIndex = (month: YearMonth): number => month.year * 12 + month.month;

/**
 * One row per month the period touches, but only from the first month with something measured
 * up to the current one: months before the data begins and months that have not happened yet
 * would only draw empty space and push the real data out of sight.
 */
function byMonth(
  records: readonly SlaCycleRecord[],
  range: TimeRange,
  now: Date,
  zone: string,
): MonthCompliance[] {
  const current = monthIndex(monthOf(now, zone));
  const upToNow = monthsIn(range, zone).filter((month) => monthIndex(month) <= current);
  const rows = upToNow.map((month) => {
    const monthRange = {
      from: startOfMonth(month, zone),
      to: startOfMonth(addMonths(month, 1), zone),
    };
    // A month cut by the start or end of the period only counts the days inside it.
    const inside = intersectRanges(monthRange, range);
    const cycles = records.map((r) => r.cycle).filter((c) => cycleInPeriod(c, inside, now));
    return { month, compliance: slaCompliance(cycles, now) };
  });
  const measured = (row: MonthCompliance): boolean =>
    row.compliance.metrics.some((m) => m.total > 0);
  const firstWithData = rows.findIndex(measured);
  return firstWithData === -1 ? [] : rows.slice(firstWithData);
}

function byRequestType(
  records: readonly SlaCycleRecord[],
  tickets: ReadonlyMap<string, Ticket>,
  now: Date,
): RequestTypeCompliance[] {
  const groups = new Map<string, SlaCycle[]>();
  for (const { ticketKey, cycle } of records) {
    const type = tickets.get(ticketKey)?.requestType;
    if (type === undefined || isObsoleteRequestType(type)) continue;
    groups.set(type, [...(groups.get(type) ?? []), cycle]);
  }
  return [...groups]
    .map(([requestType, cycles]) => {
      const compliance = slaCompliance(cycles, now);
      const measured = compliance.metrics.reduce((sum, m) => sum + m.total, 0);
      return { requestType, compliance, measured };
    })
    .filter((row) => row.measured > 0)
    .sort((a, b) => b.measured - a.measured || a.requestType.localeCompare(b.requestType, 'es'));
}

function ongoingCycles(
  records: readonly SlaCycleRecord[],
  tickets: ReadonlyMap<string, Ticket>,
  now: Date,
): { ongoing: OngoingCycle[]; pausedCount: number; closedWithOpenClockCount: number } {
  const ongoing: OngoingCycle[] = [];
  let pausedCount = 0;
  let closedWithOpenClockCount = 0;
  for (const { ticketKey, cycle } of records) {
    if (cycle.state !== 'ongoing') continue;
    const ticket = tickets.get(ticketKey);
    if (!ticket) continue;
    // A finished ticket whose clock never stopped (no customer-facing comment, say) cannot be
    // acted on, so it is counted apart instead of crowding the list of live work.
    if (isDone(ticket)) {
      closedWithOpenClockCount += 1;
      continue;
    }
    if (cycle.paused) {
      pausedCount += 1;
      continue;
    }
    ongoing.push({
      ticketKey,
      summary: ticket.summary,
      assigneeName: ticket.assigneeName,
      metric: cycle.metric,
      breachAt: cycle.breachAt,
      breached: cycleOutcome(cycle, now) === 'breached',
    });
  }
  // Earliest limit first; a clock with no known limit goes last.
  ongoing.sort(
    (a, b) =>
      (a.breachAt?.getTime() ?? Number.POSITIVE_INFINITY) -
        (b.breachAt?.getTime() ?? Number.POSITIVE_INFINITY) ||
      a.ticketKey.localeCompare(b.ticketKey),
  );
  return { ongoing, pausedCount, closedWithOpenClockCount };
}

/** Pure: the same data at the same moment always gives the same report. */
export function buildSlaReport(
  input: {
    tickets: readonly Ticket[];
    records: readonly SlaCycleRecord[];
    range: TimeRange;
    now: Date;
  },
  zone: string = REPORTING_TIME_ZONE,
): SlaReport {
  const { tickets, records, range, now } = input;
  const byKey = new Map(tickets.map((ticket) => [ticket.key, ticket]));
  const inPeriod = records.filter((r) => cycleInPeriod(r.cycle, range, now));
  return {
    overall: slaCompliance(
      inPeriod.map((r) => r.cycle),
      now,
    ),
    byMonth: byMonth(records, range, now, zone),
    byRequestType: byRequestType(inPeriod, byKey, now),
    ...ongoingCycles(records, byKey, now),
  };
}
