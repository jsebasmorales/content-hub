import { z } from 'zod';
import type { RawPeriod } from '@domain/jira/report-period';

/** Names of the period in the address bar of /sla, in the team's own language. */
export const SLA_PARAMS = { quarter: 'trimestre', from: 'desde', to: 'hasta' } as const;

const text = z.string().max(20).optional();
const query = z.object({
  [SLA_PARAMS.quarter]: text,
  [SLA_PARAMS.from]: text,
  [SLA_PARAMS.to]: text,
});

/** Reads the period from the address. Whether it is usable is decided by the domain, not here. */
export function parseSlaQuery(params: URLSearchParams): RawPeriod {
  const parsed = query.safeParse(Object.fromEntries(params));
  const value = parsed.success ? parsed.data : {};
  return {
    quarter: value[SLA_PARAMS.quarter],
    from: value[SLA_PARAMS.from],
    to: value[SLA_PARAMS.to],
  };
}

export function slaQuarterHref(
  quarter: string,
  basePath = '/sla',
  carry: readonly [string, string][] = [],
): string {
  const params = new URLSearchParams([[SLA_PARAMS.quarter, quarter], ...carry]);
  return `${basePath}?${params.toString()}`;
}
