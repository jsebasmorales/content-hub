import type { AuditEntry, AuditLog } from '@application/ports/services';
import type { Database } from '../client';
import { auditLog } from '../schema';

/** Writes append-only audit rows. The database itself rejects updates and deletes. */
export class DbAuditLog implements AuditLog {
  constructor(private readonly db: Database) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.ip ?? null,
    });
  }
}
