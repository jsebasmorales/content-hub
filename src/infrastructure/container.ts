import { env } from './config/env';
import { composeApp, type App } from './compose';
import { openDatabase } from './db/client';
import { seedAccessData } from './db/seed';

let appPromise: Promise<App> | undefined;

async function initialize(): Promise<App> {
  const handle = await openDatabase(env.DATABASE_URL);
  // Embedded local databases migrate themselves; real Postgres is migrated at deploy time.
  if (env.DATABASE_URL.startsWith('pglite:')) await handle.migrate();
  await seedAccessData(handle.db);
  return composeApp(handle.db, env);
}

/**
 * Composition root: the only infrastructure module presentation may import (D-013).
 * Built once per server instance; importing it also validates the configuration, so an
 * invalid environment stops the app before it serves a request (SDD §15).
 */
export function getApp(): Promise<App> {
  if (!appPromise) {
    const attempt = initialize();
    appPromise = attempt;
    // A failed start (e.g. the database blinked during a cold start) must not be cached:
    // forget it so the next request retries instead of serving errors until the instance recycles.
    attempt.catch(() => {
      if (appPromise === attempt) appPromise = undefined;
    });
  }
  return appPromise;
}

export type { App };
