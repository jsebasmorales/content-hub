import { env, isProduction } from './config/env';
import { composeApp, type App } from './compose';
import { composeJira, type JiraApp, type LauncherFactory } from './compose-jira';
import { composeLearned, type LearnedApp } from './compose-learned';
import { openDatabase, type DatabaseHandle } from './db/client';
import { seedAccessData } from './db/seed';
import { HttpSyncLauncher } from './netlify/http-sync-launcher';
import { InlineSyncLauncher } from './netlify/inline-sync-launcher';

let handlePromise: Promise<DatabaseHandle> | undefined;
let appPromise: Promise<App> | undefined;
let jiraPromise: Promise<JiraApp> | undefined;
let learnedPromise: Promise<LearnedApp> | undefined;

async function openAndPrepare(): Promise<DatabaseHandle> {
  const handle = await openDatabase(env.DATABASE_URL);
  // Embedded local databases migrate themselves; real Postgres is migrated at deploy time.
  if (env.DATABASE_URL.startsWith('pglite:')) await handle.migrate();
  await seedAccessData(handle.db);
  return handle;
}

/** One database connection pool per server instance, shared by every part of the app. */
function getHandle(): Promise<DatabaseHandle> {
  if (!handlePromise) {
    const attempt = openAndPrepare();
    handlePromise = attempt;
    attempt.catch(() => {
      if (handlePromise === attempt) handlePromise = undefined;
    });
  }
  return handlePromise;
}

async function initialize(): Promise<App> {
  return composeApp((await getHandle()).db, env);
}

/**
 * In production a sync is started by calling the site's own background function. Under `astro dev`
 * there is no such function, so it runs in-process instead (D-048).
 */
const launcher: LauncherFactory = (runSync) =>
  isProduction
    ? new HttpSyncLauncher({ baseUrl: env.PUBLIC_APP_URL, secret: env.SYNC_TRIGGER_SECRET })
    : new InlineSyncLauncher(runSync);

async function initializeJira(): Promise<JiraApp> {
  return composeJira((await getHandle()).db, env, launcher);
}

/** The Jira part of the app: ticket cache, sync status, and the buttons that request a sync. */
export function getJiraApp(): Promise<JiraApp> {
  if (!jiraPromise) {
    const attempt = initializeJira();
    jiraPromise = attempt;
    attempt.catch(() => {
      if (jiraPromise === attempt) jiraPromise = undefined;
    });
  }
  return jiraPromise;
}

async function initializeLearned(): Promise<LearnedApp> {
  return composeLearned((await getHandle()).db);
}

/** "Lo aprendido": the Leader's written conclusions per quarter. */
export function getLearnedApp(): Promise<LearnedApp> {
  if (!learnedPromise) {
    const attempt = initializeLearned();
    learnedPromise = attempt;
    attempt.catch(() => {
      if (learnedPromise === attempt) learnedPromise = undefined;
    });
  }
  return learnedPromise;
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

export type { App, JiraApp, LearnedApp };
