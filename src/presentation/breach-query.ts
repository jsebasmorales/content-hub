import { z } from 'zod';
import type { BreachesInput } from '@application/use-cases/jira/get-sla-breaches';
import type { RawGlobalFilter } from '@domain/jira/global-filter';

/**
 * Names of the filters of the list in the address bar of /incumplimientos. The period and the request
 * type are the global filter's (see filter-query.ts), not the list's.
 */
export const BREACH_PARAMS = {
  metric: 'metrica',
  assigneeId: 'asignado',
  page: 'pagina',
} as const;

const text = z.string().max(200).optional();
const query = z.object({
  [BREACH_PARAMS.metric]: text,
  [BREACH_PARAMS.assigneeId]: text,
  [BREACH_PARAMS.page]: z
    .string()
    .regex(/^\d{1,5}$/)
    .optional(),
});

/** Reads the list's filters and page, next to the global filter. Whether each value is usable is decided later. */
export function parseBreachQuery(params: URLSearchParams, global: RawGlobalFilter): BreachesInput {
  const parsed = query.safeParse(Object.fromEntries(params));
  const value = parsed.success ? parsed.data : {};
  const page = value[BREACH_PARAMS.page];
  return {
    global,
    filter: {
      metric: value[BREACH_PARAMS.metric],
      assigneeId: value[BREACH_PARAMS.assigneeId],
    },
    page: page === undefined ? 1 : Number(page),
  };
}

/** A link to another page of the same list, keeping the filters of the address. */
export function breachPageHref(current: URLSearchParams, page: number): string {
  const next = new URLSearchParams(current);
  next.delete('sync');
  if (page > 1) next.set(BREACH_PARAMS.page, String(page));
  else next.delete(BREACH_PARAMS.page);
  const search = next.toString();
  return search === '' ? '/incumplimientos' : `/incumplimientos?${search}`;
}
