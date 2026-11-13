import { MAX_CUSTOM_DAYS } from './report-period';
import {
  REPORTING_TIME_ZONE,
  addDays,
  startOfDay,
  type Quarter,
  type TimeRange,
  type YearMonthDay,
} from './quarter';

/**
 * The period of the global filter (docs/PLAN_FILTROS.md §2): what a person asked for, the days it
 * covers once "today" is known, and the window it is compared with. Pure: the same preset at the
 * same moment always gives the same window, and nothing here reads data or the address bar.
 */

/** Length of the default period and of the "30 días" chip. */
export const ROLLING_DAYS = 30;

export type PeriodPreset =
  | { readonly kind: 'rolling'; readonly days: number }
  | { readonly kind: 'quarter'; readonly quarter: Quarter }
  | { readonly kind: 'custom'; readonly from: YearMonthDay; readonly to: YearMonthDay };

export const DEFAULT_PRESET: PeriodPreset = { kind: 'rolling', days: ROLLING_DAYS };

/** A run of whole calendar days in the reporting time zone, both ends included. */
export interface DayWindow {
  readonly from: YearMonthDay;
  /** The last day included. */
  readonly to: YearMonthDay;
  readonly days: number;
  /** What the formulas receive: `[from 00:00, to + 1 day 00:00)` in Bogotá. */
  readonly range: TimeRange;
}

export interface PeriodWindow extends DayWindow {
  readonly preset: PeriodPreset;
  /** The preset runs past today, so it was cut at today ("hasta hoy"). */
  readonly partial: boolean;
}

const MS_PER_DAY = 86_400_000;

const asUtcDay = (day: YearMonthDay): number => Date.UTC(day.year, day.month - 1, day.day);

