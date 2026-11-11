import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { composeApp, type App, type ComposeEnv } from '@infrastructure/compose';
import { openDatabase } from '@infrastructure/db/client';
import { seedAccessData } from '@infrastructure/db/seed';
import { composeFakeApp } from '@infrastructure/fakes/compose-fakes';
import { FakeClock } from '@infrastructure/fakes/in-memory-services';

export { FakeClock };

export const TEST_ENV: ComposeEnv = {
  ALLOWED_EMAIL_DOMAIN: 'holafly.com',
  BOOTSTRAP_LEADER_EMAIL: 'lider@holafly.com',
  AUTH_PROVIDER: 'local',
  SESSION_SECRET: 'test-secret-test-secret-test-secret-123',
  PUBLIC_APP_URL: 'http://localhost:4321',
};

/**
 * Every behaviour test runs against both: the Postgres adapters and in-memory fakes.
 * Locally the "postgres" kind is embedded PGlite; with TEST_DATABASE_URL set (the CI job with a
 * real Postgres service) each test app gets its own throw-away database on that server, which
 * exercises the `pg` driver and real connection concurrency (D-006 amendment, D-031).
 */
export const APP_KINDS = ['postgres', 'in-memory fakes'] as const;
export type AppKind = (typeof APP_KINDS)[number];

export interface TestApp {
  readonly app: App;
  readonly clock: FakeClock;
  readonly close: () => Promise<void>;
}

export async function createTestApp(kind: AppKind): Promise<TestApp> {
  const clock = new FakeClock();
  if (kind === 'in-memory fakes') {
    return { app: composeFakeApp(TEST_ENV, clock).app, clock, close: () => Promise.resolve() };
  }
  const scratch = await createScratchDatabase();
  const handle = await openDatabase(scratch.url);
  await handle.migrate();
  await seedAccessData(handle.db);
  return {
    app: composeApp(handle.db, TEST_ENV, clock),
    clock,
    close: async () => {
      await handle.close();
      await scratch.drop();
    },
  };
}

interface ScratchDatabase {
  readonly url: string;
  readonly drop: () => Promise<void>;
}

/** An empty database: PGlite in memory, or a fresh database on the TEST_DATABASE_URL server. */
async function createScratchDatabase(): Promise<ScratchDatabase> {
  const adminUrl = process.env['TEST_DATABASE_URL'];
  if (!adminUrl) return { url: 'pglite:memory', drop: () => Promise.resolve() };

  // Name built from hex only, so it is safe to use as an SQL identifier.
  const name = `hub_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: async () => {
      const cleaner = new pg.Client({ connectionString: adminUrl });
      await cleaner.connect();
      try {
        await cleaner.query(`drop database if exists ${name} with (force)`);
      } finally {
        await cleaner.end();
      }
    },
  };
}
