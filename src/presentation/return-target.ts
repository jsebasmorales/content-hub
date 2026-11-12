import { ROUTES } from './routes';

/**
 * Pages a form may send a person back to: those in the route registry that have no parameters.
 * Anything else (including full URLs) falls back to `/`, so a form cannot be used to bounce a
 * person to another site.
 */
const RETURN_PATHS: ReadonlySet<string> = new Set(
  ROUTES.filter((route) => route.kind === 'page' && !route.pattern.includes('[')).map(
    (route) => route.pattern,
  ),
);

/** A registered page, without its query string. */
export function safeReturnPath(value: string | undefined): string {
  return value !== undefined && value !== '/login' && RETURN_PATHS.has(value) ? value : '/';
}

/** Messages the previous action left in the address; they must not outlive it. */
const ONE_SHOT_PARAMS = ['sync', 'ok', 'error'];
const ORIGIN_FOR_PARSING = 'http://return-target.invalid';
const MAX_TARGET_LENGTH = 500;

/**
 * A registered page together with its query string (filters, period, page), so changing the theme
 * does not lose what the person was looking at. The path must be registered and the address must
 * stay on this site; one-shot messages are dropped. Anything else gives `/`.
 */
export function safeReturnTarget(value: string | undefined): string {
  if (value === undefined || value.length > MAX_TARGET_LENGTH || !value.startsWith('/')) return '/';
  if (!URL.canParse(value, ORIGIN_FOR_PARSING)) return '/';
  const url = new URL(value, ORIGIN_FOR_PARSING);
  // `/\\evil.example` parses as a protocol-relative address: the origin check catches it.
  if (url.origin !== ORIGIN_FOR_PARSING) return '/';
  const path = safeReturnPath(url.pathname);
  if (path !== url.pathname) return '/';
  for (const name of ONE_SHOT_PARAMS) url.searchParams.delete(name);
  const search = url.searchParams.toString();
  return search === '' ? path : `${path}?${search}`;
}
