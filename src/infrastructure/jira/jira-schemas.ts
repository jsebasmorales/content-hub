import { z } from 'zod';

/**
 * What the Hub accepts from Jira. Everything coming back is validated here (SDD §2): a field
 * that changes shape fails loudly as `invalid_response` instead of corrupting the cache.
 */

const jiraTime = z.object({ epochMillis: z.number() });

const slaCycle = z.object({
  startTime: jiraTime,
  stopTime: jiraTime.nullish(),
  breachTime: jiraTime.nullish(),
  breached: z.boolean(),
  /** Present on ongoing cycles only. */
  paused: z.boolean().optional(),
});

/** An `sd-servicelevelagreement` custom field (docs/jira-mapping.md, D-039). */
export const slaFieldSchema = z
  .object({
    completedCycles: z.array(slaCycle).default([]),
    ongoingCycle: slaCycle.nullish(),
  })
  .nullish();

export type SlaFieldValue = z.output<typeof slaFieldSchema>;

/** Deleted or anonymised users can come without an account id. */
const person = z
  .object({ accountId: z.string().nullish(), displayName: z.string().nullish() })
  .nullish();

const issueFields = z
  .object({
    summary: z.string(),
    status: z.object({ name: z.string(), statusCategory: z.object({ key: z.string() }) }),
    issuetype: z.object({ name: z.string() }),
    priority: z.object({ name: z.string() }).nullish(),
    assignee: person,
    reporter: person,
    created: z.string(),
    updated: z.string(),
    resolutiondate: z.string().nullish(),
    // When the ticket last changed status category. For a done ticket, that is when it was finished.
    statuscategorychangedate: z.string().nullish(),
  })
  // The SLA fields have tenant-specific ids, so they arrive as extra keys and are parsed apart.
  .catchall(z.unknown());

const historyItem = z.object({
  field: z.string(),
  fromString: z.string().nullish(),
  toString: z.string().nullish(),
});

export const historySchema = z.object({
  created: z.string(),
  items: z.array(historyItem),
});

export type History = z.output<typeof historySchema>;

const rawIssue = z.object({
  key: z.string(),
  fields: issueFields,
  changelog: z
    .object({ histories: z.array(historySchema), total: z.number().optional() })
    .nullish(),
});

export type RawIssue = z.output<typeof rawIssue>;

export const searchResponseSchema = z.object({
  issues: z.array(rawIssue),
  nextPageToken: z.string().nullish(),
});

/** `GET /issue/{key}/changelog` (used when the embedded history was cut short). */
export const changelogPageSchema = z.object({
  values: z.array(historySchema),
  total: z.number(),
  startAt: z.number(),
});

/** Only keys matter when looking for deleted tickets. */
export const keysResponseSchema = z.object({
  issues: z.array(z.object({ key: z.string() })),
  nextPageToken: z.string().nullish(),
});
