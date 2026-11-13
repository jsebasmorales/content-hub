import { describe, expect, it } from 'vitest';
import { bucketsOf } from '@domain/jira/chart-buckets';
import { granularityFor, resolveWindow, type PeriodPreset } from '@domain/jira/period-window';

const now = new Date('2026-11-13T15:00:00Z');
const day = (year: number, month: number, d: number) => ({ year, month, day: d });

function windowFor(preset: PeriodPreset) {
  const window = resolveWindow(preset, now);
  if (!window) throw new Error('a window was expected');
  return window;
}
const shape = (buckets: ReturnType<typeof bucketsOf>) =>
  buckets.map(
    (b) =>
      `${String(b.from.month)}/${String(b.from.day)}-${String(b.to.month)}/${String(b.to.day)}`,
  );

describe('bucketsOf', () => {
  it('draws one bar per day for a short period', () => {
    const window = windowFor({ kind: 'custom', from: day(2026, 11, 1), to: day(2026, 11, 5) });
    expect(bucketsOf(window, 'daily')).toHaveLength(5);
    expect(bucketsOf(window, 'daily')[0]?.range).toEqual({
      from: new Date('2026-11-01T05:00:00Z'),
      to: new Date('2026-11-02T05:00:00Z'),
    });
  });

  it('counts weeks from the first day of the period, the last one shorter', () => {
    const window = windowFor({ kind: 'rolling', days: 30 }); // 15 Oct to 13 Nov
    expect(shape(bucketsOf(window, 'weekly'))).toEqual([
      '10/15-10/21',
      '10/22-10/28',
      '10/29-11/4',
      '11/5-11/11',
      '11/12-11/13',
    ]);
  });

  it('gives a whole quarter 13 full weeks and a short last bar', () => {
    const window = windowFor({ kind: 'quarter', quarter: { year: 2026, quarter: 3 } });
    expect(window.days).toBe(92);
    expect(bucketsOf(window, granularityFor(window.days))).toHaveLength(14);
  });

  it('cuts the first and last month to the period', () => {
    const window = windowFor({ kind: 'custom', from: day(2026, 8, 20), to: day(2026, 11, 13) });
    expect(shape(bucketsOf(window, 'monthly'))).toEqual([
      '8/20-8/31',
      '9/1-9/30',
      '10/1-10/31',
      '11/1-11/13',
    ]);
  });

  it('numbers the bars from 0 and covers every day exactly once', () => {
    const window = windowFor({ kind: 'custom', from: day(2026, 1, 3), to: day(2026, 11, 13) });
    for (const granularity of ['daily', 'weekly', 'monthly'] as const) {
      const buckets = bucketsOf(window, granularity);
      expect(buckets.map((b) => b.index)).toEqual(buckets.map((_, i) => i));
      for (let i = 1; i < buckets.length; i += 1) {
        expect(buckets[i]?.range.from).toEqual(buckets[i - 1]?.range.to);
      }
    }
  });

  it('shows only the latest 36 months of a very long period', () => {
    const window = windowFor({ kind: 'custom', from: day(2023, 11, 12), to: day(2026, 11, 13) });
    const buckets = bucketsOf(window, 'monthly');
    expect(buckets).toHaveLength(36);
    expect(buckets[0]?.from).toEqual(day(2023, 12, 1));
  });
});
