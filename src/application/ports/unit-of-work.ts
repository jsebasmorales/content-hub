import type { RoleRepository, SessionRepository, UserRepository } from './repositories';
import type { AuditLog } from './services';

/** The repositories a use case may touch while it holds the leader lock. */
export interface AccessTransaction {
  readonly users: UserRepository;
  readonly roles: RoleRepository;
  readonly sessions: SessionRepository;
  readonly audit: AuditLog;
}

/**
 * Makes "there is always an active Leader" (SDD §10.2) a guarantee instead of a hope.
 *
 * Every change that can lower the number of Leaders, or create the very first one, runs inside
 * `withLeaderLock`. Two such changes never overlap, so a use case can count Leaders, decide and
 * write without another request slipping in between (docs/DECISIONES.md D-031).
 */
export interface AccessUnitOfWork {
  /**
   * Runs `work` alone with respect to every other leader-affecting change. On the database the
   * writes (including audit rows) commit together or not at all.
   */
  withLeaderLock<T>(work: (tx: AccessTransaction) => Promise<T>): Promise<T>;
}
