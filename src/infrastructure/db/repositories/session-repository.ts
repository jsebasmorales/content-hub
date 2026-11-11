import { eq } from 'drizzle-orm';
import type {
  NewSession,
  SessionRepository,
  SessionWithUser,
} from '@application/ports/repositories';
import type { Database } from '../client';
import { appUser, role, session } from '../schema';

export class DbSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  async create(input: NewSession): Promise<void> {
    await this.db.insert(session).values({
      id: input.tokenHash,
      userId: input.userId,
      expiresAt: input.expiresAt,
      createdAt: input.now,
      lastSeenAt: input.now,
      ip: input.ip,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    });
  }

  async findWithUser(tokenHash: string): Promise<SessionWithUser | null> {
    const [row] = await this.db
      .select({
        tokenHash: session.id,
        expiresAt: session.expiresAt,
        lastSeenAt: session.lastSeenAt,
        userId: appUser.id,
        email: appUser.email,
        name: appUser.name,
        status: appUser.status,
        roleId: appUser.roleId,
        roleName: role.name,
        roleIsSystem: role.isSystem,
      })
      .from(session)
      .innerJoin(appUser, eq(appUser.id, session.userId))
      .innerJoin(role, eq(role.id, appUser.roleId))
      .where(eq(session.id, tokenHash))
      .limit(1);
    if (!row) return null;
    return {
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      lastSeenAt: row.lastSeenAt,
      user: {
        id: row.userId,
        email: row.email,
        name: row.name,
        status: row.status,
        roleId: row.roleId,
        role: { name: row.roleName, isSystem: row.roleIsSystem },
      },
    };
  }

  async touch(tokenHash: string, at: Date): Promise<void> {
    await this.db.update(session).set({ lastSeenAt: at }).where(eq(session.id, tokenHash));
  }

  async delete(tokenHash: string): Promise<void> {
    await this.db.delete(session).where(eq(session.id, tokenHash));
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.db.delete(session).where(eq(session.userId, userId));
  }
}
