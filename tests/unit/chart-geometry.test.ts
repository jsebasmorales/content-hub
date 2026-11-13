import { describe, expect, it } from 'vitest';
import { niceTicks } from '@presentation/chart-geometry';

describe('niceTicks', () => {
  it('rounds a count axis to whole, evenly spaced steps that cover the maximum', () => {
    expect(niceTicks(119)).toEqual([0, 30, 60, 90, 120]);
    expect(niceTicks(46)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
  });

  it('never needs more than the allowed number of gaps', () => {
    for (const max of [1, 2, 3, 7, 46, 99, 100, 101, 640, 1046, 5321]) {
      const ticks = niceTicks(max);
      expect(ticks.length - 1).toBeLessThanOrEqual(4);
      expect(ticks.at(-1)).toBeGreaterThanOrEqual(max);
      expect(ticks[0]).toBe(0);
      expect(ticks.every((tick) => Number.isInteger(tick))).toBe(true);
    }
  });

  it('copes with an empty series', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(Number.NaN)).toEqual([0, 1]);
  });
});
