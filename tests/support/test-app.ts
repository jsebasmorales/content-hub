import type { Clock } from '@application/ports/services';
import { composeApp, type App, type ComposeEnv } from '@infrastructure/compose';
import { openDatabase, type DatabaseHandle } from '@infrastructure/db/client';
import { seedAccessData } from '@infrastructure/db/seed';

/** Clock the test can move forward to exercise expiry rules. */
export class FakeClock implements Clock {
  constructor(private current = new Date('2026-01-15T10:00:00Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export const TEST_ENV: ComposeEnv = {
  ALLOWED_EMAIL_DOMAIN: 'holafly.com',
  BOOTSTRAP_LEADER_EMAIL: 'lider@holafly.com',
  AUTH_PROVIDER: 'local',
  SESSION_SECRET: 'test-secret-test-secret-test-secret-123',
  PUBLIC_APP_URL: 'http://localhost:4321',
};

export interface TestApp {
  readonly app: App;
  readonly handle: DatabaseHandle;
  readonly clock: FakeClock;
}

/** A fully wired app on a fresh in-memory Postgres (PGlite) with the access data seeded. */
export async function createTestApp(): Promise<TestApp> {
  const handle = await openDatabase('pglite:memory');
  await handle.migrate();
  await seedAccessData(handle.db);
  const clock = new FakeClock();
  return { app: composeApp(handle.db, TEST_ENV, clock), handle, clock };
}
