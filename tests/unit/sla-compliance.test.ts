import { describe, expect, it } from 'vitest';
import { cycleOutcome, type SlaCycle, type SlaMetric } from '@domain/jira/sla';
import {
  SLA_TARGET_PERCENT,
  cycleInPeriod,
  metricCompliance,
  slaCompliance,
} from '@domain/jira/sla-compliance';

const now = new Date('2026-11-11T15:00:00Z');
const hoursFromNow = (hours: number): Date => new Date(now.getTime() + hours * 3_600_000);

const completed = (
  metric: SlaMetric,
  breached: boolean,
  stoppedAt = hoursFromNow(-1),
): SlaCycle => ({
  metric,
  state: 'completed',
  startedAt: hoursFromNow(-100),
  stoppedAt,
  breachAt: null,
  breached,
  paused: false,
});

const ongoing = (overrides: Partial<SlaCycle> = {}): SlaCycle => ({
  metric: 'done',
  state: 'ongoing',
  startedAt: hoursFromNow(-10),
  stoppedAt: null,
  breachAt: hoursFromNow(5),
  breached: false,
  paused: false,
  ...overrides,
});

/** `met` cycles that passed and `breached` ones that did not, for one metric. */
const cyclesOf = (metric: SlaMetric, met: number, breached: number): SlaCycle[] => [
  ...Array.from({ length: met }, () => completed(metric, false)),
  ...Array.from({ length: breached }, () => completed(metric, true)),
];

describe('cycleOutcome (D-038, D-042)', () => {
  it('trusts Jira for completed cycles', () => {
    expect(cycleOutcome(completed('done', false), now)).toBe('met');
    expect(cycleOutcome(completed('done', true), now)).toBe('breached');
  });

  it('counts an ongoing cycle that Jira already marked as breached', () => {
    expect(cycleOutcome(ongoing({ breached: true }), now)).toBe('breached');
    expect(cycleOutcome(ongoing({ breached: true, paused: true }), now)).toBe('breached');
  });

  it('never marks a paused cycle, whatever its projected breach time', () => {
    expect(cycleOutcome(ongoing({ paused: true, breachAt: hoursFromNow(-50) }), now)).toBe(
      'excluded',
    );
  });

  it('marks a running cycle that passed its breach time even if Jira lags', () => {
    expect(cycleOutcome(ongoing({ breachAt: hoursFromNow(-1) }), now)).toBe('breached');
    expect(cycleOutcome(ongoing({ breachAt: now }), now)).toBe('breached');
  });

  it('leaves a running cycle that is still on time undecided', () => {
    expect(cycleOutcome(ongoing(), now)).toBe('excluded');
    expect(cycleOutcome(ongoing({ breachAt: null }), now)).toBe('excluded');
  });
});

describe('metricCompliance', () => {
  it('has nothing to report without cycles', () => {
    expect(metricCompliance('done', [], now)).toEqual({
      metric: 'done',
      met: 0,
      breached: 0,
      total: 0,
      ratePercent: null,
      meetsTarget: null,
    });
  });

  it('meets the target at exactly 90 %', () => {
    const result = metricCompliance('done', cyclesOf('done', 9, 1), now);
    expect(result.ratePercent).toBe(90);
    expect(result.meetsTarget).toBe(true);
    expect(SLA_TARGET_PERCENT).toBe(90);
  });

  it('misses the target just below 90 %', () => {
    const result = metricCompliance('done', cyclesOf('done', 89, 11), now);
    expect(result.ratePercent).toBe(89);
    expect(result.meetsTarget).toBe(false);
  });

  it('rounds the displayed rate to one decimal without affecting the target check', () => {
    // 899 of 1000 is 89.9 %: it must not round up into compliance.
    const result = metricCompliance('done', cyclesOf('done', 899, 101), now);
    expect(result.ratePercent).toBe(89.9);
    expect(result.meetsTarget).toBe(false);
  });

  it('ignores cycles of the other metric, paused and undecided cycles', () => {
    const cycles = [
      ...cyclesOf('done', 9, 1),
      ...cyclesOf('first_response', 0, 5),
      ongoing({ paused: true }),
      ongoing(),
    ];
    expect(metricCompliance('done', cycles, now).total).toBe(10);
  });

  it('counts an ongoing breach as a failure of the current period', () => {
    const result = metricCompliance(
      'done',
      [...cyclesOf('done', 9, 0), ongoing({ breached: true })],
      now,
    );
    expect(result).toMatchObject({ met: 9, breached: 1, ratePercent: 90 });
  });
});

describe('slaCompliance (D-042, option B: each metric on its own)', () => {
  it('meets the goal when both metrics reach 90 %', () => {
    const cycles = [...cyclesOf('done', 9, 1), ...cyclesOf('first_response', 18, 2)];
    expect(slaCompliance(cycles, now).goalMet).toBe(true);
  });

  it('fails the goal when one metric is below 90 % even if the combined rate is above', () => {
    // done 100 % (100/100), first_response 80 % (80/100): combined 90 % would pass, option B must not.
    const cycles = [...cyclesOf('done', 100, 0), ...cyclesOf('first_response', 80, 20)];
    const result = slaCompliance(cycles, now);
    expect(result.goalMet).toBe(false);
    expect(result.metrics.map((m) => m.meetsTarget)).toEqual([false, true]);
  });

  it('reports the real figures measured on the tenant (2026-11-11)', () => {
    const cycles = [...cyclesOf('first_response', 839, 152), ...cyclesOf('done', 925, 97)];
    const result = slaCompliance(cycles, now);
    expect(result.metrics.map((m) => m.ratePercent)).toEqual([84.7, 90.5]);
    expect(result.goalMet).toBe(false);
  });

  it('keeps the goal undecided while a metric has no data', () => {
    expect(slaCompliance(cyclesOf('done', 10, 0), now).goalMet).toBeNull();
    expect(slaCompliance([], now).goalMet).toBeNull();
  });

  it('prefers a definite failure over missing data', () => {
    expect(slaCompliance(cyclesOf('done', 0, 5), now).goalMet).toBe(false);
  });

  it('always lists both metrics in a stable order', () => {
    expect(slaCompliance([], now).metrics.map((m) => m.metric)).toEqual(['first_response', 'done']);
  });
});

describe('cycleInPeriod', () => {
  const period = { from: new Date('2026-10-01T05:00:00Z'), to: new Date('2027-01-01T05:00:00Z') };

  it('places a completed cycle by its stop time, half-open', () => {
    expect(cycleInPeriod(completed('done', false, period.from), period, now)).toBe(true);
    expect(cycleInPeriod(completed('done', false, period.to), period, now)).toBe(false);
    expect(
      cycleInPeriod(completed('done', false, new Date('2026-09-30T00:00:00Z')), period, now),
    ).toBe(false);
  });

  it('places an ongoing cycle in the period that contains now', () => {
    expect(cycleInPeriod(ongoing(), period, now)).toBe(true);
    expect(
      cycleInPeriod(ongoing(), { from: new Date('2026-01-01'), to: new Date('2026-04-01') }, now),
    ).toBe(false);
  });

  it('leaves out a completed cycle that has no stop time', () => {
    expect(cycleInPeriod({ ...completed('done', false), stoppedAt: null }, period, now)).toBe(
      false,
    );
  });
});
