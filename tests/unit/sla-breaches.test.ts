import { describe, expect, it } from 'vitest';
import { quarterRange } from '@domain/jira/quarter';
import type { SlaMetric } from '@domain/jira/sla';
import { cycleInPeriod, slaCompliance } from '@domain/jira/sla-compliance';
import {
  NO_BREACH_FILTER,
  buildBreachReport,
  matchesBreachFilter,
  sanitizeBreachFilter,
} from '@domain/jira/sla-breaches';
import type { SlaCycleRecord } from '@domain/jira/sla-report';
import { UNASSIGNED } from '@domain/jira/task-list';
import type { Ticket } from '@domain/jira/ticket';
import { EMPTY_RAW_FILTER } from '@domain/jira/global-filter';
import { breachPageHref, parseBreachQuery } from '@presentation/breach-query';

const at = (iso: string): Date => new Date(iso);
const now = at('2026-11-12T15:00:00Z');
const q4 = quarterRange({ year: 2026, quarter: 4 });

function ticket(key: string, requestType: string, assignee: string | null, closed = false): Ticket {
  return {
    key,
    summary: `Summary of ${key}`,
    status: closed ? 'Done' : 'To Do',
    statusCategory: closed ? 'done' : 'new',
    requestType,
    priority: null,
    assigneeId: assignee ? `id-${assignee}` : null,
    assigneeName: assignee,
    requesterId: null,
    requesterName: null,
    createdAt: at('2026-09-01T10:00:00Z'),
    resolvedAt: null,
    updatedAt: at('2026-09-01T10:00:00Z'),
  };
}

function finished(
  ticketKey: string,
  metric: SlaMetric,
  breachAt: string,
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
      breachAt: at(breachAt),
      breached,
      paused: false,
    },
  };
}

function running(
  ticketKey: string,
  metric: SlaMetric,
  breachAt: string,
  paused = false,
): SlaCycleRecord {
  return {
    ticketKey,
    cycle: {
      metric,
      state: 'ongoing',
      startedAt: at('2026-11-01T10:00:00Z'),
      stoppedAt: null,
      breachAt: at(breachAt),
      breached: false,
      paused,
    },
  };
}

const tickets = [
  ticket('A-1', 'Edit', 'Ana'),
  ticket('B-1', 'Translate', 'Beto'),
  ticket('C-1', 'Edit', null),
  ticket('D-1', 'Edit', 'Ana', true),
  ticket('R-1', "Translate - Moi - DON'T USE", 'Beto'),
];

const records: SlaCycleRecord[] = [
  // Missed by 2 days.
  finished('A-1', 'done', '2026-10-10T12:00:00Z', '2026-10-12T12:00:00Z', true),
  // Met: not a breach.
  finished('A-1', 'first_response', '2026-10-10T12:00:00Z', '2026-10-09T12:00:00Z', false),
  // Missed by 6 hours.
  finished('B-1', 'first_response', '2026-10-20T06:00:00Z', '2026-10-20T12:00:00Z', true),
  // Still running and 51 hours past its limit: a breach of "now".
  running('C-1', 'done', '2026-11-10T12:00:00Z'),
  // Running but not late yet, and a paused one: neither is a breach.
  running('A-1', 'done', '2026-11-20T12:00:00Z'),
  running('B-1', 'done', '2026-11-01T12:00:00Z', true),
  // The ticket is done but the clock never stopped, and it is late.
  running('D-1', 'first_response', '2026-04-20T12:00:00Z'),
  // Outside the period.
  finished('A-1', 'done', '2026-08-10T12:00:00Z', '2026-08-15T12:00:00Z', true),
  // A retired type.
  finished('R-1', 'done', '2026-10-05T12:00:00Z', '2026-10-06T12:00:00Z', true),
];

const report = buildBreachReport({ tickets, records, range: q4, now });
const keys = (rows: readonly { ticketKey: string }[]) => rows.map((r) => r.ticketKey);

