import { logEvent } from '@shared/log';
import { composeJiraSync } from '../compose-jira';
import { EnvError } from '../config/env-rules';
import { readFunctionEnv } from '../config/function-env';
import { openDatabase } from '../db/client';
import {
  createSyncHandler,
  type SyncFunctionEvent,
  type SyncFunctionResponse,
} from './sync-jira-handler';

/**
 * Netlify background function (the `-background` suffix of the file name makes it one): it answers
 * 202 immediately and may run for up to 15 minutes. `scripts/build-functions.mjs` bundles this
 * file, with every import resolved, into `netlify/functions/`.
 *
 * Authentication happens before anything else is opened: a caller without the secret never
 * reaches the database or Jira.
 */
export async function handler(event: SyncFunctionEvent): Promise<SyncFunctionResponse> {
  let env;
  try {
    env = readFunctionEnv();
  } catch (error) {
    // Variable names only, never values. The caller sees the same 404 as anyone else.
    logEvent('error', 'sync.function_misconfigured', {
      problems: error instanceof EnvError ? error.problems.join('; ') : 'unknown',
    });
    return { statusCode: 404, body: '' };
  }

  const run = createSyncHandler({
    secret: env.secret,
    execute: async (input) => {
      const database = await openDatabase(env.databaseUrl);
      try {
        return await composeJiraSync(database.db, env.jira).execute(input);
      } finally {
        await database.close();
      }
    },
  });
  return run(event);
}
