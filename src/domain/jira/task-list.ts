import { isDone, type Ticket } from './ticket';

/** Value of the "assignee" filter that means "nobody is assigned". */
export const UNASSIGNED = '__unassigned__';

export const TASKS_PER_PAGE = 25;

/** Value of the "status" filter that means "anything not done yet", whatever its status name. */
export const OPEN_STATUS = '__open__';

/** Longest search the page accepts; anything beyond is cut, never an error. */
export const MAX_SEARCH_LENGTH = 100;

/** The filters of /tareas. `null` means "no filter" (everything). */
export interface TaskFilter {
  readonly requestType: string | null;
  readonly status: string | null;
  readonly requesterId: string | null;
  readonly assigneeId: string | null;
  /** Words to look for in the key and the summary. */
  readonly text: string | null;
}

export const NO_FILTER: TaskFilter = {
  requestType: null,
  status: null,
  requesterId: null,
  assigneeId: null,
  text: null,
};

/** Lower case without accents, so "traducción" finds "Traduccion" and "TRADUCCIÓN". */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Trims and collapses spaces; nothing left means no search. */
function cleanSearch(value: string | null | undefined): string | null {
  const cleaned = (value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH_LENGTH).trim();
  return cleaned === '' ? null : cleaned;
}

export interface FilterOption {
  /** What the form sends back. */
  readonly value: string;
  readonly label: string;
  /** Tickets that carry this value, over all tickets. */
  readonly count: number;
}

export interface TaskFilterOptions {
  readonly requestTypes: readonly FilterOption[];
  readonly statuses: readonly FilterOption[];
  readonly requesters: readonly FilterOption[];
  readonly assignees: readonly FilterOption[];
}

const UNNAMED = 'Sin nombre';

const byLabel = (a: FilterOption, b: FilterOption): number => a.label.localeCompare(b.label, 'es');

function countBy(values: readonly { value: string; label: string }[]): FilterOption[] {
  const found = new Map<string, FilterOption>();
  for (const { value, label } of values) {
    const known = found.get(value);
    found.set(value, known ? { ...known, count: known.count + 1 } : { value, label, count: 1 });
  }
  return [...found.values()].sort(byLabel);
}

const person = (id: string | null, name: string | null) =>
  id === null ? [] : [{ value: id, label: name ?? UNNAMED }];

/** The choices each drop-down offers, taken from what is really in the cache. */
export function buildFilterOptions(tickets: readonly Ticket[]): TaskFilterOptions {
  const assignees = countBy(tickets.flatMap((t) => person(t.assigneeId, t.assigneeName)));
  const unassigned = tickets.filter((t) => t.assigneeId === null).length;
  return {
    requestTypes: countBy(tickets.map((t) => ({ value: t.requestType, label: t.requestType }))),
    statuses: [
      {
        value: OPEN_STATUS,
        label: 'Todas las abiertas (sin Hecho)',
        count: tickets.filter((t) => !isDone(t)).length,
      },
      ...countBy(tickets.map((t) => ({ value: t.status, label: t.status }))),
    ],
    requesters: countBy(tickets.flatMap((t) => person(t.requesterId, t.requesterName))),
    assignees:
      unassigned > 0
        ? [{ value: UNASSIGNED, label: 'Sin asignar', count: unassigned }, ...assignees]
        : assignees,
  };
}

const valid = (value: string | null | undefined, options: readonly FilterOption[]) =>
  value !== null && value !== undefined && options.some((option) => option.value === value)
    ? value
    : null;

/**
 * Keeps only filter values that really exist. A value typed into the address bar that matches
 * nothing is dropped instead of producing an empty page nobody can explain.
 */
export function sanitizeFilter(
  raw: Partial<Record<keyof TaskFilter, string | null | undefined>>,
  options: TaskFilterOptions,
): TaskFilter {
  return {
    requestType: valid(raw.requestType, options.requestTypes),
    status: valid(raw.status, options.statuses),
    requesterId: valid(raw.requesterId, options.requesters),
    assigneeId: valid(raw.assigneeId, options.assignees),
    text: cleanSearch(raw.text),
  };
}

/** Every word typed must appear, in any order, in the key or the summary. */
function matchesText(ticket: Ticket, text: string): boolean {
  const haystack = normalizeForSearch(`${ticket.key} ${ticket.summary}`);
  return normalizeForSearch(text)
    .split(' ')
    .every((word) => haystack.includes(word));
}

export function matchesFilter(ticket: Ticket, filter: TaskFilter): boolean {
  if (filter.text !== null && !matchesText(ticket, filter.text)) return false;
  if (filter.requestType !== null && ticket.requestType !== filter.requestType) return false;
  if (filter.status === OPEN_STATUS) {
    if (isDone(ticket)) return false;
  } else if (filter.status !== null && ticket.status !== filter.status) {
    return false;
  }
  if (filter.requesterId !== null && ticket.requesterId !== filter.requesterId) return false;
  if (filter.assigneeId === UNASSIGNED) return ticket.assigneeId === null;
  return filter.assigneeId === null || ticket.assigneeId === filter.assigneeId;
}

/** Most recently touched first; the key breaks ties so the order never shuffles between loads. */
export function sortByRecentActivity(tickets: readonly Ticket[]): Ticket[] {
  return [...tickets].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.key.localeCompare(b.key),
  );
}

export interface PageOf<T> {
  readonly items: readonly T[];
  /** The page actually shown, after clamping to what exists. */
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
}

export function paginate<T>(
  items: readonly T[],
  requested: number,
  size = TASKS_PER_PAGE,
): PageOf<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(Math.max(1, Math.trunc(requested) || 1), pageCount);
  return {
    items: items.slice((page - 1) * size, page * size),
    page,
    pageCount,
    total: items.length,
  };
}
