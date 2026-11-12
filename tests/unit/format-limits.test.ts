import { describe, expect, it } from 'vitest';
import { describeLimit, formatCalendarDay } from '@presentation/format-moment';
import { parseSlaQuery, slaQuarterHref } from '@presentation/sla-query';

const now = new Date('2026-11-12T15:00:00Z');
const hours = (n: number): Date => new Date(now.getTime() + n * 3_600_000);

describe('describeLimit', () => {
  it('says how long is left, in the unit that reads best', () => {
    expect(describeLimit(new Date(now.getTime() + 20 * 60_000), now)).toBe('Vence en 20 min');
    expect(describeLimit(hours(5), now)).toBe('Vence en 5 h');
    expect(describeLimit(hours(47), now)).toBe('Vence en 47 h');
    expect(describeLimit(hours(24 * 6), now)).toBe('Vence en 6 días');
  });

  it('says how long ago a limit passed', () => {
    expect(describeLimit(hours(-3), now)).toBe('Venció hace 3 h');
    expect(describeLimit(hours(-24 * 10), now)).toBe('Venció hace 10 días');
  });

  it('treats the exact moment as passed and a missing limit as unknown', () => {
    expect(describeLimit(now, now)).toBe('Venció hace 1 min');
    expect(describeLimit(null, now)).toBe('Sin fecha límite');
  });
});

describe('formatCalendarDay', () => {
  it('prints a day without any time zone shifting it', () => {
    expect(formatCalendarDay({ year: 2026, month: 10, day: 5 })).toBe('5 oct 2026');
    expect(formatCalendarDay({ year: 2026, month: 1, day: 1 })).toBe('1 ene 2026');
  });
});

describe('the address of /sla', () => {
  it('reads the period in Spanish', () => {
    expect(parseSlaQuery(new URLSearchParams('trimestre=2026-T3'))).toEqual({
      quarter: '2026-T3',
      from: undefined,
      to: undefined,
    });
    expect(parseSlaQuery(new URLSearchParams('desde=2026-10-05&hasta=2026-10-10'))).toEqual({
      quarter: undefined,
      from: '2026-10-05',
      to: '2026-10-10',
    });
  });

  it('drops oversized values and builds quarter links', () => {
    const huge = parseSlaQuery(new URLSearchParams(`desde=${'9'.repeat(200)}`));
    expect(huge).toEqual({ quarter: undefined, from: undefined, to: undefined });
    expect(slaQuarterHref('2026-T3')).toBe('/sla?trimestre=2026-T3');
  });
});
