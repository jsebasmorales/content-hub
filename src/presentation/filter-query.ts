import { z } from 'zod';
import {
  FILTER_PARAMS,
  FILTER_PARAM_NAMES,
  MAX_SELECTED_TYPES,
  type RawGlobalFilter,
} from '@domain/jira/global-filter';

/** Longest text any single parameter may carry; a type name is the longest thing a person picks. */
const SHORT_TEXT = 40;
const TYPE_NAME = 200;

const short = z.string().max(SHORT_TEXT);
const typeName = z.string().min(1).max(TYPE_NAME);

function one(params: URLSearchParams, name: string): string | null {
  const value = params.get(name);
  return value !== null && short.safeParse(value).success ? value : null;
}

/**
 * Reads the global filter from an address or a cookie. It only shapes the text (known names, sane
 * lengths, a bounded number of types); what each value means, and whether it can be used, is
 * decided by `resolveGlobalFilter` in the domain.
 */
export function rawFilterFromParams(params: URLSearchParams): RawGlobalFilter {
  const named = [...params.getAll(FILTER_PARAMS.types), ...params.getAll(FILTER_PARAMS.legacyType)];
  const types = [...new Set(named.filter((name) => typeName.safeParse(name).success))].slice(
    0,
    MAX_SELECTED_TYPES,
  );
  return {
    period: one(params, FILTER_PARAMS.period),
    year: one(params, FILTER_PARAMS.year),
    from: one(params, FILTER_PARAMS.from),
    to: one(params, FILTER_PARAMS.to),
    legacyQuarter: one(params, FILTER_PARAMS.legacyQuarter),
    shownFrom: one(params, FILTER_PARAMS.shownFrom),
    shownTo: one(params, FILTER_PARAMS.shownTo),
    types,
    typesInForm: params.get(FILTER_PARAMS.typesInForm) === '1',
    compare: one(params, FILTER_PARAMS.compare),
  };
}

/** True when the address says anything about the filter, so the address wins over the cookie. */
export const hasFilterParams = (params: URLSearchParams): boolean =>
  FILTER_PARAM_NAMES.some((name) => name !== FILTER_PARAMS.reset && params.has(name));

/** True when the "Aplicar" form sent this: only it carries what the page had drawn. */
export const isFormSubmission = (params: URLSearchParams): boolean =>
  params.has(FILTER_PARAMS.shownFrom) ||
  params.has(FILTER_PARAMS.shownTo) ||
  params.has(FILTER_PARAMS.typesInForm);

/** The parameters of the address that do not belong to the filter (a list's own filters, say). */
export function otherParams(
  params: URLSearchParams,
  dropped: readonly string[] = [],
): [string, string][] {
  return [...params.entries()].filter(
    ([name]) => !FILTER_PARAM_NAMES.includes(name) && !dropped.includes(name),
  );
}
