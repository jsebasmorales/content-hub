import {
  REPORTING_TIME_ZONE,
  addDays,
  previousQuarter,
  quarterOf,
  quarterRange,
  startOfDay,
  type Quarter,
  type TimeRange,
  type YearMonthDay,
} from './quarter';

/** Longest custom period the pages accept: three years of calendar days. */
export const MAX_CUSTOM_DAYS = 3 * 366;
/** Quarters offered as quick choices, the current one first. */
export const QUICK_QUARTERS = 6;

/** What a person asked for, as the address bar delivered it. Nothing here is trusted yet. */
export interface RawPeriod {
  readonly quarter?: string | null | undefined;
  readonly from?: string | null | undefined;
  readonly to?: string | null | undefined;
}

export type ReportPeriod =
  | { readonly kind: 'quarter'; readonly quarter: Quarter; readonly range: TimeRange }
  | {
      readonly kind: 'custom';
      readonly from: YearMonthDay;
      readonly to: YearMonthDay;
      readonly range: TimeRange;
    };

export interface ResolvedPeriod {
  readonly period: ReportPeriod;
  /** True when something was asked for but could not be used, so the page can say it fell back. */
  readonly ignored: boolean;
}

const QUARTER_PARAM = /^(\d{4})-T([1-4])$/;
const DAY_PARAM = /^(\d{4})-(\d{2})-(\d{2})$/;

export const quarterParam = (quarter: Quarter): string =>
  `${String(quarter.year)}-T${String(quarter.quarter)}`;

export const dayParam = (day: YearMonthDay): string =>
  `${String(day.year).padStart(4, '0')}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;

export function parseQuarterParam(value: string | null | undefined): Quarter | null {
  const match = value ? QUARTER_PARAM.exec(value) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]) as 1 | 2 | 3 | 4;
  return year >= 2000 && year <= 2100 ? { year, quarter } : null;
}

/** A real calendar day written as YYYY-MM-DD; "2026-02-30" is not one. */
export function parseDayParam(value: string | null | undefined): YearMonthDay | null {
  const match = value ? DAY_PARAM.exec(value) : null;
  if (!match) return null;
  const day = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const real = new Date(Date.UTC(day.year, day.month - 1, day.day));
  const roundTrips =
    real.getUTCFullYear() === day.year &&
    real.getUTCMonth() === day.month - 1 &&
    real.getUTCDate() === day.day;
  return roundTrips && day.year >= 2000 && day.year <= 2100 ? day : null;
}

const quarterIndex = (quarter: Quarter): number => quarter.year * 4 + quarter.quarter;

/** The last quarters, newest first, for the quick-choice buttons. */
export function recentQuarters(
  now: Date,
  zone: string = REPORTING_TIME_ZONE,
  count: number = QUICK_QUARTERS,
): Quarter[] {
  const quarters = [quarterOf(now, zone)];
  while (quarters.length < count) {
    const last = quarters[quarters.length - 1];
    if (last === undefined) break;
    quarters.push(previousQuarter(last));
  }
  return quarters;
}

function quarterPeriod(quarter: Quarter, zone: string): ReportPeriod {
  return { kind: 'quarter', quarter, range: quarterRange(quarter, zone) };
}

function customPeriod(from: YearMonthDay, to: YearMonthDay, zone: string): ReportPeriod {
  // The last day is included in full, so the range ends at the start of the day after it.
  return {
    kind: 'custom',
    from,
    to,
    range: { from: startOfDay(from, zone), to: startOfDay(addDays(to, 1), zone) },
  };
}

const spanInDays = (from: YearMonthDay, to: YearMonthDay): number =>
  Math.round(
    (Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) /
      86_400_000,
  ) + 1;

/**
 * Chooses the period to report on. A valid custom range wins over a quarter, a valid quarter wins
 * over the default (the current quarter), and anything unusable falls back with `ignored` set,
 * so a mistyped address shows something sensible instead of an error.
 */
export function resolvePeriod(
  raw: RawPeriod,
  now: Date,
  zone: string = REPORTING_TIME_ZONE,
): ResolvedPeriod {
  const current = quarterOf(now, zone);
  const asked = [raw.from, raw.to, raw.quarter].some(
    (value) => value !== undefined && value !== null && value !== '',
  );

  const from = parseDayParam(raw.from);
  const to = parseDayParam(raw.to);
  if (from && to) {
    const span = spanInDays(from, to);
    if (span >= 1 && span <= MAX_CUSTOM_DAYS) {
      return { period: customPeriod(from, to, zone), ignored: false };
    }
  }

  const quarter = parseQuarterParam(raw.quarter);
  const usable = quarter !== null && quarterIndex(quarter) <= quarterIndex(current);
  if (usable && !(raw.from || raw.to)) {
    return { period: quarterPeriod(quarter, zone), ignored: false };
  }
  return { period: quarterPeriod(current, zone), ignored: asked };
}
