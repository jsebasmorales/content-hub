import type { LearnedRepository } from '@application/ports/learned';
import type { UserRepository } from '@application/ports/repositories';
import type { AuditLog, Clock } from '@application/ports/services';
import { GetLearned } from '@application/use-cases/learned/get-learned';
import { SaveLearned } from '@application/use-cases/learned/save-learned';
import { SystemClock } from './auth/token-service';
import type { Database } from './db/client';
import { DbAuditLog } from './db/repositories/audit-log';
import { DbLearnedRepository } from './db/repositories/learned-repository';
import { DbUserRepository } from './db/repositories/user-repository';

/** Every port the "Lo aprendido" use cases depend on. Real adapters and fakes both fit. */
export interface LearnedPorts {
  readonly learned: LearnedRepository;
  readonly users: UserRepository;
  readonly audit: AuditLog;
}

/** Wires the ports to the use cases. No Astro code, so tests build the very same thing. */
export function wireLearned(ports: LearnedPorts, clock: Clock) {
  const { learned, users, audit } = ports;
  return {
    getLearned: new GetLearned({ learned, users, clock }),
    saveLearned: new SaveLearned({ learned, audit, clock }),
  };
}

export type LearnedApp = ReturnType<typeof wireLearned>;

/** Production wiring: real database. */
export function composeLearned(db: Database, clock: Clock = new SystemClock()): LearnedApp {
  return wireLearned(
    {
      learned: new DbLearnedRepository(db),
      users: new DbUserRepository(db),
      audit: new DbAuditLog(db),
    },
    clock,
  );
}
