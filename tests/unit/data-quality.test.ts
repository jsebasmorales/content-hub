import { describe, expect, it } from 'vitest';
import { buildDataQuality } from '@domain/jira/data-quality';
import type { SlaCycle } from '@domain/jira/sla';
import type { SlaCycleRecord } from '@domain/jira/sla-report';
import type { Ticket } from '@domain/jira/ticket';
import { formatDuration } from '@presentation/format-moment';

const at = (iso: string): Date => new Date(iso);

function ticket(
  key: string,
  options: {
    done?: boolean;
    assignee?: string | null;
    type?: string;
    created?: string;
    updated?: string;
  } = {},
): Ticket {
  const done = options.done ?? false;
  return {
    key,
    summary: key,
    status: done ? 'Done' : 'To Do',
    statusCategory: done ? 'done' : 'new',
    requestType: options.type ?? 'Edit',
    priority: null,
    assigneeId: options.assignee === undefined ? 'a1' : options.assignee,
    assigneeName: 'Ana',
    requesterId: null,
    requesterName: null,
    createdAt: at(options.created ?? '2026-05-01T10:00:00Z'),
    resolvedAt: done ? at('2026-06-01T10:00:00Z') : null,
    updatedAt: at(options.updated ?? '2026-06-01T10:00:00Z'),
  };
}

function ongoing(ticketKey: string, paused: boolean): SlaCycleRecord {
  const cycle: SlaCycle = {
    metric: 'first_response',
    state: 'ongoing',
    startedAt: at('2026-05-01T10:00:00Z'),
    stoppedAt: null,
    breachAt: at('2026-05-05T10:00:00Z'),
    breached: false,
    paused,
  };
  return { ticketKey, cycle };
}

describe('buildDataQuality', () => {
  const tickets = [
    ticket('A', { created: '2026-01-10T10:00:00Z' }),
    ticket('B', { assignee: null }),
    ticket('C', { done: true }),
    ticket('D', { type: "Translate - Moi - DON'T USE", updated: '2026-11-10T10:00:00Z' }),
  ];
  const records = [
    ongoing('C', false), // closed ticket, clock never stopped
    ongoing('C', true), // also closed: counts as closed, not as paused
    ongoing('A', true), // open ticket, paused
    ongoing('B', false), // open ticket, running: nothing to report
    ongoing('GONE', false), // unknown ticket: ignored
  ];
  const quality = buildDataQuality({ tickets, records });

  it('counts the tickets, the open ones and the ones nobody owns', () => {
    expect(quality).toMatchObject({ tickets: 4, openTickets: 3, openWithoutAssignee: 1 });
  });

  it('reports clocks that never stopped on closed tickets, apart from paused ones', () => {
    expect(quality.closedWithOpenClock).toBe(2);
    expect(quality.pausedOnOpenTickets).toBe(1);
  });

  it('counts tickets of a retired type, which stay in the data', () => {
    expect(quality.retiredTypeTickets).toBe(1);
  });

  it('gives the oldest creation and the latest change', () => {
    expect(quality.oldestCreatedAt).toEqual(at('2026-01-10T10:00:00Z'));
    expect(quality.newestUpdatedAt).toEqual(at('2026-11-10T10:00:00Z'));
  });

  it('is all zeros and no dates before the first sync', () => {
    expect(buildDataQuality({ tickets: [], records: [] })).toEqual({
      tickets: 0,
      openTickets: 0,
      openWithoutAssignee: 0,
      closedWithOpenClock: 0,
      pausedOnOpenTickets: 0,
      retiredTypeTickets: 0,
      oldestCreatedAt: null,
      newestUpdatedAt: null,
    });
  });
});

describe('formatDuration (how long a sync took)', () => {
  it('speaks in seconds for short runs and minutes for long ones', () => {
    expect(formatDuration(400)).toBe('menos de 1 s');
    expect(formatDuration(12_000)).toBe('12 s');
    expect(formatDuration(59_400)).toBe('59 s');
    expect(formatDuration(3 * 60_000)).toBe('3 min');
  });
});
