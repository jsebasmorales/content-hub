import { describe, expect, it } from 'vitest';
import { quarterRange, type TimeRange } from '@domain/jira/quarter';
import type { SlaCycle, SlaMetric } from '@domain/jira/sla';
import { bucketsOf } from '@domain/jira/chart-buckets';
import { dayOf, daysBetween } from '@domain/jira/period-window';
import {
  buildSlaReport as buildReport,
  monthsIn,
  type SlaCycleRecord,
} from '@domain/jira/sla-report';
import type { Ticket } from '@domain/jira/ticket';

const at = (iso: string): Date => new Date(iso);

/** The report with its bars drawn month by month, the way these tests have always read it. */
function buildSlaReport(input: {
  tickets: readonly Ticket[];
  records: readonly SlaCycleRecord[];
  range: TimeRange;
  now: Date;
}) {
  const from = dayOf(input.range.from);
  // The filter cuts a period at today, so the bars never run past it.
  const end = new Date(Math.min(input.range.to.getTime() - 1, input.now.getTime()));
  const to = dayOf(end);
  const window = { from, to, days: daysBetween(from, to), range: input.range };
  return buildReport({ ...input, buckets: bucketsOf(window, 'monthly'), trimLeadingEmpty: true });
}
const monthOfBar = (row: { bucket: { from: { year: number; month: number } } } | undefined) =>
  row && { year: row.bucket.from.year, month: row.bucket.from.month };
const now = at('2026-11-12T15:00:00Z');
const q4 = quarterRange({ year: 2026, quarter: 4 });

function ticket(key: string, requestType: string, assignee: string | null = 'Ana'): Ticket {
  return {
    key,
    summary: `Summary of ${key}`,
    status: 'To Do',
    statusCategory: 'new',
    requestType,
    priority: null,
    assigneeId: assignee,
    assigneeName: assignee,
    requesterId: null,
    requesterName: null,
    createdAt: at('2026-09-01T10:00:00Z'),
    resolvedAt: null,
    updatedAt: at('2026-09-01T10:00:00Z'),
  };
}

function completed(
  ticketKey: string,
  metric: SlaMetric,
  stoppedAt: string,
  breached: boolean,
): SlaCycleRecord {
  return {
    ticketKey,
    cycle: {
      metric,
      state: 'completed',
      startedAt: at('2026-09-01T10:00:00Z'),
      stoppedAt: at(stoppedAt),
      breachAt: null,
      breached,
      paused: false,
    },
  };
}

function ongoing(
  ticketKey: string,
  metric: SlaMetric,
  breachAt: string | null,
  paused = false,
): SlaCycleRecord {
  const cycle: SlaCycle = {
    metric,
    state: 'ongoing',
    startedAt: at('2026-11-01T10:00:00Z'),
    stoppedAt: null,
    breachAt: breachAt ? at(breachAt) : null,
    breached: false,
    paused,
  };
  return { ticketKey, cycle };
}

const tickets = [
  ticket('A-1', 'Edit'),
  ticket('B-1', 'Translate'),
  ticket('C-1', 'Edit', null),
  ticket('D-1', 'Translate'),
];
const records: SlaCycleRecord[] = [
  completed('A-1', 'done', '2026-10-15T12:00:00Z', false),
  completed('A-1', 'first_response', '2026-10-02T12:00:00Z', true),
  completed('B-1', 'done', '2026-11-05T12:00:00Z', true),
  completed('B-1', 'first_response', '2026-10-20T12:00:00Z', false),
  // Outside the quarter: it must not count anywhere.
  completed('A-1', 'done', '2026-09-20T12:00:00Z', true),
  ongoing('C-1', 'done', '2026-11-13T12:00:00Z'),
  ongoing('C-1', 'first_response', '2026-11-20T12:00:00Z', true),
  ongoing('D-1', 'done', '2026-11-10T12:00:00Z'),
];

const report = buildSlaReport({ tickets, records, range: q4, now });
const rate = (compliance: typeof report.overall | undefined, metric: SlaMetric) =>
  compliance?.metrics.find((m) => m.metric === metric);

