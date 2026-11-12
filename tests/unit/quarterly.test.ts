import { describe, expect, it } from 'vitest';
import type { SlaCycle } from '@domain/jira/sla';
import { QUARTERS_SHOWN, buildQuarterlyReport } from '@domain/jira/quarterly';
import type { Ticket } from '@domain/jira/ticket';

const at = (iso: string): Date => new Date(iso);
const now = at('2026-11-12T15:00:00Z');

function ticket(key: string, createdAt: string, resolvedAt: string | null): Ticket {
  return {
    key,
    summary: key,
    status: resolvedAt ? 'Done' : 'To Do',
    statusCategory: resolvedAt ? 'done' : 'new',
    requestType: 'Edit',
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

function finished(stoppedAt: string, breached: boolean): SlaCycle {
  return {
    metric: 'done',
    state: 'completed',
    startedAt: at('2026-01-01T10:00:00Z'),
    stoppedAt: at(stoppedAt),
    breachAt: null,
    breached,
    paused: false,
  };
}

const tickets = [
  ticket('A', '2026-04-10T10:00:00Z', '2026-04-20T10:00:00Z'), // T2: 10 days
  ticket('B', '2026-05-10T10:00:00Z', '2026-06-09T10:00:00Z'), // T2: 30 days
  ticket('C', '2026-08-10T10:00:00Z', '2026-08-12T10:00:00Z'), // T3: 2 days
  ticket('D', '2026-10-05T10:00:00Z', null), // T4, still open
];
const cycles = [
  finished('2026-04-20T10:00:00Z', false),
  finished('2026-06-09T10:00:00Z', true),
  finished('2026-08-12T10:00:00Z', false),
];

const report = buildQuarterlyReport({ tickets, cycles, now });
const byLabel = (year: number, quarter: number) =>
  report.quarters.find((q) => q.quarter.year === year && q.quarter.quarter === quarter);

describe('buildQuarterlyReport', () => {
  it('starts at the first quarter with something in it and ends with the current one', () => {
    expect(
      report.quarters.map((q) => `${String(q.quarter.year)}-T${String(q.quarter.quarter)}`),
    ).toEqual(['2026-T2', '2026-T3', '2026-T4']);
  });

  it('counts what was created and resolved in each quarter, whole', () => {
    expect(byLabel(2026, 2)).toMatchObject({ created: 2, resolved: 2 });
    expect(byLabel(2026, 3)).toMatchObject({ created: 1, resolved: 1 });
    expect(byLabel(2026, 4)).toMatchObject({ created: 1, resolved: 0 });
  });

  it('gives the typical resolution time of each quarter, or nothing when nothing was resolved', () => {
    expect(byLabel(2026, 2)?.resolutionDays).toBe(20);
    expect(byLabel(2026, 3)?.resolutionDays).toBe(2);
    expect(byLabel(2026, 4)?.resolutionDays).toBeNull();
  });

  it('measures SLA compliance of each quarter on its own', () => {
    const rate = (year: number, quarter: number) =>
      byLabel(year, quarter)?.sla.metrics.find((m) => m.metric === 'done');
    expect(rate(2026, 2)).toMatchObject({ met: 1, breached: 1, ratePercent: 50 });
    expect(rate(2026, 3)).toMatchObject({ met: 1, breached: 0, ratePercent: 100 });
    expect(byLabel(2026, 2)?.sla.goalMet).toBe(false);
  });

  it('marks only the current quarter as in progress, with the days that have passed', () => {
    expect(report.quarters.filter((q) => q.inProgress)).toHaveLength(1);
    expect(byLabel(2026, 4)).toMatchObject({ inProgress: true, elapsedDays: 43 });
    expect(byLabel(2026, 3)).toMatchObject({ inProgress: false, elapsedDays: null });
  });

  it('keeps an empty quarter that falls between quarters with data', () => {
    const gap = buildQuarterlyReport({
      tickets: [
        ticket('A', '2026-01-10T10:00:00Z', null),
        ticket('Z', '2026-10-10T10:00:00Z', null),
      ],
      cycles: [],
      now,
    });
    expect(gap.quarters.map((q) => q.quarter.quarter)).toEqual([1, 2, 3, 4]);
    expect(gap.quarters[1]).toMatchObject({ created: 0, resolved: 0 });
  });

  it('looks back no further than eight quarters', () => {
    const old = buildQuarterlyReport({
      tickets: [ticket('Old', '2020-01-10T10:00:00Z', null)],
      cycles: [],
      now,
    });
    expect(QUARTERS_SHOWN).toBe(8);
    expect(old.quarters).toEqual([]);
    const within = buildQuarterlyReport({
      tickets: [ticket('Edge', '2025-01-10T10:00:00Z', null)],
      cycles: [],
      now,
    });
    expect(within.quarters).toHaveLength(8);
    expect(within.quarters[0]?.quarter).toEqual({ year: 2025, quarter: 1 });
  });

  it('is empty before the first sync', () => {
    expect(buildQuarterlyReport({ tickets: [], cycles: [], now }).quarters).toEqual([]);
  });
});
