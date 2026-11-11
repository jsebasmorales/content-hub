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
import { InMemoryAccessUnitOfWork } from './in-memory-unit-of-work';

/** The full application wired to in-memory fakes: no database, no network, instant. */
export function composeFakeApp(env: ComposeEnv, clock: Clock = new FakeClock()) {
  const store = new InMemoryStore();
  const audit = new InMemoryAuditLog();
  const users = new InMemoryUserRepository(store);
  const roles = new InMemoryRoleRepository(store);
  const sessions = new InMemorySessionRepository(store);
  const app = wireApp(
    {
      users,
      roles,
      sessions,
      audit,
      rateLimiter: new InMemoryRateLimiter(clock),
      unitOfWork: new InMemoryAccessUnitOfWork({ users, roles, sessions, audit }),
      tokens: new SequentialTokenService(),
      authProvider: new FakeDirectAuthProvider(),
    },
    env,
    clock,
  );
  return { app, audit, store };
}
