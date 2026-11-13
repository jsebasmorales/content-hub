import { describe, expect, it } from 'vitest';
import {
  addYears,
  dayOf,
  daysBetween,
  granularityFor,
  previousPeriodWindow,
  previousYearWindow,
  resolveWindow,
  type PeriodPreset,
  type PeriodWindow,
} from '@domain/jira/period-window';

const now = new Date('2026-11-13T15:00:00Z'); // 10:00 on 13 Nov in Bogotá
const day = (year: number, month: number, d: number) => ({ year, month, day: d });
const rolling30: PeriodPreset = { kind: 'rolling', days: 30 };
const quarter = (year: number, q: 1 | 2 | 3 | 4): PeriodPreset => ({
  kind: 'quarter',
  quarter: { year, quarter: q },
});
const custom = (from: ReturnType<typeof day>, to: ReturnType<typeof day>): PeriodPreset => ({
  kind: 'custom',
  from,
  to,
});

function windowFor(preset: PeriodPreset, at: Date = now): PeriodWindow {
  const window = resolveWindow(preset, at);
  if (!window) throw new Error('a window was expected');
  return window;
}

describe('dayOf', () => {
  it('reads the day on the Bogotá wall clock, not in UTC', () => {
    expect(dayOf(new Date('2026-11-14T04:30:00Z'))).toEqual(day(2026, 11, 13)); // 23:30 of the 13th
    expect(dayOf(new Date('2026-11-14T05:30:00Z'))).toEqual(day(2026, 11, 14)); // 00:30 of the 14th
  });
});

describe('daysBetween and addYears', () => {
  it('counts both ends', () => {
    expect(daysBetween(day(2026, 11, 1), day(2026, 11, 1))).toBe(1);
    expect(daysBetween(day(2026, 10, 1), day(2026, 12, 31))).toBe(92);
  });

  it('moves 29 February to 28 February in a year without one, and keeps it in a leap year', () => {
    expect(addYears(day(2024, 2, 29), -1)).toEqual(day(2023, 2, 28));
    expect(addYears(day(2024, 2, 29), 4)).toEqual(day(2028, 2, 29));
    expect(addYears(day(2026, 11, 13), -1)).toEqual(day(2025, 11, 13));
  });
});

describe('resolveWindow', () => {
  it('makes the default the last 30 days ending today, today included', () => {
    const window = windowFor(rolling30);
    expect(window).toMatchObject({ from: day(2026, 10, 15), to: day(2026, 11, 13), days: 30 });
    expect(window.partial).toBe(false);
    expect(window.range).toEqual({
      from: new Date('2026-10-15T05:00:00Z'),
      to: new Date('2026-11-14T05:00:00Z'),
    });
  });

  it('follows the Bogotá day across midnight, not the UTC one', () => {
    expect(windowFor(rolling30, new Date('2026-11-14T04:30:00Z')).to).toEqual(day(2026, 11, 13));
    expect(windowFor(rolling30, new Date('2026-11-14T05:30:00Z')).to).toEqual(day(2026, 11, 14));
  });

  it('cuts the quarter in progress at today and says so', () => {
    const window = windowFor(quarter(2026, 4));
    expect(window).toMatchObject({ from: day(2026, 10, 1), to: day(2026, 11, 13), days: 44 });
    expect(window.partial).toBe(true);
  });

  it('keeps a finished quarter whole', () => {
    const window = windowFor(quarter(2026, 3));
    expect(window).toMatchObject({ from: day(2026, 7, 1), to: day(2026, 9, 30), days: 92 });
    expect(window.partial).toBe(false);
  });

  it('refuses a quarter that has not started', () => {
    expect(resolveWindow(quarter(2027, 1), now)).toBeNull();
  });

  it('cuts a custom range that ends in the future, and refuses one that starts there', () => {
    const cut = windowFor(custom(day(2026, 11, 1), day(2026, 12, 31)));
    expect(cut).toMatchObject({ from: day(2026, 11, 1), to: day(2026, 11, 13), days: 13 });
    expect(cut.partial).toBe(true);
    expect(resolveWindow(custom(day(2026, 11, 20), day(2026, 11, 25)), now)).toBeNull();
  });

  it('refuses a range that ends before it starts and one longer than three years', () => {
    expect(resolveWindow(custom(day(2026, 10, 10), day(2026, 10, 9)), now)).toBeNull();
    expect(resolveWindow(custom(day(2023, 11, 11), day(2026, 11, 13)), now)).toBeNull();
    expect(resolveWindow(custom(day(2023, 11, 12), day(2026, 11, 13)), now)).not.toBeNull();
  });
});

describe('previousYearWindow', () => {
  it('gives the same calendar stretch a year earlier, with the same number of days', () => {
    const window = windowFor(custom(day(2026, 10, 15), day(2026, 11, 13)));
    expect(previousYearWindow(window)).toMatchObject({
      from: day(2025, 10, 15),
      to: day(2025, 11, 13),
      days: 30,
    });
  });

  it('is cut together with the current period when that one is cut at today', () => {
    expect(previousYearWindow(windowFor(quarter(2026, 4)))).toMatchObject({
      from: day(2025, 10, 1),
      to: day(2025, 11, 13),
      days: 44,
    });
  });

  it('keeps the number of days when a 29 February starts or sits inside the period', () => {
    const start = windowFor(custom(day(2024, 2, 29), day(2024, 3, 10)));
    const inside = windowFor(custom(day(2024, 2, 20), day(2024, 3, 10)));
    expect(previousYearWindow(start)).toMatchObject({
      from: day(2023, 2, 28),
      to: day(2023, 3, 10),
      days: start.days,
    });
    expect(previousYearWindow(inside).days).toBe(inside.days);
  });
});

describe('previousPeriodWindow', () => {
  it('takes the N days right before a 30-day or custom period', () => {
    expect(previousPeriodWindow(windowFor(rolling30))).toMatchObject({
      from: day(2026, 9, 15),
      to: day(2026, 10, 14),
      days: 30,
    });
  });

  it('takes the first N days of the previous quarter for a quarter chip', () => {
    expect(previousPeriodWindow(windowFor(quarter(2026, 4)))).toMatchObject({
      from: day(2026, 7, 1),
      to: day(2026, 8, 13),
      days: 44,
    });
  });

  it('never goes past the end of the previous quarter', () => {
    // T2 has 91 days and T1 only 90; T1 has 90 and T4 of the year before has 92.
    expect(previousPeriodWindow(windowFor(quarter(2026, 2)))).toMatchObject({
      from: day(2026, 1, 1),
      to: day(2026, 3, 31),
      days: 90,
    });
    expect(previousPeriodWindow(windowFor(quarter(2026, 1)))).toMatchObject({
      from: day(2025, 10, 1),
      to: day(2025, 12, 29),
      days: 90,
    });
  });
});

describe('granularityFor', () => {
  it('is daily up to 14 days, weekly up to 100 and monthly after', () => {
    expect(granularityFor(14)).toBe('daily');
    expect(granularityFor(15)).toBe('weekly');
    expect(granularityFor(30)).toBe('weekly');
    expect(granularityFor(92)).toBe('weekly'); // every whole quarter
    expect(granularityFor(100)).toBe('weekly');
    expect(granularityFor(101)).toBe('monthly');
  });

  it('never goes below the minimum a chart asks for', () => {
    expect(granularityFor(5, 'weekly')).toBe('weekly');
    expect(granularityFor(120, 'weekly')).toBe('monthly');
  });
});