/** The calendar day a moment falls in, as seen from `zone`. */
export function dayOf(date: Date, zone: string = REPORTING_TIME_ZONE): YearMonthDay {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
    .formatToParts(date)
    .reduce<Record<string, number>>(
      (acc, part) => ({ ...acc, [part.type]: Number(part.value) }),
      {},
    );
  const year = parts['year'];
  const month = parts['month'];
  const day = parts['day'];
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Cannot determine the day of ${date.toISOString()} in ${zone}`);
  }
  return { year, month, day };
}

/** Days from `from` to `to`, both included: 2026-11-01 to 2026-11-01 is 1. */
export const daysBetween = (from: YearMonthDay, to: YearMonthDay): number =>
  Math.round((asUtcDay(to) - asUtcDay(from)) / MS_PER_DAY) + 1;

/** A year earlier or later; 29 February falls back to 28 February when the target year has none. */
export function addYears(day: YearMonthDay, count: number): YearMonthDay {
  const year = day.year + count;
  const leapDayMissing =
    day.month === 2 && day.day === 29 && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1;
  return { year, month: day.month, day: leapDayMissing ? 28 : day.day };
}

const isBefore = (a: YearMonthDay, b: YearMonthDay): boolean => asUtcDay(a) < asUtcDay(b);

function windowOf(from: YearMonthDay, to: YearMonthDay, zone: string): DayWindow {
  return {
    from,
    to,
    days: daysBetween(from, to),
    range: { from: startOfDay(from, zone), to: startOfDay(addDays(to, 1), zone) },
  };
}

function quarterDays(quarter: Quarter): { first: YearMonthDay; last: YearMonthDay } {
  const first = { year: quarter.year, month: (quarter.quarter - 1) * 3 + 1, day: 1 };
  const afterLast =
    quarter.quarter === 4
      ? { year: quarter.year + 1, month: 1, day: 1 }
      : { year: quarter.year, month: quarter.quarter * 3 + 1, day: 1 };
  return { first, last: addDays(afterLast, -1) };
}

/**
 * The days a preset covers at `now`, or null when it cannot be used: a quarter or a range that has
 * not started, a range that ends before it begins, or one longer than three years. A period that
 * runs past today is cut at today and says so (`partial`), for the figures and for the label.
 */
export function resolveWindow(
  preset: PeriodPreset,
  now: Date,
  zone: string = REPORTING_TIME_ZONE,
): PeriodWindow | null {
  const today = dayOf(now, zone);
  let from: YearMonthDay;
  let last: YearMonthDay;
  if (preset.kind === 'rolling') {
    if (!Number.isInteger(preset.days) || preset.days < 1 || preset.days > MAX_CUSTOM_DAYS) {
      return null;
    }
    from = addDays(today, -(preset.days - 1));
    last = today;
  } else if (preset.kind === 'quarter') {
    ({ first: from, last } = quarterDays(preset.quarter));
  } else {
    ({ from, to: last } = preset);
  }
  if (isBefore(today, from) || isBefore(last, from)) return null;
  const partial = isBefore(today, last);
  const to = partial ? today : last;
  const window = windowOf(from, to, zone);
  return window.days > MAX_CUSTOM_DAYS ? null : { ...window, preset, partial };
}

/**
 * The window the figures are set against when the comparison with the previous year is off
 * (docs/PLAN_FILTROS.md §0.1, D-0c):
 * - a quarter chip: the first N days of the previous quarter, as the executive page always did, so
 *   six weeks of T4 are not set against all of T3; never longer than that quarter;
 * - 30 días and a custom range: the N days right before it.
 */
export function previousPeriodWindow(
  window: PeriodWindow,
  zone: string = REPORTING_TIME_ZONE,
): DayWindow {
  if (window.preset.kind === 'quarter') {
    const before: Quarter =
      window.preset.quarter.quarter === 1
        ? { year: window.preset.quarter.year - 1, quarter: 4 }
        : {
            year: window.preset.quarter.year,
            quarter: (window.preset.quarter.quarter - 1) as 1 | 2 | 3,
          };
    const { first, last } = quarterDays(before);
    const length = daysBetween(first, last);
    return windowOf(first, addDays(first, Math.min(window.days, length) - 1), zone);
  }
  return windowOf(addDays(window.from, -window.days), addDays(window.from, -1), zone);
}

/**
 * The same calendar stretch one year earlier, with the same number of days (D-0i):
 * `previous start = start - 1 year` and `previous end = previous start + (days - 1)`.
 */
export function previousYearWindow(
  window: DayWindow,
  zone: string = REPORTING_TIME_ZONE,
): DayWindow {
  const from = addYears(window.from, -1);
  return windowOf(from, addDays(from, window.days - 1), zone);
}

export type Granularity = 'daily' | 'weekly' | 'monthly';

/** Up to this many days a chart shows one bar per day; up to the next, one per week. */
export const DAILY_MAX_DAYS = 14;
export const WEEKLY_MAX_DAYS = 100;

/**
 * How finely a chart splits a period. SLA percentages ask for `minimum: 'weekly'`: with one to
 * three cycles a day, a daily percentage is noise.
 */
export function granularityFor(days: number, minimum: Granularity = 'daily'): Granularity {
  const natural: Granularity =
    days <= DAILY_MAX_DAYS ? 'daily' : days <= WEEKLY_MAX_DAYS ? 'weekly' : 'monthly';
  const order: Granularity[] = ['daily', 'weekly', 'monthly'];
  return order.indexOf(natural) >= order.indexOf(minimum) ? natural : minimum;
}

/**
 * What the "Aplicar" button sent, with no script on the page. The date field is drawn already
 * filled with the dates of the period shown, so the form always sends dates, even when the person
 * only clicked a chip or changed the year. `shownFrom` and `shownTo` are the dates the page was
 * drawn with (sent back as hidden fields), which is the only way to tell "edited" from "left alone".
 */
export interface SubmittedPeriod {
  /** The chip picked: `'30d'`, `'T1'` to `'T4'`, or null when none came. */
  readonly chip: string | null;
  /** The year of the quarter chips, or null when none came. */
  readonly year: number | null;
  readonly from: YearMonthDay | null;
  readonly to: YearMonthDay | null;
  readonly shownFrom: YearMonthDay | null;
  readonly shownTo: YearMonthDay | null;
}

/** The same bounds the address bar accepts for a quarter (report-period.ts). */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const QUARTER_CHIP = /^T([1-4])$/;

const sameDay = (a: YearMonthDay, b: YearMonthDay): boolean =>
  a.year === b.year && a.month === b.month && a.day === b.day;

/**
 * Decides which preset a submitted form means.
 *
 * - Both `from` and `to` present and not both equal to `shownFrom` / `shownTo`: the person typed
 *   dates, so it is a custom range and the chip and the year are stale. If the page did not send
 *   what it had drawn, any pair of dates counts as typed.
 * - A lone date is ignored. Otherwise the chip decides: `'30d'` is the rolling default and `'T1'`
 *   to `'T4'` is that quarter of `year` (the current year when `year` is null).
 * - Anything unusable (no chip, an unknown chip, a year outside 2000-2100) is the default.
 * Whether the result can be shown (a quarter that has not started, `from` after `to`, over three
 * years) is `resolveWindow`'s call: it returns null and the caller reports "ignored".
 * The contract is in tests/unit/period-submission.test.ts.
 */
export function presetFromSubmission(
  submitted: SubmittedPeriod,
  today: YearMonthDay,
): PeriodPreset {
  const { chip, year, from, to, shownFrom, shownTo } = submitted;

  if (from !== null && to !== null) {
    const untouched =
      shownFrom !== null && shownTo !== null && sameDay(from, shownFrom) && sameDay(to, shownTo);
    if (!untouched) return { kind: 'custom', from, to };
  }

  const match = chip === null ? null : QUARTER_CHIP.exec(chip);
  if (match?.[1] === undefined) return DEFAULT_PRESET;
  const chosenYear = year ?? today.year;
  if (!Number.isInteger(chosenYear) || chosenYear < MIN_YEAR || chosenYear > MAX_YEAR) {
    return DEFAULT_PRESET;
  }
  return {
    kind: 'quarter',
    quarter: { year: chosenYear, quarter: Number(match[1]) as Quarter['quarter'] },
  };
}
