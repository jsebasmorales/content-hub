import {
  dayOf,
  previousPeriodWindow,
  previousYearWindow,
  type DayWindow,
  type PeriodWindow,
} from './period-window';
import type { YearMonthDay } from './quarter';

/**
 * What a period is set against (docs/PLAN_FILTROS.md §2). Pure: it decides which days are the
 * "previous" ones and how much of them the data covers, and reads nothing else.
 *
 * - `previous-year`: the "Comparar" switch is on. The same stretch of the calendar one year earlier,
 *   with the same number of days. Its figures are drawn in the comparison color.
 * - `previous-period`: the switch is off. Only the executive page sets its figures against anything
 *   then (D-0c): the days right before, or the first days of the previous quarter.
 */
export type CompareReference = 'previous-year' | 'previous-period';

/**
 * How much of the previous side the data reaches. `none`: all of it is before the first record, so
 * there is nothing to compare with. `partial`: the data begins inside it, so its figures are a lower
 * bound. `ok`: the whole of it is covered. A previous period (switch off) is always `ok`: that is what
 * the executive page always did, and a zero there is a real zero.
 */
export type Coverage = 'ok' | 'partial' | 'none';

/** The first moment the data has anything, for tickets (volumes) and for SLA cycles. */
export interface DataStart {
  readonly tickets: Date | null;
  readonly cycles: Date | null;
}

export interface SideCoverage {
  readonly coverage: Coverage;
  /** The day the data begins, when it begins inside the previous side (`partial`) or after it (`none`). */
  readonly since: YearMonthDay | null;
}

export interface ComparisonPlan {
  readonly reference: CompareReference;
  /** The switch is on: the previous side is drawn in the comparison color, with its box and legend. */
  readonly yearOn: boolean;
  readonly previous: DayWindow;
  /** Coverage of the figures that come from tickets (created, resolved, time) ... */
  readonly volume: SideCoverage;
  /** ... and of those that come from SLA cycles. */
  readonly sla: SideCoverage;
}

const COVERED: SideCoverage = { coverage: 'ok', since: null };

/** Whether `previous` lies before, across or after the first record. */
export function coverageOf(previous: DayWindow, start: Date | null, zone?: string): SideCoverage {
  if (start === null) return { coverage: 'none', since: null };
  const since = dayOf(start, zone);
  if (start.getTime() >= previous.range.to.getTime()) return { coverage: 'none', since };
  if (start.getTime() > previous.range.from.getTime()) return { coverage: 'partial', since };
  return COVERED;
}

export function planComparison(
  window: PeriodWindow,
  yearOn: boolean,
  start: DataStart,
): ComparisonPlan {
  if (!yearOn) {
    return {
      reference: 'previous-period',
      yearOn: false,
      previous: previousPeriodWindow(window),
      volume: COVERED,
      sla: COVERED,
    };
  }
  const previous = previousYearWindow(window);
  return {
    reference: 'previous-year',
    yearOn: true,
    previous,
    volume: coverageOf(previous, start.tickets),
    sla: coverageOf(previous, start.cycles),
  };
}

/** Is there anything to draw for the previous side of a figure? Not when the data never reaches it. */
export const hasPrevious = (side: SideCoverage): boolean => side.coverage !== 'none';
