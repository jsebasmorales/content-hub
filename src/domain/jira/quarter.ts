/** Reports group by calendar quarter in the team's own time zone, not the server's. */
export const REPORTING_TIME_ZONE = 'America/Bogota';

export interface Quarter {
  readonly year: number;
  readonly quarter: 1 | 2 | 3 | 4;
}

/** A calendar month, `month` from 1 (January) to 12. */
export interface YearMonth {
  readonly year: number;
  readonly month: number;
}

/** Half-open interval `[from, to)`. */
export interface TimeRange {
  readonly from: Date;
  readonly to: Date;
}

/** The part two ranges share; empty (to before from) when they do not overlap. */
export const intersectRanges = (a: TimeRange, b: TimeRange): TimeRange => ({
  from: new Date(Math.max(a.from.getTime(), b.from.getTime())),
  to: new Date(Math.min(a.to.getTime(), b.to.getTime())),
});

const QUARTER_OF_MONTH = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4] as const;

/**
 * The calendar month a moment falls in, as seen from `timeZone`. Intl does the time zone
 * arithmetic, so daylight-saving changes and odd offsets are handled for us.
 */
export function monthOf(date: Date, timeZone: string = REPORTING_TIME_ZONE): YearMonth {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const year = Number(parts['year']);
  const month = Number(parts['month']);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Cannot determine the month of ${date.toISOString()} in ${timeZone}`);
  }
  return { year, month };
}

export function quarterOf(date: Date, timeZone: string = REPORTING_TIME_ZONE): Quarter {
  const { year, month } = monthOf(date, timeZone);
  const quarter = QUARTER_OF_MONTH[month - 1];
  if (quarter === undefined) {
    throw new Error(`Cannot determine the quarter of month ${String(month)}`);
  }
  return { year, quarter };
}

/** How far the wall clock of `timeZone` is ahead of UTC at `instant`, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  })
    .formatToParts(instant)
    .reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.type]: Number(p.value) }), {});
  const wall = Date.UTC(
    parts['year'] ?? 0,
    (parts['month'] ?? 1) - 1,
    parts['day'] ?? 1,
    parts['hour'] ?? 0,
    parts['minute'] ?? 0,
    parts['second'] ?? 0,
  );
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

/** A calendar day, `month` from 1 and `day` from 1. */
export interface YearMonthDay extends YearMonth {
  readonly day: number;
}

/** The instant at which `day` begins on the wall clock of `timeZone`. */
export function startOfDay(day: YearMonthDay, timeZone: string = REPORTING_TIME_ZONE): Date {
  const wallMidnight = Date.UTC(day.year, day.month - 1, day.day);
  // The offset can differ between the guess and the answer around a daylight-saving change.
  const first = wallMidnight - offsetMs(new Date(wallMidnight), timeZone);
  return new Date(wallMidnight - offsetMs(new Date(first), timeZone));
}

/** The instant at which `month` begins on the wall clock of `timeZone`. */
export function startOfMonth(month: YearMonth, timeZone: string = REPORTING_TIME_ZONE): Date {
  return startOfDay({ ...month, day: 1 }, timeZone);
}

export function addDays(day: YearMonthDay, count: number): YearMonthDay {
  const moved = new Date(Date.UTC(day.year, day.month - 1, day.day + count));
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  };
}

export function addMonths(month: YearMonth, count: number): YearMonth {
  const index = month.year * 12 + (month.month - 1) + count;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function quarterRange(quarter: Quarter, timeZone: string = REPORTING_TIME_ZONE): TimeRange {
  const first: YearMonth = { year: quarter.year, month: (quarter.quarter - 1) * 3 + 1 };
  return { from: startOfMonth(first, timeZone), to: startOfMonth(addMonths(first, 3), timeZone) };
}

export function previousQuarter(quarter: Quarter): Quarter {
  return quarter.quarter === 1
    ? { year: quarter.year - 1, quarter: 4 }
    : { year: quarter.year, quarter: (quarter.quarter - 1) as 1 | 2 | 3 };
}

/** "T4 2026": how the team names a quarter on screen. */
export const quarterLabel = (quarter: Quarter): string =>
  `T${String(quarter.quarter)} ${String(quarter.year)}`;
