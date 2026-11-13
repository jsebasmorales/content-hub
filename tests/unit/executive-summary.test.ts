import { describe, expect, it } from 'vitest';
import { bucketsOf } from '@domain/jira/chart-buckets';
import { buildExecutiveSummary, medianResolutionDays } from '@domain/jira/executive-summary';
import {
  granularityFor,
  previousPeriodWindow,
  resolveWindow,
  type PeriodPreset,
} from '@domain/jira/period-window';
import {
  addMonths,
  previousQuarter,
  quarterLabel,
  quarterRange,
  startOfMonth,
} from '@domain/jira/quarter';
import type { SlaCycle } from '@domain/jira/sla';
import type { Ticket } from '@domain/jira/ticket';

const at = (iso: string): Date => new Date(iso);

function ticket(key: string, createdAt: string, resolvedAt: string | null, type = 'Edit'): Ticket {
  return {
    key,
    summary: key,
    status: resolvedAt ? 'Done' : 'To Do',
    statusCategory: resolvedAt ? 'done' : 'new',
    requestType: type,
    priority: null,
    assigneeId: null,
    assigneeName: null,
    requesterId: null,
    requesterName: null,
    createdAt: at(createdAt),
    resolvedAt: resolvedAt ? at(resolvedAt) : null,
    updatedAt: at(createdAt),
  };
}

function doneCycle(stoppedAt: string, breached: boolean): SlaCycle {
  return {
    metric: 'done',
    state: 'completed',
    startedAt: at('2026-10-01T10:00:00Z'),
    stoppedAt: at(stoppedAt),
    breachAt: null,
    breached,
    paused: false,
  };
}

describe('quarter helpers (Bogotá, UTC-5)', () => {
  it('starts and ends a quarter at local midnight', () => {
    expect(quarterRange({ year: 2026, quarter: 4 })).toEqual({
      from: at('2026-10-01T05:00:00Z'),
      to: at('2027-01-01T05:00:00Z'),
    });
  });

  it('follows daylight saving in zones that have it', () => {
    // Madrid is UTC+1 in January and UTC+2 in July.
    expect(startOfMonth({ year: 2026, month: 1 }, 'Europe/Madrid')).toEqual(
      at('2025-12-31T23:00:00Z'),
    );
    expect(startOfMonth({ year: 2026, month: 7 }, 'Europe/Madrid')).toEqual(
      at('2026-06-30T22:00:00Z'),
    );
  });

  it('moves between years', () => {
    expect(addMonths({ year: 2026, month: 11 }, 3)).toEqual({ year: 2027, month: 2 });
    expect(addMonths({ year: 2026, month: 2 }, -3)).toEqual({ year: 2025, month: 11 });
    expect(previousQuarter({ year: 2026, quarter: 1 })).toEqual({ year: 2025, quarter: 4 });
    expect(quarterLabel({ year: 2026, quarter: 4 })).toBe('T4 2026');
  });
});

describe('medianResolutionDays', () => {
  it('is null without resolved tickets', () => {
    expect(medianResolutionDays([])).toBeNull();
  });

  it('uses the middle value, so one very old ticket does not distort it', () => {
    const tickets = [
      ticket('A', '2026-10-01T00:00:00Z', '2026-10-03T00:00:00Z'),
      ticket('B', '2026-10-01T00:00:00Z', '2026-10-05T00:00:00Z'),
      ticket('C', '2026-01-01T00:00:00Z', '2026-10-05T00:00:00Z'),
    ];
    expect(medianResolutionDays(tickets)).toBe(4);
  });

  it('averages the two middle values of an even count, to one decimal', () => {
    const tickets = [
      ticket('A', '2026-10-01T00:00:00Z', '2026-10-11T00:00:00Z'),
      ticket('B', '2026-10-01T00:00:00Z', '2026-10-14T00:00:00Z'),
    ];
    expect(medianResolutionDays(tickets)).toBe(11.5);
  });
});