describe('buildSlaReport: the period as a whole', () => {
  it('counts completed cycles by when they ended, and running ones that are already late', () => {
    // done: A met, B breached, D (running, past its limit) breached; C is still on time, so excluded.
    expect(rate(report.overall, 'done')).toMatchObject({ met: 1, breached: 2, ratePercent: 33.3 });
    expect(rate(report.overall, 'first_response')).toMatchObject({
      met: 1,
      breached: 1,
      ratePercent: 50,
    });
    expect(report.overall.goalMet).toBe(false);
  });

  it('leaves out other periods', () => {
    const q3 = quarterRange({ year: 2026, quarter: 3 });
    const earlier = buildSlaReport({ tickets, records, range: q3, now });
    expect(rate(earlier.overall, 'done')).toMatchObject({ met: 0, breached: 1, total: 1 });
    expect(rate(earlier.overall, 'first_response')?.total).toBe(0);
  });
});

describe('buildSlaReport: by bar (months here)', () => {
  it('has one row per month so far, leaving out months that have not happened', () => {
    // The quarter runs to December, but today is 12 November.
    expect(report.byBucket.map((m) => monthOfBar(m))).toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
    ]);
  });

  it('starts at the first month with something measured, not at the start of the period', () => {
    const long = buildSlaReport({
      tickets,
      records,
      range: { from: at('2024-01-01T05:00:00Z'), to: at('2027-01-01T05:00:00Z') },
      now,
    });
    // Sep 2026 has a cycle (A-1, 20 Sep); the 20 months before it have none.
    expect(monthOfBar(long.byBucket[0])).toEqual({ year: 2026, month: 9 });
    expect(monthOfBar(long.byBucket[long.byBucket.length - 1])).toEqual({ year: 2026, month: 11 });
  });

  it('keeps an empty month that falls between months with data', () => {
    const gap = buildSlaReport({
      tickets,
      records: [
        completed('A-1', 'done', '2026-08-15T12:00:00Z', false),
        completed('A-1', 'done', '2026-10-15T12:00:00Z', false),
      ],
      range: { from: at('2026-08-01T05:00:00Z'), to: at('2026-11-01T05:00:00Z') },
      now,
    });
    expect(gap.byBucket.map((m) => m.bucket.from.month)).toEqual([8, 9, 10]);
    expect(rate(gap.byBucket[1]?.compliance, 'done')?.ratePercent).toBeNull();
  });

  it('puts each cycle in the month it ended, and running ones in the current month', () => {
    const [october, november, december] = report.byBucket;
    expect(rate(october?.compliance, 'done')).toMatchObject({ met: 1, breached: 0 });
    expect(rate(october?.compliance, 'first_response')).toMatchObject({ met: 1, breached: 1 });
    expect(rate(november?.compliance, 'done')).toMatchObject({ met: 0, breached: 2 });
    expect(december).toBeUndefined();
  });

  it('cuts a month at the edge of a custom period', () => {
    const custom = buildSlaReport({
      tickets,
      records,
      range: { from: at('2026-10-10T05:00:00Z'), to: at('2026-10-20T05:00:00Z') },
      now,
    });
    expect(custom.byBucket).toHaveLength(1);
    // Only A-1's done (15 Oct) is inside 10-20 Oct; the 2 Oct and 20 Oct cycles are not.
    expect(rate(custom.byBucket[0]?.compliance, 'done')?.total).toBe(1);
    expect(rate(custom.byBucket[0]?.compliance, 'first_response')?.total).toBe(0);
  });

  it('shows at most 36 months, the latest ones', () => {
    const months = monthsIn(
      { from: at('2020-01-01T05:00:00Z'), to: at('2026-12-01T05:00:00Z') },
      'America/Bogota',
    );
    expect(months).toHaveLength(36);
    expect(months[35]).toEqual({ year: 2026, month: 11 });
  });
});

