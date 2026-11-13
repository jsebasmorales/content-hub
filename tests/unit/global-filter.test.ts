import { describe, expect, it } from 'vitest';
import {
  EMPTY_RAW_FILTER,
  filterRecordsByTypes,
  filterTicketsByTypes,
  filterToCookieValue,
  filterToParams,
  isDefaultFilter,
  presetKey,
  resolveGlobalFilter,
  resolveTypes,
  type RawGlobalFilter,
} from '@domain/jira/global-filter';
import type { SlaCycleRecord } from '@domain/jira/sla-report';
import type { Ticket } from '@domain/jira/ticket';

const now = new Date('2026-11-13T15:00:00Z');
const known = ['Contenido web', 'Email', 'Blog', 'Landing', 'Push'];
const context = { now, knownTypes: known, compareAvailable: true };
const resolve = (raw: Partial<RawGlobalFilter>, available = true) =>
  resolveGlobalFilter({ ...EMPTY_RAW_FILTER, ...raw }, { ...context, compareAvailable: available });

describe('resolveGlobalFilter: the defaults', () => {
  it('is the last 30 days, every type and no comparison, with nothing active', () => {
    const filter = resolve({});
    expect(presetKey(filter.window.preset)).toBe('30d');
    expect(filter.window.days).toBe(30);
    expect(filter.types).toEqual({ all: true });
    expect(filter.compare).toBe(false);
    expect(filter.activeCount).toBe(0);
    expect(filter.notices).toEqual([]);
    expect(isDefaultFilter(filter)).toBe(true);
    expect(filterToParams(filter)).toEqual([]);
  });
});

describe('resolveGlobalFilter: the period', () => {
  it('reads a quarter and its year', () => {
    const filter = resolve({ period: 'T3', year: '2026' });
    expect(presetKey(filter.window.preset)).toBe('T3-2026');
    expect(filter.window.days).toBe(92);
    expect(filter.activeCount).toBe(1);
  });

  it('uses the current year when a quarter has none, and cuts the quarter in progress at today', () => {
    const filter = resolve({ period: 'T4' });
    expect(presetKey(filter.window.preset)).toBe('T4-2026');
    expect(filter.window).toMatchObject({ days: 44, partial: true });
  });

  it('reads a custom range and lets it win over a chip', () => {
    const filter = resolve({ period: 'T1', from: '2026-10-05', to: '2026-10-10' });
    expect(presetKey(filter.window.preset)).toBe('2026-10-05..2026-10-10');
    expect(filter.window.days).toBe(6);
  });

  it('reads an old link with trimestre=2026-T3', () => {
    expect(presetKey(resolve({ legacyQuarter: '2026-T3' }).window.preset)).toBe('T3-2026');
  });

  it('keeps the chip when the form sends the dates it had drawn, and the dates when they changed', () => {
    const drawn = {
      shownFrom: '2026-10-01',
      shownTo: '2026-12-31',
      from: '2026-10-01',
      to: '2026-12-31',
    };
    expect(presetKey(resolve({ ...drawn, period: 'T2', year: '2026' }).window.preset)).toBe(
      'T2-2026',
    );
    const typed = { ...drawn, from: '2026-10-05', period: 'T2', year: '2026' };
    expect(presetKey(resolve(typed).window.preset)).toBe('2026-10-05..2026-12-31');
  });

  it.each([
    ['a quarter that has not started', { period: 'T1', year: '2027' }],
    ['a range that ends before it starts', { from: '2026-10-10', to: '2026-10-01' }],
    ['a range over three years', { from: '2020-01-01', to: '2026-01-01' }],
    ['a date that does not exist', { from: '2026-02-30', to: '2026-03-10' }],
    ['text that is not a chip', { period: 'junio' }],
    ['a year that is not a year', { period: 'T1', year: 'abcd' }],
  ])('falls back to the default and says so for %s', (_name, raw) => {
    const filter = resolve(raw);
    expect(presetKey(filter.window.preset)).toBe('30d');
    expect(filter.notices).toContain('period');
  });
});

