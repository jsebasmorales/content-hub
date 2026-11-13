import { parseDayParam, parseQuarterParam, dayParam } from './report-period';
import {
  DEFAULT_PRESET,
  dayOf,
  presetFromSubmission,
  resolveWindow,
  type PeriodPreset,
  type PeriodWindow,
  type SubmittedPeriod,
} from './period-window';
import { REPORTING_TIME_ZONE } from './quarter';
import type { SlaCycleRecord } from './sla-report';
import type { Ticket } from './ticket';

/**
 * The global filter of the four report pages (docs/PLAN_FILTROS.md §2 and §3): a period, the request
 * types and, later, the comparison with the previous year. The address bar and the session cookie
 * both carry it as the same few parameters, and this module is the only place that decides what
 * they mean. Pure: nothing here reads data or the clock.
 */

/** Most request types a selection can name; more than any project has, so a forged one stays small. */
export const MAX_SELECTED_TYPES = 60;
/** Longest cookie value we write; a longer one loses its request types first. */
export const MAX_COOKIE_CHARS = 1500;

/** Names of the parameters, in the team's own language. */
export const FILTER_PARAMS = {
  period: 'periodo',
  year: 'anio',
  from: 'desde',
  to: 'hasta',
  types: 'tipos',
  compare: 'comparar',
  /** Older links: `trimestre=2026-T4` and a single `tipo`. Still read, never written. */
  legacyQuarter: 'trimestre',
  legacyType: 'tipo',
  /** Only the form sends these: what the page had drawn, and that the types box was in it. */
  shownFrom: 'desde0',
  shownTo: 'hasta0',
  typesInForm: 'tipos_form',
  reset: 'restablecer',
} as const;

/** Every parameter the filter owns, so a page can tell its own parameters from the filter's. */
export const FILTER_PARAM_NAMES: readonly string[] = Object.values(FILTER_PARAMS);

/** What was asked for, as plain text. Nothing here is trusted yet. */
export interface RawGlobalFilter {
  readonly period?: string | null | undefined;
  readonly year?: string | null | undefined;
  readonly from?: string | null | undefined;
  readonly to?: string | null | undefined;
  readonly legacyQuarter?: string | null | undefined;
  readonly shownFrom?: string | null | undefined;
  readonly shownTo?: string | null | undefined;
  /** Request type names asked for, `[]` when none came. */
  readonly types: readonly string[];
  /** The form sent its types box, so "no type" means the person emptied it. */
  readonly typesInForm?: boolean | undefined;
  readonly compare?: string | null | undefined;
}

export const EMPTY_RAW_FILTER: RawGlobalFilter = { types: [] };

export type TypeSelection =
  { readonly all: true } | { readonly all: false; readonly names: readonly string[] };

export const ALL_TYPES: TypeSelection = { all: true };

export type FilterNotice = 'period' | 'types';

export interface ResolvedFilter {
  /** Always usable: when the request could not be, this is the default period. */
  readonly window: PeriodWindow;
  readonly types: TypeSelection;
  /** Comparison with the previous year. Always false on a page that cannot show it yet. */
  readonly compare: boolean;
  /** What was asked and could not be used, so the page can say it fell back. */
  readonly notices: readonly FilterNotice[];
  /** How many of the three filters differ from the default; the "N activos" tag. */
  readonly activeCount: number;
}

export interface FilterContext {
  readonly now: Date;
  /** Current (not retired) request types, in the order they are offered. */
  readonly knownTypes: readonly string[];
  /** The page can draw the comparison; when it cannot, `comparar` is ignored. */
  readonly compareAvailable: boolean;
}

const asYear = (value: string | null | undefined): number | null =>
  value !== undefined && value !== null && /^\d{4}$/.test(value) ? Number(value) : null;

const isGiven = (value: string | null | undefined): value is string =>
  value !== undefined && value !== null && value !== '';

/** The period part of the request, as the same shape the no-script form delivers. */
function submittedPeriod(raw: RawGlobalFilter): SubmittedPeriod {
  const legacy = isGiven(raw.legacyQuarter) ? parseQuarterParam(raw.legacyQuarter) : null;
  const chip = isGiven(raw.period) ? raw.period : legacy ? `T${String(legacy.quarter)}` : null;
  return {
    chip,
    year: isGiven(raw.year) ? asYear(raw.year) : (legacy?.year ?? null),
    from: parseDayParam(raw.from),
    to: parseDayParam(raw.to),
    shownFrom: parseDayParam(raw.shownFrom),
    shownTo: parseDayParam(raw.shownTo),
  };
}

/** True when part of the period request was unusable text, even if the rest could be read. */
function periodRequestIsBroken(raw: RawGlobalFilter, submitted: SubmittedPeriod): boolean {
  if (isGiven(raw.from) && submitted.from === null) return true;
  if (isGiven(raw.to) && submitted.to === null) return true;
  if (isGiven(raw.year) && asYear(raw.year) === null) return true;
  if (isGiven(raw.period) && !/^(30d|T[1-4])$/.test(raw.period)) return true;
  return isGiven(raw.legacyQuarter) && !isGiven(raw.period) && submitted.chip === null;
}

const periodWasAsked = (raw: RawGlobalFilter): boolean =>
  [raw.period, raw.year, raw.from, raw.to, raw.legacyQuarter].some(isGiven);

/**
 * The request types a person picked, checked against the ones that exist. An empty or entirely
 * unknown choice means "todos" (a selection cannot be empty), and says so.
 */
