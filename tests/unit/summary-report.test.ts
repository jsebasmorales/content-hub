import { describe, expect, it } from 'vitest';
import { quarterRange } from '@domain/jira/quarter';
import { buildSummaryReport, summaryTypeOptions } from '@domain/jira/summary-report';
import type { StatusCategory, Ticket } from '@domain/jira/ticket';
import { parseSummaryQuery } from '@presentation/summary-query';

const at = (iso: string): Date => new Date(iso);
const now = at('2026-11-12T15:00:00Z');
const q4 = quarterRange({ year: 2026, quarter: 4 });

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
  const report = buildSummaryReport({ tickets, range: q4, now });

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
    const quiet = buildSummaryReport({
      tickets,
      range: quarterRange({ year: 2025, quarter: 1 }),
      now,
    });
    expect(quiet).toMatchObject({ created: 0, resolved: 0, completionPercent: null });
    expect(quiet.months).toEqual([]);
  });
});

describe('buildSummaryReport: month by month', () => {
  it('lists the months from the first with activity up to the current one', () => {
    const { months } = buildSummaryReport({ tickets, range: q4, now });
    expect(months.map((m) => m.month.month)).toEqual([10, 11]);
    expect(months[0]).toMatchObject({ created: 3, resolved: 2 });
    expect(months[1]).toMatchObject({ created: 1, resolved: 0 });
  });

  it('counts only the days inside a period that cuts a month', () => {
    const { months } = buildSummaryReport({
      tickets,
      range: { from: at('2026-10-08T05:00:00Z'), to: at('2026-10-25T05:00:00Z') },
      now,
    });
    // Only B (10 Oct) and E (20 Oct) were created inside; A and C were completed before the 8th or after.
    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({ created: 2, resolved: 1 });
  });
});

describe('buildSummaryReport: by request type', () => {
  const { byType } = buildSummaryReport({ tickets, range: q4, now });

  it('shows each type with its own figures, most created first', () => {
    expect(byType).toEqual([
      { requestType: 'Edit', created: 2, resolved: 1, completionPercent: 50, openNow: 1 },
      { requestType: 'Translate', created: 1, resolved: 1, completionPercent: 0, openNow: 1 },
    ]);
  });

  it('leaves a retired type out of the table but not out of the totals', () => {
    expect(byType.map((row) => row.requestType)).not.toContain("Translate - Moi - DON'T USE");
    expect(buildSummaryReport({ tickets, range: q4, now }).created).toBe(4);
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

describe('the address of /resumen', () => {
  it('reads the period and the request type', () => {
    expect(parseSummaryQuery(new URLSearchParams('trimestre=2026-T3&tipo=Edit'))).toEqual({
      period: { quarter: '2026-T3', from: undefined, to: undefined },
      requestType: 'Edit',
    });
  });

  it('drops an oversized type', () => {
    expect(
      parseSummaryQuery(new URLSearchParams(`tipo=${'x'.repeat(300)}`)).requestType,
    ).toBeUndefined();
  });
});