describe('buildSlaReport: by request type', () => {
  it('ranks the types by cycles measured', () => {
    expect(report.byRequestType.map((r) => [r.requestType, r.measured])).toEqual([
      ['Translate', 3],
      ['Edit', 2],
    ]);
  });

  it('measures each type on its own', () => {
    const edit = report.byRequestType.find((r) => r.requestType === 'Edit');
    expect(rate(edit?.compliance, 'done')?.ratePercent).toBe(100);
    expect(rate(edit?.compliance, 'first_response')?.ratePercent).toBe(0);
  });

  it('ignores cycles of a ticket it does not know instead of inventing a type', () => {
    const orphan = buildSlaReport({
      tickets,
      records: [...records, completed('GONE-1', 'done', '2026-10-15T12:00:00Z', true)],
      range: q4,
      now,
    });
    expect(orphan.byRequestType.map((r) => r.requestType).sort()).toEqual(['Edit', 'Translate']);
    expect(orphan.byRequestType.reduce((sum, r) => sum + r.measured, 0)).toBe(5);
  });
});

describe('buildSlaReport: running clocks', () => {
  it('lists running clocks, the most urgent first, and says which are already late', () => {
    expect(report.ongoing.map((c) => [c.ticketKey, c.breached])).toEqual([
      ['D-1', true],
      ['C-1', false],
    ]);
    expect(report.ongoing[0]).toMatchObject({
      summary: 'Summary of D-1',
      metric: 'done',
      assigneeName: 'Ana',
    });
  });

  it('counts paused clocks without listing them, and ignores the chosen period', () => {
    expect(report.pausedCount).toBe(1);
    const q1 = quarterRange({ year: 2026, quarter: 1 });
    expect(buildSlaReport({ tickets, records, range: q1, now }).ongoing).toHaveLength(2);
  });

  it('puts a clock with no known limit last', () => {
    const withUnknown = buildSlaReport({
      tickets,
      records: [...records, ongoing('A-1', 'done', null)],
      range: q4,
      now,
    });
    expect(withUnknown.ongoing[withUnknown.ongoing.length - 1]?.breachAt).toBeNull();
  });
});

describe('buildSlaReport: finished tickets and retired types', () => {
  const finished: Ticket = {
    ...ticket('E-1', 'Edit'),
    status: 'Done',
    statusCategory: 'done',
  };
  const retired = ticket('F-1', "Translate Marketing Materials - Moi - DON'T USE");

  it('keeps a closed ticket with a clock that never stopped out of the live list', () => {
    const result = buildSlaReport({
      tickets: [...tickets, finished],
      records: [...records, ongoing('E-1', 'first_response', '2026-04-20T12:00:00Z')],
      range: q4,
      now,
    });
    expect(result.ongoing.map((c) => c.ticketKey)).not.toContain('E-1');
    expect(result.closedWithOpenClockCount).toBe(1);
    // It is not hidden from the figures: Jira still counts the clock, and so does the Hub.
    expect(rate(result.overall, 'first_response')).toMatchObject({ met: 1, breached: 2 });
  });

  it('counts a paused clock only for tickets that are still open', () => {
    const result = buildSlaReport({
      tickets: [...tickets, finished],
      records: [...records, ongoing('E-1', 'done', '2026-11-30T12:00:00Z', true)],
      range: q4,
      now,
    });
    expect(result.pausedCount).toBe(1);
    expect(result.closedWithOpenClockCount).toBe(1);
  });

  it('leaves a retired request type out of the breakdown but not out of the totals', () => {
    const result = buildSlaReport({
      tickets: [...tickets, retired],
      records: [...records, completed('F-1', 'done', '2026-10-15T12:00:00Z', false)],
      range: q4,
      now,
    });
    expect(result.byRequestType.map((r) => r.requestType)).toEqual(['Translate', 'Edit']);
    expect(rate(result.overall, 'done')?.total).toBe(4);
  });
});

describe('buildSlaReport: nothing yet', () => {
  it('is empty and says nothing is measured', () => {
    const empty = buildSlaReport({ tickets: [], records: [], range: q4, now });
    expect(empty.overall.goalMet).toBeNull();
    expect(empty.byRequestType).toEqual([]);
    expect(empty.ongoing).toEqual([]);
    expect(empty.byBucket).toEqual([]);
  });
});
