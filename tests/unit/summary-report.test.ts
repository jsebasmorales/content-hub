import { describe, expect, it } from 'vitest';
import { bucketsOf } from '@domain/jira/chart-buckets';
import { granularityFor, resolveWindow, type PeriodPreset } from '@domain/jira/period-window';
import { buildSummaryReport, summaryTypeOptions } from '@domain/jira/summary-report';
import type { StatusCategory, Ticket } from '@domain/jira/ticket';

const at = (iso: string): Date => new Date(iso);
const now = at('2026-11-12T15:00:00Z');

/** The report the page builds for a preset, with the bars the chart would draw. */
function reportFor(preset: PeriodPreset, data: readonly Ticket[] = tickets) {
  const window = resolveWindow(preset, now);
  if (!window) throw new Error('a window was expected');
  const granularity = granularityFor(window.days);
  return buildSummaryReport({
    tickets: data,
    range: window.range,
    buckets: bucketsOf(window, granularity),
    trimLeadingEmpty: granularity === 'monthly',
  });
}
const q4: PeriodPreset = { kind: 'quarter', quarter: { year: 2026, quarter: 4 } };

function ticket(
  key: string,
  type: string,
  created: string,
  options: { resolved?: string; category?: StatusCategory; status?: string } = {},
): Ticket {
  const done = options.resolved !== undefined;
  const category = options.category ?? (done ? 'done' : 'new');
  return {
    key,
    summary: key,
    status: options.status ?? (done ? 'Done' : category === 'new' ? 'To Do' : 'In progress'),
    statusCategory: category,
    requestType: type,
    priority: null,
    assigneeId: null,
    assigneeName: null,
    requesterId: null,
    requesterName: null,
    createdAt: at(created),
    resolvedAt: options.resolved === undefined ? null : at(options.resolved),
    updatedAt: at(created),
  };
}

const tickets = [
  ticket('A', 'Edit', '2026-10-05T10:00:00Z', { resolved: '2026-10-15T10:00:00Z' }),
  ticket('B', 'Edit', '2026-10-10T10:00:00Z', { category: 'indeterminate' }),
  // Created last quarter, completed this one: counts as completed here, not as created.
  ticket('C', 'Translate', '2026-09-20T10:00:00Z', { resolved: '2026-10-03T10:00:00Z' }),
  ticket('D', 'Translate', '2026-11-01T10:00:00Z'),
  ticket('E', "Translate - Moi - DON'T USE", '2026-10-20T10:00:00Z'),
];

describe('buildSummaryReport: created, completed and open', () => {
  const report = reportFor(q4);

  it('counts what was created and what was completed in the period', () => {
    expect(report.created).toBe(4);
    expect(report.resolved).toBe(2);
  });

  it('measures how much of what was created is already completed', () => {
    expect(report.createdAndCompleted).toBe(1);
    expect(report.completionPercent).toBe(25);
  });

  it('gives the typical time to complete what was completed in the period', () => {
    expect(report.resolutionDays).toBe(11.5);
  });

  it('describes what is open today, apart from the period', () => {
    expect(report.openNow).toMatchObject({ total: 3, inProgress: 1, notStarted: 2 });
    expect(report.openNow.byStatus).toEqual([
      { status: 'To Do', count: 2 },
      { status: 'In progress', count: 1 },
    ]);
  });

  it('has no percentage when nothing was created', () => {
    const quiet = reportFor({ kind: 'quarter', quarter: { year: 2026, quarter: 1 } });
    expect(quiet).toMatchObject({ created: 0, resolved: 0, completionPercent: null });
    expect(quiet.flow).toEqual([]);
  });
});

describe('buildSummaryReport: bar by bar', () => {
  it('draws one bar per week from the first day of the period, and they add up to the period', () => {
    const { flow } = reportFor(q4); // 1 Oct - 12 Nov: 43 days
    expect(flow).toHaveLength(7);
    expect(flow.reduce((sum, point) => sum + point.created, 0)).toBe(4);
    expect(flow.reduce((sum, point) => sum + point.resolved, 0)).toBe(2);
    expect(flow[0]).toMatchObject({ created: 1, resolved: 1 }); // A created on 5 Oct, C resolved on 3 Oct
  });

  it('draws one bar per day for a short period', () => {
    const { flow } = reportFor({
      kind: 'custom',
      from: { year: 2026, month: 10, day: 8 },
      to: { year: 2026, month: 10, day: 14 },
    });
    expect(flow).toHaveLength(7);
    expect(flow.find((point) => point.bucket.from.day === 10)).toMatchObject({ created: 1 }); // B
  });

  it('draws months, from the first with activity, for a long period', () => {
    const { flow } = reportFor({
      kind: 'custom',
      from: { year: 2026, month: 1, day: 1 },
      to: { year: 2026, month: 11, day: 12 },
    });
    expect(flow.map((point) => point.bucket.from.month)).toEqual([9, 10, 11]);
    expect(flow[1]).toMatchObject({ created: 3, resolved: 2 });
  });

  it('has no bars when nothing happened in the period', () => {
    const quiet = reportFor({
      kind: 'custom',
      from: { year: 2026, month: 1, day: 1 },
      to: { year: 2026, month: 3, day: 31 },
    });
    expect(quiet.flow).toEqual([]);
  });
});

describe('buildSummaryReport: by request type', () => {
  const { byType } = reportFor(q4);

  it('shows each type with its own figures, most created first', () => {
    expect(byType).toEqual([
      { requestType: 'Edit', created: 2, resolved: 1, completionPercent: 50, openNow: 1 },
      { requestType: 'Translate', created: 1, resolved: 1, completionPercent: 0, openNow: 1 },
    ]);
  });

  it('leaves a retired type out of the table but not out of the totals', () => {
    expect(byType.map((row) => row.requestType)).not.toContain("Translate - Moi - DON'T USE");
    expect(reportFor(q4).created).toBe(4);
  });
});

describe('summaryTypeOptions', () => {
  it('offers the types that exist with how many tickets each has, without retired ones', () => {
    expect(summaryTypeOptions(tickets)).toEqual([
      { value: 'Edit', label: 'Edit', count: 2 },
      { value: 'Translate', label: 'Translate', count: 2 },
    ]);
  });
});
