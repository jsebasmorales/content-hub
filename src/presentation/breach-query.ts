import { z } from 'zod';
import type { BreachesInput } from '@application/use-cases/jira/get-sla-breaches';
import { parseSlaQuery, SLA_PARAMS } from './sla-query';

/** Names of the filters in the address bar of /incumplimientos. */
export const BREACH_PARAMS = {
  metric: 'metrica',
  requestType: 'tipo',
  assigneeId: 'asignado',
  page: 'pagina',
} as const;

const text = z.string().max(200).optional();
const query = z.object({
  [BREACH_PARAMS.metric]: text,
  [BREACH_PARAMS.requestType]: text,
  [BREACH_PARAMS.assigneeId]: text,
  [BREACH_PARAMS.page]: z
    .string()
    .regex(/^\d{1,5}$/)
    .optional(),
});

/** Reads the period, the filters and the page. Whether each value is usable is decided later. */
export function parseBreachQuery(params: URLSearchParams): BreachesInput {
  const parsed = query.safeParse(Object.fromEntries(params));
  const value = parsed.success ? parsed.data : {};
  const page = value[BREACH_PARAMS.page];
  return {
    period: parseSlaQuery(params),
    filter: {
      metric: value[BREACH_PARAMS.metric],
      requestType: value[BREACH_PARAMS.requestType],
      assigneeId: value[BREACH_PARAMS.assigneeId],
    },
    page: page === undefined ? 1 : Number(page),
  };
}

/** The period parts of the address, to carry them through a filter form or a page link. */
export function periodParams(params: URLSearchParams): [string, string][] {
  return Object.values(SLA_PARAMS).flatMap((name) => {
    const value = params.get(name);
    return value ? [[name, value] as [string, string]] : [];
  });
}

/** A link to another page of the same list, keeping the period and the filters. */
export function breachPageHref(current: URLSearchParams, page: number): string {
  const next = new URLSearchParams(current);
  next.delete('sync');
  if (page > 1) next.set(BREACH_PARAMS.page, String(page));
  else next.delete(BREACH_PARAMS.page);
  const search = next.toString();
  return search === '' ? '/incumplimientos' : `/incumplimientos?${search}`;
}
