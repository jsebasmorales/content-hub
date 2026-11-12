import { describe, expect, it } from 'vitest';
import {
  NO_FILTER,
  OPEN_STATUS,
  UNASSIGNED,
  buildFilterOptions,
  matchesFilter,
  paginate,
  sanitizeFilter,
  sortByRecentActivity,
} from '@domain/jira/task-list';
import { isObsoleteRequestType, ticketUrl, type Ticket } from '@domain/jira/ticket';
import { parseTasksQuery, tasksHref } from '@presentation/tasks-query';

function task(key: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    key,
    summary: key,
    status: 'To Do',
    statusCategory: 'new',
    requestType: 'Edit',
    priority: null,
    assigneeId: 'a1',
    assigneeName: 'Ana',
    requesterId: 'r1',
    requesterName: 'Raúl',
    createdAt: new Date('2026-11-01T10:00:00Z'),
    resolvedAt: null,
    updatedAt: new Date('2026-11-02T10:00:00Z'),
    ...overrides,
  };
}

const tickets = [
  task('T-1'),
  task('T-2', { requestType: 'Translate', status: 'Done', statusCategory: 'done' }),
  task('T-3', { assigneeId: null, assigneeName: null, requesterId: 'r2', requesterName: 'Zoe' }),
  task('T-4', { assigneeId: 'a2', assigneeName: 'Beto' }),
];

describe('buildFilterOptions', () => {
  const options = buildFilterOptions(tickets);

  it('offers what really exists, with how many tickets each has', () => {
    expect(options.requestTypes).toEqual([
      { value: 'Edit', label: 'Edit', count: 3 },
      { value: 'Translate', label: 'Translate', count: 1 },
    ]);
    // "All open" comes first, then each status that exists.
    expect(options.statuses.map((o) => o.label)).toEqual([
      'Todas las abiertas (sin Hecho)',
      'Done',
      'To Do',
    ]);
    expect(options.statuses[0]?.count).toBe(3);
    expect(options.requesters.map((o) => [o.label, o.count])).toEqual([
      ['Raúl', 3],
      ['Zoe', 1],
    ]);
  });

  it('puts "Sin asignar" first, only when somebody has no assignee', () => {
    expect(options.assignees.map((o) => o.label)).toEqual(['Sin asignar', 'Ana', 'Beto']);
    const everyoneAssigned = buildFilterOptions([task('T-1')]);
    expect(everyoneAssigned.assignees.map((o) => o.label)).toEqual(['Ana']);
  });

  it('names a person without a name instead of leaving a blank entry', () => {
    const nameless = buildFilterOptions([task('T-1', { requesterName: null })]);
    expect(nameless.requesters[0]?.label).toBe('Sin nombre');
  });
});

describe('sanitizeFilter', () => {
  const options = buildFilterOptions(tickets);

  it('keeps values that exist and drops anything else', () => {
    expect(
      sanitizeFilter(
        { requestType: 'Edit', status: 'Nope', requesterId: 'r2', assigneeId: '' },
        options,
      ),
    ).toEqual({ ...NO_FILTER, requestType: 'Edit', requesterId: 'r2' });
  });

  it('accepts the unassigned marker', () => {
    expect(sanitizeFilter({ assigneeId: UNASSIGNED }, options).assigneeId).toBe(UNASSIGNED);
  });
});

describe('matchesFilter', () => {
  const keys = (filter: Partial<typeof NO_FILTER>) =>
    tickets.filter((t) => matchesFilter(t, { ...NO_FILTER, ...filter })).map((t) => t.key);

  it('shows everything without filters', () => {
    expect(keys({})).toEqual(['T-1', 'T-2', 'T-3', 'T-4']);
  });

  it('filters by each field', () => {
    expect(keys({ requestType: 'Translate' })).toEqual(['T-2']);
    expect(keys({ status: 'Done' })).toEqual(['T-2']);
    expect(keys({ status: OPEN_STATUS })).toEqual(['T-1', 'T-3', 'T-4']);
    expect(keys({ requesterId: 'r2' })).toEqual(['T-3']);
    expect(keys({ assigneeId: 'a2' })).toEqual(['T-4']);
    expect(keys({ assigneeId: UNASSIGNED })).toEqual(['T-3']);
  });

  it('combines filters: a ticket must satisfy all of them', () => {
    expect(keys({ requestType: 'Edit', assigneeId: 'a1' })).toEqual(['T-1']);
    expect(keys({ requestType: 'Translate', assigneeId: 'a2' })).toEqual([]);
  });
});

