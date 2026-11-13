import { describe, expect, it } from 'vitest';
import {
  fallbackChip,
  isFutureQuarter,
  parseToday,
  typesLabel,
} from '../../public/js/global-filter.js';

/** The pure parts of the progressive-enhancement script (D-081); the rest is covered by e2e. */

describe('typesLabel', () => {
  it('says "todos" when every type is chosen and counts otherwise', () => {
    expect(typesLabel(5, 5)).toBe('Todos seleccionados');
    expect(typesLabel(2, 5)).toBe('2 seleccionados');
    expect(typesLabel(1, 5)).toBe('1 seleccionado');
  });

  it('never reads "0 de N": one type is always left', () => {
    expect(typesLabel(1, 1)).toBe('Todos seleccionados');
  });
});

describe('parseToday', () => {
  it('reads the day the server sent', () => {
    expect(parseToday('2026-11-13')).toEqual({ year: 2026, month: 11 });
  });

  it('refuses anything else, so the script leaves the chips alone', () => {
    expect(parseToday(undefined)).toBeNull();
    expect(parseToday('')).toBeNull();
    expect(parseToday('13/11/2026')).toBeNull();
  });
});

describe('isFutureQuarter', () => {
  const february = { year: 2026, month: 2 };

  it('is the quarters that start after today, in the current year', () => {
    expect([1, 2, 3, 4].map((q) => isFutureQuarter(2026, q, february))).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  it('counts a quarter as started on its first month', () => {
    expect(isFutureQuarter(2026, 2, { year: 2026, month: 3 })).toBe(true);
    expect(isFutureQuarter(2026, 2, { year: 2026, month: 4 })).toBe(false);
    expect(isFutureQuarter(2026, 4, { year: 2026, month: 10 })).toBe(false);
  });

  it('has no future quarter in a past year, and all of them in a later one', () => {
    expect([1, 2, 3, 4].some((q) => isFutureQuarter(2025, q, february))).toBe(false);
    expect([1, 2, 3, 4].every((q) => isFutureQuarter(2027, q, february))).toBe(true);
  });
});

describe('fallbackChip', () => {
  it('is the latest quarter that has started', () => {
    expect(fallbackChip(2026, { year: 2026, month: 2 })).toBe('T1');
    expect(fallbackChip(2026, { year: 2026, month: 8 })).toBe('T3');
    expect(fallbackChip(2025, { year: 2026, month: 2 })).toBe('T4');
  });

  it('is the 30-day chip when no quarter of that year has started', () => {
    expect(fallbackChip(2027, { year: 2026, month: 11 })).toBe('30d');
  });
});
