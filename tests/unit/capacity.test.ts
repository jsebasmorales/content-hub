import { describe, expect, it } from 'vitest';
import {
  BALANCE_TOLERANCE,
  MIN_BAND,
  TEAM_MEMBERS,
  buildCapacityReport,
  loadOf,
  memberOf,
} from '@domain/jira/capacity';
import type { StatusCategory, Ticket } from '@domain/jira/ticket';

const at = (iso: string): Date => new Date(iso);
const now = at('2026-11-12T15:00:00Z');

function task(
  key: string,
  assignee: string | null,
  options: { category?: StatusCategory; created?: string; resolved?: string | null } = {},
): Ticket {
  const category = options.category ?? 'new';
  return {
    key,
    summary: key,
    status: category === 'done' ? 'Done' : category === 'new' ? 'To Do' : 'In progress',
    statusCategory: category,
    requestType: 'Edit',
    priority: null,
    assigneeId: assignee ? `id-${assignee}` : null,
    assigneeName: assignee,
    requesterId: null,
    requesterName: null,
    createdAt: at(options.created ?? '2026-10-01T10:00:00Z'),
    resolvedAt:
      options.resolved === undefined ? null : options.resolved ? at(options.resolved) : null,
    updatedAt: at('2026-11-01T10:00:00Z'),
  };
}

/** `count` open tasks for one person; half of them in progress. */
const openTasks = (person: string, count: number): Ticket[] =>
  Array.from({ length: count }, (_, i) =>
    task(`${person}-${String(i + 1)}`, person, {
      category: i % 2 === 0 ? 'indeterminate' : 'new',
    }),
  );

const find = (report: ReturnType<typeof buildCapacityReport>, name: string) =>
  report.people.find((p) => p.name === name);

describe('who is on the team', () => {
  it('lists the six people the Content Lead named', () => {
    expect(TEAM_MEMBERS).toEqual([
      'Paula Yeyati',
      'Sebastian Hernandez',
      'Andres Montagut',
      'Maria Fernanda Barrera',
      'Bon Thatthana',
      'Juan José Gabelo',
    ]);
  });

  it('recognises each person by their name in Jira, ignoring case, accents and extra surnames', () => {
    expect(memberOf('Paula Yeyati Preiss', TEAM_MEMBERS)).toBe('Paula Yeyati');
    expect(memberOf('Andrés Montagut', TEAM_MEMBERS)).toBe('Andres Montagut');
    expect(memberOf('Juan Jose Gabelo', TEAM_MEMBERS)).toBe('Juan José Gabelo');
    expect(memberOf('MARIA FERNANDA BARRERA', TEAM_MEMBERS)).toBe('Maria Fernanda Barrera');
    expect(memberOf('Bon Thatthana', TEAM_MEMBERS)).toBe('Bon Thatthana');
  });

  it('does not mistake somebody else for a member', () => {
    // Same first name, different person: only a full match of every word counts.
    expect(memberOf('Sebastian Morales', TEAM_MEMBERS)).toBeNull();
    expect(memberOf('Maria Lopez', TEAM_MEMBERS)).toBeNull();
    expect(memberOf('Maciej Kubiak', TEAM_MEMBERS)).toBeNull();
    expect(memberOf(null, TEAM_MEMBERS)).toBeNull();
  });
});

describe('buildCapacityReport: how work is spread over the team', () => {
  // Ana 10, Beto 6, Carla 2 open tasks; average 6.
  const team = ['Ana', 'Beto', 'Carla'];
  const tickets = [...openTasks('Ana', 10), ...openTasks('Beto', 6), ...openTasks('Carla', 2)];
  const report = buildCapacityReport({ tickets, now, team });

  it('counts each person’s open tasks and splits them by whether they were started', () => {
    expect(find(report, 'Ana')).toMatchObject({ open: 10, inProgress: 5, notStarted: 5, load: 10 });
    expect(find(report, 'Beto')).toMatchObject({ open: 6, inProgress: 3, notStarted: 3 });
  });

  it('compares everyone with the team average', () => {
    expect(report.averageLoad).toBe(6);
    expect(find(report, 'Ana')).toMatchObject({ deviation: 4, balance: 'above' });
    expect(find(report, 'Beto')).toMatchObject({ deviation: 0, balance: 'balanced' });
    expect(find(report, 'Carla')).toMatchObject({ deviation: -4, balance: 'below' });
  });

  it('puts the most loaded person first', () => {
    expect(report.people.map((p) => p.name)).toEqual(['Ana', 'Beto', 'Carla']);
  });

  it('allows a margin around the average, never less than one task', () => {
    expect(BALANCE_TOLERANCE).toBe(0.25);
    expect(report.band).toBe(1.5);
    // Average 2.5, 25 % would be 0.6: the band stays at one whole task.
    const small = buildCapacityReport({
      tickets: [...openTasks('Ana', 3), ...openTasks('Beto', 2)],
      now,
      team: ['Ana', 'Beto'],
    });
    expect(small.band).toBe(MIN_BAND);
    expect(find(small, 'Ana')?.balance).toBe('balanced');
    expect(find(small, 'Beto')?.balance).toBe('balanced');
  });

  it('weighs every task the same for now, in one place', () => {
    const [first] = tickets;
    if (!first) throw new Error('expected a ticket');
    expect(loadOf(first)).toBe(1);
  });
});