describe('text search', () => {
  const found = (text: string, list: Ticket[] = tickets) =>
    list.filter((t) => matchesFilter(t, { ...NO_FILTER, text })).map((t) => t.key);

  const pages = [
    task('JSMCO-10', { summary: '[PRE] Publish Digital Nomads landing pages' }),
    task('JSMCO-11', { summary: 'Traducción de la página de precios' }),
    task('JSMCO-12', { summary: 'Fix new 404 inlinks' }),
  ];

  it('finds the key or any word of the summary, ignoring case and accents', () => {
    expect(found('jsmco-11', pages)).toEqual(['JSMCO-11']);
    expect(found('LANDING', pages)).toEqual(['JSMCO-10']);
    expect(found('traduccion', pages)).toEqual(['JSMCO-11']);
    expect(found('TRADUCCIÓN', pages)).toEqual(['JSMCO-11']);
  });

  it('needs every word, in any order', () => {
    expect(found('pages landing', pages)).toEqual(['JSMCO-10']);
    expect(found('landing precios', pages)).toEqual([]);
  });

  it('combines with the other filters', () => {
    const only = pages.filter((t) =>
      matchesFilter(t, { ...NO_FILTER, text: 'jsmco', requestType: 'Nope' }),
    );
    expect(only).toEqual([]);
  });

  it('treats blank or oversized searches safely', () => {
    const options = buildFilterOptions(pages);
    expect(sanitizeFilter({ text: '   ' }, options).text).toBeNull();
    expect(sanitizeFilter({ text: '  hola   mundo ' }, options).text).toBe('hola mundo');
    expect(sanitizeFilter({ text: 'x'.repeat(500) }, options).text).toHaveLength(100);
  });

  it('does not treat what is typed as a pattern', () => {
    expect(found('.*', pages)).toEqual([]);
    expect(found('(', pages)).toEqual([]);
  });
});

describe('isObsoleteRequestType', () => {
  it('recognises the types the team marked as retired', () => {
    expect(isObsoleteRequestType("Translate Marketing Materials - Moi - DON'T USE")).toBe(true);
    expect(isObsoleteRequestType('Old type (Dont use)')).toBe(true);
    expect(isObsoleteRequestType('Translate Marketing Materials')).toBe(false);
    expect(isObsoleteRequestType('Do not touch')).toBe(false);
  });
});

describe('ticketUrl', () => {
  it('builds the address of a ticket in Jira', () => {
    expect(ticketUrl('https://acme.atlassian.net', 'JSMCO-1010')).toBe(
      'https://acme.atlassian.net/browse/JSMCO-1010',
    );
    expect(ticketUrl('https://acme.atlassian.net/some/path/', 'JSMCO-1')).toBe(
      'https://acme.atlassian.net/browse/JSMCO-1',
    );
  });

  it('returns nothing rather than a doubtful link', () => {
    expect(ticketUrl(undefined, 'JSMCO-1')).toBeNull();
    expect(ticketUrl('http://acme.atlassian.net', 'JSMCO-1')).toBeNull();
    expect(ticketUrl('not a url', 'JSMCO-1')).toBeNull();
    expect(ticketUrl('https://acme.atlassian.net', '../admin')).toBeNull();
    expect(ticketUrl('https://acme.atlassian.net', 'jsmco-1')).toBeNull();
    expect(ticketUrl('https://acme.atlassian.net', 'JSMCO-1?x=1')).toBeNull();
  });
});

describe('sortByRecentActivity', () => {
  it('puts the latest activity first and breaks ties by key', () => {
    const sorted = sortByRecentActivity([
      task('B', { updatedAt: new Date('2026-11-05T00:00:00Z') }),
      task('A', { updatedAt: new Date('2026-11-05T00:00:00Z') }),
      task('C', { updatedAt: new Date('2026-11-09T00:00:00Z') }),
    ]);
    expect(sorted.map((t) => t.key)).toEqual(['C', 'A', 'B']);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 60 }, (_, i) => i + 1);

  it('cuts pages of 25', () => {
    const second = paginate(items, 2);
    expect(second.items[0]).toBe(26);
    expect(second.items).toHaveLength(25);
    expect(second).toMatchObject({ page: 2, pageCount: 3, total: 60 });
    expect(paginate(items, 3).items).toHaveLength(10);
  });

  it('clamps a page that does not exist', () => {
    expect(paginate(items, 99).page).toBe(3);
    expect(paginate(items, 0).page).toBe(1);
    expect(paginate(items, Number.NaN).page).toBe(1);
  });

  it('has one empty page when there is nothing', () => {
    expect(paginate([], 1)).toEqual({ items: [], page: 1, pageCount: 1, total: 0 });
  });
});

describe('the address of /tareas', () => {
  it('reads filters and page, in Spanish', () => {
    const query = parseTasksQuery(
      new URLSearchParams('tipo=Edit&estado=Done&solicitante=r1&asignado=a1&buscar=hola&pagina=3'),
    );
    expect(query).toEqual({
      filter: {
        requestType: 'Edit',
        status: 'Done',
        requesterId: 'r1',
        assigneeId: 'a1',
        text: 'hola',
      },
      page: 3,
    });
  });

  it('treats malformed values as no filter and the first page', () => {
    expect(parseTasksQuery(new URLSearchParams('pagina=abc&tipo=' + 'x'.repeat(300)))).toEqual({
      filter: {},
      page: 1,
    });
  });

  it('builds links that keep the chosen filters', () => {
    expect(tasksHref(NO_FILTER, 1)).toBe('/tareas');
    expect(tasksHref({ ...NO_FILTER, requestType: 'Edit & more', assigneeId: UNASSIGNED }, 2)).toBe(
      '/tareas?tipo=Edit+%26+more&asignado=__unassigned__&pagina=2',
    );
  });

  it('round-trips through the address', () => {
    const filter = { ...NO_FILTER, requestType: 'Edit or Change (x, y)' };
    const url = new URL(tasksHref(filter, 4), 'http://localhost');
    expect(parseTasksQuery(url.searchParams)).toEqual({
      filter: {
        requestType: 'Edit or Change (x, y)',
        status: undefined,
        requesterId: undefined,
        assigneeId: undefined,
      },
      page: 4,
    });
  });
});