export function resolveTypes(
  requested: readonly string[],
  known: readonly string[],
  typesInForm: boolean,
): { types: TypeSelection; notice: boolean } {
  const wanted = new Set(requested.slice(0, MAX_SELECTED_TYPES));
  const names = known.filter((name) => wanted.has(name));
  const dropped = [...wanted].some((name) => !known.includes(name));
  if (wanted.size === 0) return { types: ALL_TYPES, notice: typesInForm };
  if (names.length === 0) return { types: ALL_TYPES, notice: true };
  // Choosing every current type is the same as choosing none: a type created tomorrow is included.
  if (names.length === known.length) return { types: ALL_TYPES, notice: dropped };
  return { types: { all: false, names }, notice: dropped };
}

/** Pure: turns a request into the filter the pages work with, falling back to the defaults. */
export function resolveGlobalFilter(
  raw: RawGlobalFilter,
  context: FilterContext,
  zone: string = REPORTING_TIME_ZONE,
): ResolvedFilter {
  const today = dayOf(context.now, zone);
  const submitted = submittedPeriod(raw);
  const asked = periodWasAsked(raw);
  // Part of the request that cannot be read makes the whole period the default, not a guess.
  const broken = asked && periodRequestIsBroken(raw, submitted);
  const preset = asked && !broken ? presetFromSubmission(submitted, today) : DEFAULT_PRESET;
  const requested = resolveWindow(preset, context.now, zone);
  const window = requested ?? resolveWindow(DEFAULT_PRESET, context.now, zone);
  if (!window) throw new Error('The default period must always be resolvable');

  const types = resolveTypes(raw.types, context.knownTypes, raw.typesInForm === true);
  const compare = context.compareAvailable && raw.compare === '1';
  const notices: FilterNotice[] = [];
  if (asked && (requested === null || periodRequestIsBroken(raw, submitted)))
    notices.push('period');
  if (types.notice) notices.push('types');

  const periodChanged = window.preset.kind !== 'rolling' || window.preset.days !== 30;
  const activeCount = [periodChanged, !types.types.all, compare].filter(Boolean).length;
  return { window, types: types.types, compare, notices, activeCount };
}

/**
 * The parameters that say this filter in the shortest way: nothing for the defaults, and the year of
 * a quarter always spelled out, because "T4" alone would mean another year after New Year.
 * The same list goes into links and, joined, into the session cookie.
 */
export function filterToParams(filter: ResolvedFilter): [string, string][] {
  const params: [string, string][] = [];
  const { preset } = filter.window;
  if (preset.kind === 'quarter') {
    params.push([FILTER_PARAMS.period, `T${String(preset.quarter.quarter)}`]);
    params.push([FILTER_PARAMS.year, String(preset.quarter.year)]);
  } else if (preset.kind === 'custom') {
    params.push([FILTER_PARAMS.from, dayParam(preset.from)]);
    params.push([FILTER_PARAMS.to, dayParam(preset.to)]);
  }
  if (!filter.types.all) {
    for (const name of filter.types.names) params.push([FILTER_PARAMS.types, name]);
  }
  if (filter.compare) params.push([FILTER_PARAMS.compare, '1']);
  return params;
}

/** What goes in the cookie: the same parameters, without the request types if they do not fit. */
export function filterToCookieValue(filter: ResolvedFilter): string {
  const full = new URLSearchParams(filterToParams(filter)).toString();
  if (full.length <= MAX_COOKIE_CHARS) return full;
  const withoutTypes = filterToParams({ ...filter, types: ALL_TYPES });
  return new URLSearchParams(withoutTypes).toString();
}

export const isDefaultFilter = (filter: ResolvedFilter): boolean =>
  filterToParams(filter).length === 0;

/** The preset as the cookie and the links name it ("30d", "T4-2026"), for tests and logs. */
export function presetKey(preset: PeriodPreset): string {
  if (preset.kind === 'rolling') return `${String(preset.days)}d`;
  if (preset.kind === 'quarter') {
    return `T${String(preset.quarter.quarter)}-${String(preset.quarter.year)}`;
  }
  return `${dayParam(preset.from)}..${dayParam(preset.to)}`;
}

export const typeMatches = (selection: TypeSelection, requestType: string): boolean =>
  selection.all || selection.names.includes(requestType);

/** Keeps the tickets of the chosen types. "Todos" keeps everything, retired types included. */
export function filterTicketsByTypes(
  tickets: readonly Ticket[],
  selection: TypeSelection,
): readonly Ticket[] {
  return selection.all
    ? tickets
    : tickets.filter((ticket) => typeMatches(selection, ticket.requestType));
}

/**
 * Keeps the SLA cycles of tickets of the chosen types. With "todos" nothing is dropped, not even a
 * cycle whose ticket is not in the cache, so the figures stay what they always were. With a choice,
 * a cycle with no ticket has no type and cannot be matched.
 */
export function filterRecordsByTypes(
  records: readonly SlaCycleRecord[],
  tickets: readonly Ticket[],
  selection: TypeSelection,
): readonly SlaCycleRecord[] {
  if (selection.all) return records;
  const typeOf = new Map(tickets.map((ticket) => [ticket.key, ticket.requestType]));
  return records.filter((record) => {
    const type = typeOf.get(record.ticketKey);
    return type !== undefined && typeMatches(selection, type);
  });
}

/** Days of the shown period as `YYYY-MM-DD`, for the hidden fields of the form. */
export const shownDays = (filter: ResolvedFilter): { from: string; to: string } => ({
  from: dayParam(filter.window.from),
  to: dayParam(filter.window.to),
});
