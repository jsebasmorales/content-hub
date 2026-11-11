import { sql } from 'drizzle-orm';
import type { AccessTransaction, AccessUnitOfWork } from '@application/ports/unit-of-work';
import type { Database } from './client';
import { DbAuditLog } from './repositories/audit-log';
import { DbRoleRepository } from './repositories/role-repository';
import { DbSessionRepository } from './repositories/session-repository';
import { DbUserRepository } from './repositories/user-repository';

/**
 * Arbitrary constant naming the "leader invariant" lock. An advisory lock (rather than
 * `SELECT … FOR UPDATE` on the Leader rows) also serialises the bootstrap case, where there are
 * no Leader rows yet to lock. `_xact_` releases it automatically on commit or rollback.
 */
const LEADER_LOCK_KEY = 7_310_031;

export class DbAccessUnitOfWork implements AccessUnitOfWork {
  constructor(private readonly db: Database) {}

  withLeaderLock<T>(work: (tx: AccessTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${LEADER_LOCK_KEY}::bigint)`);
      return work({
        users: new DbUserRepository(tx),
        roles: new DbRoleRepository(tx),
        sessions: new DbSessionRepository(tx),
        audit: new DbAuditLog(tx),
      });
    });
  }
}
