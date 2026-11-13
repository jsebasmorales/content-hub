import { describe, expect, it } from 'vitest';
import { bucketsOf } from '@domain/jira/chart-buckets';
import { coverageOf, planComparison, type DataStart } from '@domain/jira/comparison';
import { buildExecutiveSummary, requestTypeCounts } from '@domain/jira/executive-summary';
import { resolveWindow, type PeriodPreset } from '@domain/jira/period-window';
import { buildSummaryReport } from '@domain/jira/summary-report';
import type { Ticket } from '@domain/jira/ticket';
import { describeDays } from '../../src/presentation/period-labels';

const at = (iso: string): Date => new Date(iso);
const now = at('2026-11-13T17:00:00Z'); // noon in Bogotá
// What the production measurement found (PLAN_FILTROS §0.4): the first ticket was created on 8 Apr 2025.
const start: DataStart = {
  tickets: at('2025-04-08T15:00:00Z'),
  cycles: at('2025-04-08T15:00:00Z'),
};

function windowOf(preset: PeriodPreset) {
  const window = resolveWindow(preset, now);
  if (!window) throw new Error('a window was expected');
  return window;
}
const custom = (from: [number, number, number], to: [number, number, number]): PeriodPreset => ({
  kind: 'custom',
  from: { year: from[0], month: from[1], day: from[2] },
  to: { year: to[0], month: to[1], day: to[2] },
});
const quarter = (year: number, n: 1 | 2 | 3 | 4): PeriodPreset => ({
  kind: 'quarter',
  quarter: { year, quarter: n },
});

function ticket(key: string, type: string, created: string, resolved?: string): Ticket {
  return {
    key,
    summary: key,
    status: resolved ? 'Done' : 'To Do',
    statusCategory: resolved ? 'done' : 'new',
    requestType: type,
    priority: null,
    assigneeId: null,
    assigneeName: null,
    requesterId: null,
    requesterName: null,
    createdAt: at(created),
    resolvedAt: resolved === undefined ? null : at(resolved),
    updatedAt: at(created),
  };
}

describe('planComparison: what a period is set against', () => {
  it('says "15 oct – 13 nov 2025" for the filter 15/10/2026 – 13/11/2026 (the dates come from the window)', () => {
    const plan = planComparison(windowOf(custom([2026, 10, 15], [2026, 11, 13])), true, start);
    expect(plan.reference).toBe('previous-year');
    expect(plan.previous.days).toBe(30);
    expect(describeDays(plan.previous)).toBe('15 oct 2025 – 13 nov 2025');
  });

  it('with the switch off sets the figures against the previous period, and covers it entirely', () => {
    const plan = planComparison(windowOf({ kind: 'rolling', days: 30 }), false, start);
    expect(plan).toMatchObject({
      reference: 'previous-period',
      yearOn: false,
      volume: { coverage: 'ok' },
      sla: { coverage: 'ok' },
    });
    expect(plan.previous.days).toBe(30);
  });

  it('keeps the same number of days when the current period is cut at today', () => {
    const plan = planComparison(windowOf(quarter(2026, 4)), true, start); // 1 Oct - 13 Nov: 44 days
    expect(plan.previous.days).toBe(44);
    expect(describeDays(plan.previous)).toBe('1 oct 2025 – 13 nov 2025');
  });
});

describe('coverage of the previous year, with the real start of the data (8 Apr 2025)', () => {
  const coverageFor = (preset: PeriodPreset) =>
    planComparison(windowOf(preset), true, start).volume;

  it('30 days and T3, T4 are covered', () => {
    expect(coverageFor({ kind: 'rolling', days: 30 }).coverage).toBe('ok');
    expect(coverageFor(quarter(2026, 3)).coverage).toBe('ok');
    expect(coverageFor(quarter(2026, 4)).coverage).toBe('ok');
  });

  it('T2 is partial: the data begins on 8 April, seven days into it', () => {
    expect(coverageFor(quarter(2026, 2))).toEqual({
      coverage: 'partial',
      since: { year: 2025, month: 4, day: 8 },
    });
  });

  it('T1 has nothing before it: none', () => {
    expect(coverageFor(quarter(2026, 1)).coverage).toBe('none');
  });

  it('no data at all is none, and a start exactly at the first instant is covered', () => {
    const previous = planComparison(
      windowOf(custom([2026, 10, 1], [2026, 10, 31])),
      true,
      start,
    ).previous;
    expect(coverageOf(previous, null).coverage).toBe('none');
    expect(coverageOf(previous, previous.range.from).coverage).toBe('ok');
    expect(coverageOf(previous, previous.range.to).coverage).toBe('none');
  });

  it('judges tickets and SLA cycles apart', () => {
    const plan = planComparison(windowOf(quarter(2026, 2)), true, {
      tickets: at('2025-04-08T15:00:00Z'),
      cycles: at('2025-06-01T15:00:00Z'),
    });
    expect([plan.volume.coverage, plan.sla.coverage]).toEqual(['partial', 'partial']);
    expect(plan.sla.since).toEqual({ year: 2025, month: 6, day: 1 });
  });
});