describe('resolveTypes', () => {
  it('means every type when none were asked for', () => {
    expect(resolveTypes([], known, false)).toEqual({ types: { all: true }, notice: false });
  });

  it('keeps the chosen types, in the order they are offered', () => {
    expect(resolveTypes(['Push', 'Email'], known, true)).toEqual({
      types: { all: false, names: ['Email', 'Push'] },
      notice: false,
    });
  });

  it('treats choosing every current type as "todos", so a new type is included later', () => {
    expect(resolveTypes(known, known, true).types).toEqual({ all: true });
  });

  it('cannot be empty: an emptied box in the form means todos, with a notice', () => {
    expect(resolveTypes([], known, true)).toEqual({ types: { all: true }, notice: true });
  });

  it('drops types that do not exist, and falls back to todos when none is left', () => {
    expect(resolveTypes(['Email', 'Nope'], known, false)).toEqual({
      types: { all: false, names: ['Email'] },
      notice: true,
    });
    expect(resolveTypes(['Nope'], known, false)).toEqual({ types: { all: true }, notice: true });
  });

  it('counts a selection as an active filter', () => {
    expect(resolve({ types: ['Email'] }).activeCount).toBe(1);
    expect(resolve({ types: ['Email'], period: 'T3', year: '2026' }).activeCount).toBe(2);
  });
});

describe('comparison and the parameters that name a filter', () => {
  it('ignores the comparison on a page that cannot draw it, and counts it where it can', () => {
    expect(resolve({ compare: '1' }, false).compare).toBe(false);
    const on = resolve({ compare: '1' }, true);
    expect(on.compare).toBe(true);
    expect(on.activeCount).toBe(1);
  });

  it('writes the shortest parameters, with the year of a quarter always spelled out', () => {
    const filter = resolve({ period: 'T4', types: ['Email', 'Push'], compare: '1' });
    expect(filterToParams(filter)).toEqual([
      ['periodo', 'T4'],
      ['anio', '2026'],
      ['tipos', 'Email'],
      ['tipos', 'Push'],
      ['comparar', '1'],
    ]);
  });

  it('writes a custom range as its two dates', () => {
    expect(filterToParams(resolve({ from: '2026-10-05', to: '2026-10-10' }))).toEqual([
      ['desde', '2026-10-05'],
      ['hasta', '2026-10-10'],
    ]);
  });

  it('gives the same filter back when its parameters are read again', () => {
    const first = resolve({ period: 'T2', year: '2026', types: ['Blog'], compare: '1' });
    const params = new URLSearchParams(filterToParams(first));
    const second = resolve({
      period: params.get('periodo'),
      year: params.get('anio'),
      types: params.getAll('tipos'),
      compare: params.get('comparar'),
    });
    expect(second).toEqual(first);
  });

  it('drops the request types from the cookie when they would not fit', () => {
    const many = Array.from(
      { length: 60 },
      (_, i) => `Tipo con un nombre bastante largo ${String(i)}`,
    );
    const wide = resolveGlobalFilter(
      { ...EMPTY_RAW_FILTER, types: many.slice(0, 40), period: 'T3', year: '2026' },
      { now, knownTypes: many, compareAvailable: true },
    );
    expect(filterToParams(wide).length).toBeGreaterThan(40);
    expect(filterToCookieValue(wide)).toBe('periodo=T3&anio=2026');
  });
});

const ticket = (key: string, requestType: string): Ticket => ({
  key,
  summary: key,
  status: 'Hecho',
  statusCategory: 'done',
  requestType,
  priority: null,
  assigneeId: null,
  assigneeName: null,
  requesterId: null,
  requesterName: null,
  createdAt: now,
  resolvedAt: now,
  updatedAt: now,
});
const record = (ticketKey: string): SlaCycleRecord => ({
  ticketKey,
  cycle: {
    metric: 'done',
    state: 'completed',
    startedAt: now,
    stoppedAt: now,
    breachAt: now,
    breached: false,
    paused: false,
  },
});

describe('filtering by request type', () => {
  const tickets = [ticket('A-1', 'Email'), ticket('A-2', 'Blog'), ticket('A-3', "Old DON'T USE")];

  it('keeps everything for "todos", retired types included', () => {
    expect(filterTicketsByTypes(tickets, { all: true })).toHaveLength(3);
  });

  it('keeps only the chosen types otherwise', () => {
    const kept = filterTicketsByTypes(tickets, { all: false, names: ['Email'] });
    expect(kept.map((t) => t.key)).toEqual(['A-1']);
  });

  it('keeps cycles with no ticket for "todos" and drops them for a choice', () => {
    const records = [record('A-1'), record('A-2'), record('ZZ-9')];
    expect(filterRecordsByTypes(records, tickets, { all: true })).toHaveLength(3);
    const kept = filterRecordsByTypes(records, tickets, { all: false, names: ['Email'] });
    expect(kept.map((r) => r.ticketKey)).toEqual(['A-1']);
  });
});