describe('buildExecutiveSummary', () => {
  const now = at('2026-11-12T15:00:00Z');
  const tickets = [
    ticket('A', '2026-10-05T12:00:00Z', '2026-10-15T12:00:00Z', 'Translate'),
    ticket('B', '2026-10-20T12:00:00Z', '2026-11-02T12:00:00Z', 'Translate'),
    ticket('C', '2026-11-01T12:00:00Z', null, 'Edit'),
    ticket('D', '2026-08-10T12:00:00Z', '2026-09-20T12:00:00Z', 'Edit'),
    // 23:59:59 on 30 September in Bogotá: still the previous quarter, and late in it.
    ticket('E', '2026-10-01T04:59:59Z', null, 'Edit'),
    // Early in the previous quarter: inside the stretch that is compared (its first 43 days).
    ticket('F', '2026-07-10T12:00:00Z', '2026-07-20T12:00:00Z', 'Edit'),
  ];
  const cycles = [
    doneCycle('2026-10-15T12:00:00Z', false),
    doneCycle('2026-11-02T12:00:00Z', false),
    doneCycle('2026-11-05T12:00:00Z', true),
    doneCycle('2026-09-20T12:00:00Z', false),
  ];

  /** The summary the page builds for a preset, set against the window the filter picks for it. */
  function summaryOf(
    preset: PeriodPreset,
    data: { tickets: readonly Ticket[]; cycles: readonly SlaCycle[] } = { tickets, cycles },
    at_: Date = now,
  ) {
    const current = resolveWindow(preset, at_);
    if (!current) throw new Error('a window was expected');
    return buildExecutiveSummary({
      ...data,
      current,
      previous: previousPeriodWindow(current),
      buckets: bucketsOf(current, granularityFor(current.days)),
      now: at_,
    });
  }
  const quarter = (year: number, q: 1 | 2 | 3 | 4): PeriodPreset => ({
    kind: 'quarter',
    quarter: { year, quarter: q },
  });
  const summary = summaryOf(quarter(2026, 4));

  it('compares a quarter so far with the same stretch of the previous one', () => {
    // 12 Nov is 43 days into T4, so T3 is read only up to 12 Aug. D (created 10 Aug) and F count;
    // E (created 30 Sep) and D's resolution (20 Sep) fall after that point and do not.
    expect(summary.days).toBe(43);
    expect(summary.created).toEqual({ current: 3, previous: 2 });
    expect(summary.resolved).toEqual({ current: 2, previous: 1 });
    expect(summary.resolutionDays).toEqual({ current: 11.5, previous: 10 });
  });

  it('compares 30 days with the 30 days right before them', () => {
    const rolling = summaryOf({ kind: 'rolling', days: 30 }); // 14 Oct - 12 Nov against 14 Sep - 13 Oct
    expect(rolling.days).toBe(30);
    expect(rolling.created).toEqual({ current: 2, previous: 2 }); // B, C against A, E
    expect(rolling.resolved).toEqual({ current: 2, previous: 1 }); // A, B against D
    expect(rolling.previousSla.metrics.find((m) => m.metric === 'done')?.ratePercent).toBe(100);
  });

  it('never reads past the end of the previous quarter into the current one', () => {
    // T3 has 92 days and T2 only 91. On the last day of T3 the compared stretch of T2 would run past
    // its end, so it is capped there. A ticket created on 1 July belongs to T3.
    const inQ2 = ticket('G', '2026-06-30T20:00:00Z', null);
    const inQ3 = ticket('H', '2026-07-01T12:00:00Z', null);
    const result = summaryOf(
      quarter(2026, 3),
      { tickets: [inQ2, inQ3], cycles: [] },
      at('2026-09-30T20:00:00Z'),
    );
    expect(result.created).toEqual({ current: 1, previous: 1 });
  });

  it('counts what is open today, whatever its age', () => {
    expect(summary.openNow).toBe(2);
  });

  it('measures each SLA metric on its own against the 90 % goal', () => {
    const done = summary.sla.metrics.find((m) => m.metric === 'done');
    expect(done).toMatchObject({ met: 2, breached: 1, total: 3, ratePercent: 66.7 });
    expect(done?.meetsTarget).toBe(false);
    expect(summary.sla.goalMet).toBe(false);
    // The 20 September cycle is outside the compared stretch (1 Jul - 12 Aug): nothing measured.
    expect(summary.previousSla.metrics.find((m) => m.metric === 'done')?.ratePercent).toBeNull();
  });

  it('splits the period into weekly bars that add up to the period', () => {
    expect(summary.flow).toHaveLength(7); // 43 days: six full weeks and a short one
    expect(summary.flow.reduce((sum, p) => sum + p.created, 0)).toBe(3);
    expect(summary.flow.reduce((sum, p) => sum + p.resolved, 0)).toBe(2);
    expect(summary.flow[0]).toMatchObject({ created: 1, resolved: 0 }); // A, created 5 Oct
  });

  it('ranks the request types created in the period', () => {
    expect(summary.requestTypes).toEqual([
      { requestType: 'Translate', count: 2 },
      { requestType: 'Edit', count: 1 },
    ]);
  });

  it('has nothing to compare when there are no tickets', () => {
    const empty = summaryOf(quarter(2026, 4), { tickets: [], cycles: [] });
    expect(empty.created).toEqual({ current: 0, previous: 0 });
    expect(empty.resolutionDays).toEqual({ current: null, previous: null });
    expect(empty.sla.goalMet).toBeNull();
    expect(empty.requestTypes).toEqual([]);
  });
});
