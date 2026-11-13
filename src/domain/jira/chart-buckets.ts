import type { DayWindow, Granularity } from './period-window';
import {
  REPORTING_TIME_ZONE,
  addDays,
  addMonths,
  startOfDay,
  type TimeRange,
  type YearMonth,
  type YearMonthDay,
} from './quarter';

/** One bar of a chart: a run of whole days of the period. */
export interface Bucket {
  /** Position in the chart, from 0: the previous year lines up with the current one by position. */
  readonly index: number;
  readonly from: YearMonthDay;
  /** The last day included. */
  readonly to: YearMonthDay;
  readonly range: TimeRange;
}

const WEEK_DAYS = 7;
/** A monthly chart draws at most the latest three years, as the monthly charts always did. */
export const MAX_MONTHLY_BUCKETS = 36;

const dayNumber = (day: YearMonthDay): number => Date.UTC(day.year, day.month - 1, day.day);
const daysBetween = (from: YearMonthDay, to: YearMonthDay): number =>
  Math.round((dayNumber(to) - dayNumber(from)) / 86_400_000) + 1;
const lastDayOfMonth = (month: YearMonth): YearMonthDay =>
  addDays({ ...addMonths(month, 1), day: 1 }, -1);

function bucket(index: number, from: YearMonthDay, to: YearMonthDay, zone: string): Bucket {
  return {
    index,
    from,
    to,
    range: { from: startOfDay(from, zone), to: startOfDay(addDays(to, 1), zone) },
  };
}

/**
 * The bars of a chart over a period.
 * - daily: one per day;
 * - weekly: blocks of 7 days counted from the first day of the period, the last one shorter when the
 *   period does not divide by 7. Starting at the period and not at a Monday keeps "week 1" the same
 *   stretch of days a year earlier;
 * - monthly: calendar months, the first and last cut to the period. A long period shows its latest
 *   months, as the monthly charts always did.
 */
export function bucketsOf(
  window: DayWindow,
  granularity: Granularity,
  zone: string = REPORTING_TIME_ZONE,
): Bucket[] {
  const buckets: Bucket[] = [];
  if (granularity === 'daily') {
    for (let day = window.from; daysBetween(day, window.to) >= 1; day = addDays(day, 1)) {
      buckets.push(bucket(buckets.length, day, day, zone));
    }
    return buckets;
  }
  if (granularity === 'weekly') {
    for (
      let start = window.from;
      daysBetween(start, window.to) >= 1;
      start = addDays(start, WEEK_DAYS)
    ) {
      const end = addDays(start, WEEK_DAYS - 1);
      const to = daysBetween(end, window.to) >= 1 ? end : window.to;
      buckets.push(bucket(buckets.length, start, to, zone));
    }
    return buckets;
  }
  let month: YearMonth = { year: window.from.year, month: window.from.month };
  while (daysBetween({ ...month, day: 1 }, window.to) >= 1) {
    const first = { ...month, day: 1 };
    const from = daysBetween(first, window.from) >= 1 ? window.from : first;
    const end = lastDayOfMonth(month);
    const to = daysBetween(end, window.to) >= 1 ? end : window.to;
    buckets.push(bucket(buckets.length, from, to, zone));
    month = addMonths(month, 1);
  }
  const shown = buckets.slice(-MAX_MONTHLY_BUCKETS);
  return shown.map((item, index) => ({ ...item, index }));
}
