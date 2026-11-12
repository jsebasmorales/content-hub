import { describe, expect, it } from 'vitest';
import {
  dayParam,
  parseDayParam,
  parseQuarterParam,
  quarterParam,
  recentQuarters,
  resolvePeriod,
} from '@domain/jira/report-period';

const now = new Date('2026-11-12T15:00:00Z');
const at = (iso: string): Date => new Date(iso);

describe('resolvePeriod', () => {
  it('defaults to the current quarter', () => {
    const { period, ignored } = resolvePeriod({}, now);
    expect(period).toMatchObject({ kind: 'quarter', quarter: { year: 2026, quarter: 4 } });
    expect(period.range).toEqual({
      from: at('2026-10-01T05:00:00Z'),
      to: at('2027-01-01T05:00:00Z'),
    });
    expect(ignored).toBe(false);
  });

  it('takes a quick-choice quarter, current or past', () => {
    expect(resolvePeriod({ quarter: '2026-T3' }, now).period).toMatchObject({
      kind: 'quarter',
      quarter: { year: 2026, quarter: 3 },
    });
    expect(resolvePeriod({ quarter: '2026-T4' }, now).ignored).toBe(false);
  });

  it('refuses a quarter that has not started, and falls back saying so', () => {
    const result = resolvePeriod({ quarter: '2027-T1' }, now);
    expect(result.period).toMatchObject({ kind: 'quarter', quarter: { year: 2026, quarter: 4 } });
    expect(result.ignored).toBe(true);
  });

  it('includes the whole last day of a custom range, in Bogotá time', () => {
    const { period } = resolvePeriod({ from: '2026-10-05', to: '2026-10-10' }, now);
    expect(period.kind).toBe('custom');
    expect(period.range).toEqual({
      from: at('2026-10-05T05:00:00Z'),
      to: at('2026-10-11T05:00:00Z'),
    });
  });

  it('accepts a single day', () => {
    const { period, ignored } = resolvePeriod({ from: '2026-10-05', to: '2026-10-05' }, now);
    expect(ignored).toBe(false);
    expect(period.range.to.getTime() - period.range.from.getTime()).toBe(86_400_000);
  });

  it('lets a custom range win over a quarter', () => {
    const { period } = resolvePeriod(
      { quarter: '2026-T1', from: '2026-10-05', to: '2026-10-10' },
      now,
    );
    expect(period.kind).toBe('custom');
  });

  it.each([
    ['reversed', { from: '2026-10-10', to: '2026-10-05' }],
    ['one end only', { from: '2026-10-05' }],
    ['an impossible date', { from: '2026-02-30', to: '2026-03-05' }],
    ['not a date', { from: 'ayer', to: 'hoy' }],
    ['four years', { from: '2022-01-01', to: '2026-01-01' }],
    ['not a quarter', { quarter: 'T9' }],
  ])('falls back to the current quarter when the range is %s', (_name, raw) => {
    const result = resolvePeriod(raw, now);
    expect(result.period).toMatchObject({ kind: 'quarter', quarter: { year: 2026, quarter: 4 } });
    expect(result.ignored).toBe(true);
  });

  it('is not an error to ask for nothing, or for blanks', () => {
    expect(resolvePeriod({ quarter: '', from: '', to: '' }, now).ignored).toBe(false);
  });
});

describe('quick quarters and address parts', () => {
  it('lists six quarters, newest first, across the year boundary', () => {
    expect(recentQuarters(now).map(quarterParam)).toEqual([
      '2026-T4',
      '2026-T3',
      '2026-T2',
      '2026-T1',
      '2025-T4',
      '2025-T3',
    ]);
  });

  it('writes and reads them back', () => {
    expect(parseQuarterParam('2026-T3')).toEqual({ year: 2026, quarter: 3 });
    expect(parseQuarterParam('2026-T5')).toBeNull();
    expect(parseQuarterParam(undefined)).toBeNull();
    expect(dayParam({ year: 2026, month: 3, day: 7 })).toBe('2026-03-07');
    expect(parseDayParam('2026-03-07')).toEqual({ year: 2026, month: 3, day: 7 });
    expect(parseDayParam('2026-3-7')).toBeNull();
    expect(parseDayParam('1999-01-01')).toBeNull();
  });
});
