import type { Clock } from '@application/ports/services';
import { wireApp, type ComposeEnv } from '../compose';
import { InMemoryStore } from './in-memory-store';
import {
  InMemoryRoleRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from './in-memory-repositories';
import {
  FakeClock,
  FakeDirectAuthProvider,
  InMemoryAuditLog,
  InMemoryRateLimiter,
  SequentialTokenService,
} from './in-memory-services';

/** The full application wired to in-memory fakes: no database, no network, instant. */
export function composeFakeApp(env: ComposeEnv, clock: Clock = new FakeClock()) {
  const store = new InMemoryStore();
  const audit = new InMemoryAuditLog();
  const app = wireApp(
    {
      users: new InMemoryUserRepository(store),
      roles: new InMemoryRoleRepository(store),
      sessions: new InMemorySessionRepository(store),
      audit,
      rateLimiter: new InMemoryRateLimiter(clock),
      tokens: new SequentialTokenService(),
      authProvider: new FakeDirectAuthProvider(),
    },
    env,
    clock,
  );
  return { app, audit, store };
}