describe('buildBreachReport', () => {
  it('lists only cycles that missed their goal inside the period, worst delay first', () => {
    expect(keys(report.rows)).toEqual(['D-1', 'C-1', 'A-1', 'R-1', 'B-1']);
    // D-1 has been late the longest (since April), then C-1 (51 h running), A-1 (48 h), R-1 (1 day).
    expect(report.rows.map((r) => r.metric)).toEqual([
      'first_response',
      'done',
      'done',
      'done',
      'first_response',
    ]);
  });

  it('measures the delay from the limit to the end, or to now for a running clock', () => {
    const delay = (key: string) => report.rows.find((r) => r.ticketKey === key)?.overdueMs;
    const hour = 3_600_000;
    expect(delay('A-1')).toBe(48 * hour);
    expect(delay('B-1')).toBe(6 * hour);
    expect(delay('C-1')).toBe(51 * hour);
  });

  it('marks running clocks, and tickets already closed whose clock never stopped', () => {
    const row = (key: string) => report.rows.find((r) => r.ticketKey === key);
    expect(row('C-1')).toMatchObject({ running: true, ticketClosed: false, endedAt: null });
    expect(row('D-1')).toMatchObject({ running: true, ticketClosed: true });
    expect(row('A-1')).toMatchObject({ running: false, ticketClosed: false });
  });

  it('adds up to the compliance figures: same cycles, same rule', () => {
    const inPeriod = records.map((r) => r.cycle).filter((cycle) => cycleInPeriod(cycle, q4, now));
    const breachedOf = (metric: SlaMetric) =>
      slaCompliance(inPeriod, now).metrics.find((m) => m.metric === metric)?.breached;
    expect(report.summary.byMetric).toEqual({
      done: breachedOf('done'),
      first_response: breachedOf('first_response'),
    });
  });

  it('summarises who and what accumulate the most', () => {
    expect(report.summary.total).toBe(5);
    expect(report.summary.byAssignee[0]).toEqual({ label: 'Ana', count: 2 });
    expect(report.summary.byAssignee.map((a) => a.label)).toContain('Sin asignar');
    // The retired type is left out of the by-type summary.
    expect(report.summary.byRequestType.map((t) => t.label)).toEqual(['Edit', 'Translate']);
  });

  it('is empty when nothing went wrong', () => {
    const quiet = buildBreachReport({ tickets, records: [], range: q4, now });
    expect(quiet.rows).toEqual([]);
    expect(quiet.summary.total).toBe(0);
    expect(quiet.options.assignees).toEqual([]);
  });
});

describe('breach filters', () => {
  const run = (raw: Parameters<typeof sanitizeBreachFilter>[0]) => {
    const filter = sanitizeBreachFilter(raw, report.options);
    return keys(report.rows.filter((row) => matchesBreachFilter(row, filter)));
  };

  it('offers the people that have a breach in the period; the request type is global now', () => {
    expect(report.options).not.toHaveProperty('requestTypes');
    expect(report.options.assignees.map((o) => o.label)).toEqual(['Sin asignar', 'Ana', 'Beto']);
  });

  it('filters by metric and assignee, and combines them', () => {
    expect(run({ metric: 'first_response' })).toEqual(['D-1', 'B-1']);
    expect(run({ assigneeId: UNASSIGNED })).toEqual(['C-1']);
    expect(run({ assigneeId: 'id-Ana', metric: 'done' })).toEqual(['A-1']);
  });

  it('drops values that do not exist instead of emptying the list', () => {
    expect(sanitizeBreachFilter({ metric: 'nope', assigneeId: 'y' }, report.options)).toEqual(
      NO_BREACH_FILTER,
    );
    expect(run({ metric: 'nope' })).toHaveLength(5);
  });
});

describe('the address of /incumplimientos', () => {
  it('reads the filters of the list and the page, and hands the global filter on untouched', () => {
    const query = parseBreachQuery(
      new URLSearchParams('metrica=done&asignado=x&pagina=2&periodo=T3'),
      EMPTY_RAW_FILTER,
    );
    expect(query.filter).toEqual({ metric: 'done', assigneeId: 'x' });
    expect(query.page).toBe(2);
    expect(query.global).toBe(EMPTY_RAW_FILTER);
  });

  it('treats malformed values as no filter and the first page', () => {
    expect(parseBreachQuery(new URLSearchParams('pagina=abc'), EMPTY_RAW_FILTER).page).toBe(1);
    expect(
      parseBreachQuery(new URLSearchParams(`metrica=${'x'.repeat(300)}`), EMPTY_RAW_FILTER).filter,
    ).toEqual({});
  });

  it('keeps every filter through the pages, and drops one-shot messages', () => {
    const params = new URLSearchParams('desde=2026-01-01&hasta=2026-03-31&metrica=done&sync=wait');
    expect(breachPageHref(params, 3)).toBe(
      '/incumplimientos?desde=2026-01-01&hasta=2026-03-31&metrica=done&pagina=3',
    );
    expect(breachPageHref(new URLSearchParams('pagina=4'), 1)).toBe('/incumplimientos');
  });
});
