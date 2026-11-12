import { z } from 'zod';
import type { SummaryInput } from '@application/use-cases/jira/get-summary';
import { parseSlaQuery } from './sla-query';

/** Name of the request-type filter in the address bar of /resumen. */
export const SUMMARY_TYPE_PARAM = 'tipo';

const query = z.object({ [SUMMARY_TYPE_PARAM]: z.string().max(200).optional() });

/** Reads the period and the request type. Whether each is usable is decided later. */
export function parseSummaryQuery(params: URLSearchParams): SummaryInput {
  const parsed = query.safeParse(Object.fromEntries(params));
  return {
    period: parseSlaQuery(params),
    requestType: parsed.success ? parsed.data[SUMMARY_TYPE_PARAM] : undefined,
  };
}