describe('the bars of the previous year, lined up by position', () => {
  // 60 days: weekly bars, 9 of them (the last one short).
  const window = windowOf(custom([2026, 9, 14], [2026, 11, 12]));
  const plan = planComparison(window, true, start);
  const buckets = bucketsOf(window, 'weekly');
  const previousBuckets = bucketsOf(plan.previous, 'weekly');
  const tickets = [
    ticket('now-1', 'Edit', '2026-09-15T15:00:00Z', '2026-09-20T15:00:00Z'), // bar 0
    ticket('then-1', 'Edit', '2025-09-15T15:00:00Z'), // bar 0, a year earlier
    ticket('then-2', 'Blog', '2025-09-16T15:00:00Z'),
    ticket('then-8', 'Blog', '2025-11-10T15:00:00Z'), // last bar of the previous side
  ];

  it('both sides have the same number of bars and the same first days', () => {
    expect(previousBuckets).toHaveLength(buckets.length);
    expect(previousBuckets[0]?.from).toEqual({ year: 2025, month: 9, day: 14 });
  });

  it("puts the previous year's counts on the bar at the same position, keeping empty bars", () => {
    const summary = buildExecutiveSummary({
      tickets,
      cycles: [],
      current: window,
      previous: plan.previous,
      buckets,
      trimLeadingEmpty: true,
      year: { previousBuckets, volume: true, sla: true },
      now,
    });
    expect(summary.flow).toHaveLength(buckets.length);
    expect(summary.flow[0]).toMatchObject({ created: 1, resolved: 1, previousCreated: 2 });
    expect(summary.flow.at(-1)).toMatchObject({ created: 0, previousCreated: 1 });
    expect(summary.created).toEqual({ current: 1, previous: 3 });
  });

  it('computes nothing for the previous side when the data does not reach it', () => {
    const summary = buildExecutiveSummary({
      tickets,
      cycles: [],
      current: window,
      previous: plan.previous,
      buckets,
      year: { previousBuckets, volume: false, sla: false },
      now,
    });
    expect(summary.created.previous).toBeNull();
    expect(summary.resolved.previous).toBeNull();
    expect(summary.resolutionDays.previous).toBeNull();
    expect(summary.previousSla).toBeNull();
    expect(summary.flow.every((point) => point.previousCreated === undefined)).toBe(true);
    expect(summary.requestTypes.every((row) => row.previousCount === undefined)).toBe(true);
  });

  it('without the switch the current figures and the trimmed bars are what they always were', () => {
    const off = planComparison(window, false, start);
    const summary = buildExecutiveSummary({
      tickets,
      cycles: [],
      current: window,
      previous: off.previous,
      buckets,
      trimLeadingEmpty: true,
      now,
    });
    expect(summary.created.current).toBe(1);
    expect(summary.flow.every((point) => point.previousCreated === undefined)).toBe(true);
  });
});

describe('request types with the previous year', () => {
  it('lists a type that had tickets then and none now, with 0', () => {
    const rows = requestTypeCounts(
      [ticket('a', 'Edit', '2026-11-01T15:00:00Z')],
      [ticket('b', 'Blog', '2025-11-01T15:00:00Z'), ticket('c', 'Edit', '2025-11-02T15:00:00Z')],
    );
    expect(rows).toEqual([
      { requestType: 'Edit', count: 1, previousCount: 1 },
      { requestType: 'Blog', count: 0, previousCount: 1 },
    ]);
  });

  it('adds no previous count when there is no previous side', () => {
    expect(requestTypeCounts([ticket('a', 'Edit', '2026-11-01T15:00:00Z')])).toEqual([
      { requestType: 'Edit', count: 1 },
    ]);
  });
});

describe('the summary page with the previous year', () => {
  const window = windowOf(custom([2026, 10, 15], [2026, 11, 13]));
  const plan = planComparison(window, true, start);
  const data = [
    ticket('n1', 'Edit', '2026-10-20T15:00:00Z', '2026-10-25T15:00:00Z'),
    ticket('p1', 'Edit', '2025-10-20T15:00:00Z', '2025-10-30T15:00:00Z'),
    ticket('p2', 'Blog', '2025-10-21T15:00:00Z'),
  ];

  it('carries the previous figures and every bar, and leaves the rest as it was', () => {
    const report = buildSummaryReport({
      tickets: data,
      range: window.range,
      buckets: bucketsOf(window, 'weekly'),
      year: { range: plan.previous.range, buckets: bucketsOf(plan.previous, 'weekly') },
    });
    expect(report.created).toBe(1);
    expect(report.previous).toMatchObject({ created: 2, resolved: 1, createdAndCompleted: 1 });
    expect(report.previous?.byType.map((row) => row.requestType)).toEqual(['Blog', 'Edit']);
  });

  it('has no previous when the switch is off, or null when the data does not reach it', () => {
    const base = {
      tickets: data,
      range: window.range,
      buckets: bucketsOf(window, 'weekly'),
    };
    expect(buildSummaryReport(base).previous).toBeNull();
    expect(buildSummaryReport({ ...base, year: null }).previous).toBeNull();
  });
});
