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

/** Every behaviour test runs against both: real Postgres adapters and in-memory fakes. */
export const APP_KINDS = ['postgres (PGlite)', 'in-memory fakes'] as const;
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
  const handle = await openDatabase('pglite:memory');
  await handle.migrate();
  await seedAccessData(handle.db);
  return { app: composeApp(handle.db, TEST_ENV, clock), clock, close: () => handle.close() };
}
