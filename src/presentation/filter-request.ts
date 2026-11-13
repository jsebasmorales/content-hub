import type { AstroCookies } from 'astro';
import {
  EMPTY_RAW_FILTER,
  FILTER_PARAMS,
  MAX_COOKIE_CHARS,
  filterToCookieValue,
  filterToParams,
  type RawGlobalFilter,
  type ResolvedFilter,
} from '@domain/jira/global-filter';
import {
  hasFilterParams,
  isFormSubmission,
  otherParams,
  rawFilterFromParams,
} from './filter-query';

/**
 * How the global filter travels (docs/PLAN_FILTROS.md §3): the address is the source of truth, and a
 * session cookie remembers the last valid choice so the four pages agree while the person moves
 * between them. A new session starts again from the defaults. Nothing from either is trusted until
 * `resolveGlobalFilter` has checked it.
 */

/** Cookie names follow the session cookie: the `__Host-` prefix when the site is served over https. */
export const filterCookieName = (secure: boolean): string =>
  secure ? '__Host-hub_filter' : 'hub_filter';

export interface FilterRequest {
  readonly raw: RawGlobalFilter;
  /** The address said something about the filter (otherwise the cookie, if any, did). */
  readonly fromUrl: boolean;
  /** The "Aplicar" form sent it, so the address should be tidied up with a redirect. */
  readonly submitted: boolean;
  /** "Restablecer" was pressed. */
  readonly reset: boolean;
}

function readCookie(cookies: AstroCookies, secure: boolean): RawGlobalFilter {
  const value = cookies.get(filterCookieName(secure))?.value;
  if (value === undefined || value.length > MAX_COOKIE_CHARS) return EMPTY_RAW_FILTER;
  return rawFilterFromParams(new URLSearchParams(value));
}

export function readFilterRequest(url: URL, cookies: AstroCookies, secure: boolean): FilterRequest {
  const params = url.searchParams;
  if (params.has(FILTER_PARAMS.reset)) {
    return { raw: EMPTY_RAW_FILTER, fromUrl: false, submitted: false, reset: true };
  }
  if (hasFilterParams(params)) {
    return {
      raw: rawFilterFromParams(params),
      fromUrl: true,
      submitted: isFormSubmission(params),
      reset: false,
    };
  }
  return { raw: readCookie(cookies, secure), fromUrl: false, submitted: false, reset: false };
}

export function clearFilterCookie(cookies: AstroCookies, secure: boolean): void {
  cookies.delete(filterCookieName(secure), { path: '/' });
}

/**
 * Remembers the filter the page ended up with when the address chose it, and returns the address a
 * form submission should be tidied to (the shortest one, with the form's helper fields gone), or
 * null when the page can simply be shown. A default filter is not stored: no cookie means default.
 * The cookie has no expiry, so it ends with the browser session.
 */
export function settleFilter(
  url: URL,
  cookies: AstroCookies,
  secure: boolean,
  request: FilterRequest,
  filter: ResolvedFilter,
): string | null {
  if (request.fromUrl) {
    const value = filterToCookieValue(filter);
    if (value === '') clearFilterCookie(cookies, secure);
    else {
      cookies.set(filterCookieName(secure), value, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
      });
    }
  }
  if (!request.submitted) return null;
  // Applying starts the list again from its first page, and a sync message belongs to the old view.
  const kept = otherParams(url.searchParams, ['pagina', 'sync']);
  const query = new URLSearchParams([...kept, ...filterToParams(filter)]).toString();
  return query === '' ? url.pathname : `${url.pathname}?${query}`;
}

/** The query string (with its `?`, or empty) that makes a link to another page keep this filter. */
export function filterQuery(filter: ResolvedFilter): string {
  const query = new URLSearchParams(filterToParams(filter)).toString();
  return query === '' ? '' : `?${query}`;
}