describe('buildCapacityReport: only the team is studied', () => {
  const team = ['Ana', 'Beto'];

  it('lists every member, even one with no tasks at all: free capacity is part of the picture', () => {
    const report = buildCapacityReport({ tickets: openTasks('Ana', 4), now, team });
    expect(report.people.map((p) => p.name)).toEqual(['Ana', 'Beto']);
    expect(find(report, 'Beto')).toMatchObject({
      assigneeId: null,
      open: 0,
      load: 0,
      balance: 'below',
    });
    expect(report.averageLoad).toBe(2);
  });

  it('leaves other teams out of the average, the figures and the flow, but names them', () => {
    const report = buildCapacityReport({
      tickets: [
        ...openTasks('Ana', 2),
        ...openTasks('Beto', 2),
        ...openTasks('Maciej', 12),
        ...openTasks('Saffron', 3),
      ],
      now,
      team,
    });
    expect(report.averageLoad).toBe(2);
    expect(report.people.map((p) => p.name)).toEqual(['Ana', 'Beto']);
    expect(report.flow.openNow).toBe(4);
    expect(report.outside).toEqual([
      { name: 'Maciej', open: 12 },
      { name: 'Saffron', open: 3 },
    ]);
  });

  it('does not list finished work of other teams as outside work', () => {
    const report = buildCapacityReport({
      tickets: [
        ...openTasks('Ana', 1),
        task('X-1', 'Maciej', { category: 'done', resolved: '2026-10-10T10:00:00Z' }),
      ],
      now,
      team,
    });
    expect(report.outside).toEqual([]);
  });

  it('reports open work nobody owns, and keeps it in the queue rather than in a person', () => {
    const report = buildCapacityReport({
      tickets: [
        ...openTasks('Ana', 2),
        task('U-1', null),
        task('U-2', null, { category: 'indeterminate' }),
      ],
      now,
      team,
    });
    expect(report.unassignedOpen).toBe(2);
    expect(report.flow.openNow).toBe(4);
    expect(find(report, 'Ana')?.open).toBe(2);
  });

  it('counts what a member finished recently, and ignores older work', () => {
    const report = buildCapacityReport({
      tickets: [
        task('D-1', 'Ana', { category: 'done', resolved: '2026-10-20T10:00:00Z' }),
        task('D-2', 'Ana', { category: 'done', resolved: '2026-05-01T10:00:00Z' }),
      ],
      now,
      team,
    });
    expect(find(report, 'Ana')?.resolvedRecent).toBe(1);
  });

  it('has no average for an empty team', () => {
    const report = buildCapacityReport({ tickets: openTasks('Ana', 3), now, team: [] });
    expect(report.people).toEqual([]);
    expect(report.averageLoad).toBeNull();
  });

  it('uses the configured team when none is given', () => {
    const report = buildCapacityReport({ tickets: [], now });
    expect(report.people).toHaveLength(6);
    expect(report.flow).toEqual({
      arrivedPerMonth: null,
      finishedPerMonth: null,
      difference: null,
      openNow: 0,
      monthsToClear: null,
    });
  });
});

describe('buildCapacityReport: work arriving against work leaving', () => {
  const team = ['Ana'];
  // The last three complete months (Aug, Sep, Oct 2026): 12 arrived and 6 finished in total.
  const history = [
    ...Array.from({ length: 6 }, (_, i) =>
      task(`H-${String(i)}`, 'Ana', {
        category: 'done',
        created: '2026-08-10T10:00:00Z',
        resolved: '2026-09-10T10:00:00Z',
      }),
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      task(`N-${String(i)}`, 'Ana', { created: '2026-10-10T10:00:00Z' }),
    ),
  ];
  const report = buildCapacityReport({ tickets: history, now, team });

  it('averages the last three complete months, leaving out the current one', () => {
    expect(report.flow.arrivedPerMonth).toBe(4);
    expect(report.flow.finishedPerMonth).toBe(2);
    expect(report.flow.difference).toBe(2);
  });

  it('estimates how long the queue takes to empty at the current pace', () => {
    expect(report.flow.openNow).toBe(6);
    expect(report.flow.monthsToClear).toBe(3);
  });

  it('only measures the team’s queue: another team’s arrivals do not enter', () => {
    const withOutsider = buildCapacityReport({
      tickets: [
        ...history,
        ...Array.from({ length: 30 }, (_, i) =>
          task(`O-${String(i)}`, 'Maciej', { created: '2026-10-12T10:00:00Z' }),
        ),
      ],
      now,
      team,
    });
    expect(withOutsider.flow.arrivedPerMonth).toBe(4);
    expect(withOutsider.flow.openNow).toBe(6);
  });

  it('gives no estimate when nothing finishes', () => {
    const stuck = buildCapacityReport({
      tickets: [task('N-1', 'Ana', { created: '2026-10-10T10:00:00Z' })],
      now,
      team,
    });
    expect(stuck.flow.monthsToClear).toBeNull();
    expect(stuck.flow.arrivedPerMonth).toBeCloseTo(0.3, 1);
  });

  it('draws six months ending with the current one', () => {
    expect(report.months).toHaveLength(6);
    expect(report.months[5]?.month).toEqual({ year: 2026, month: 11 });
    expect(report.months[4]).toMatchObject({ created: 6, resolved: 0 });
  });
});
