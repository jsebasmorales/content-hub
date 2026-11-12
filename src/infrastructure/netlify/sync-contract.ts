import { z } from 'zod';

/** Where the background sync function lives, and how it is called (D-048). */
export const SYNC_FUNCTION_PATH = '/.netlify/functions/sync-jira-background';
/** Header that carries the shared secret. Netlify lower-cases header names. */
export const SYNC_SECRET_HEADER = 'x-sync-secret';

/** What the function accepts. Nothing else: no free-form options reach the sync. */
export const syncRequestSchema = z.strictObject({
  kind: z.enum(['manual', 'lazy', 'scheduled']),
  mode: z.enum(['incremental', 'full']),
});

export type SyncRequest = z.output<typeof syncRequestSchema>;

/** The request is a few dozen bytes; anything bigger is rejected before parsing. */
export const MAX_SYNC_BODY_BYTES = 1024;
