import type { IssueSnapshot } from '@application/ports/jira';

export const at = (iso: string): Date => new Date(iso);

/** A small, valid ticket with one transition and one completed SLA cycle. */
export function snapshot(
  key: string,
  updatedAt: string,
  status = 'To Do',
  people: { assigned?: boolean } = { assigned: true },
): IssueSnapshot {
  return {
    ticket: {
      key,
      summary: `Ticket ${key}`,
      status,
      statusCategory: status === 'Done' ? 'done' : 'new',
      requestType: 'Translate Marketing Materials',
      priority: null,
      assigneeId: people.assigned ? 'acc-assignee-1' : null,
      assigneeName: people.assigned ? 'Ana Asignada' : null,
      requesterId: 'acc-requester-1',
      requesterName: 'Raúl Solicitante',
      createdAt: at('2026-11-01T09:00:00Z'),
      resolvedAt: null,
      updatedAt: at(updatedAt),
    },
    transitions: [{ from: 'To Do', to: status, at: at(updatedAt) }],
    slaCycles: [
      {
        metric: 'done',
        state: 'completed',
        startedAt: at('2026-11-02T09:00:00Z'),
        stoppedAt: at(updatedAt),
        breachAt: null,
        breached: false,
        paused: false,
      },
    ],
  };
}
