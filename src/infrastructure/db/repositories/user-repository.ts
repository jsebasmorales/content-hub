import { and, eq, sql } from 'drizzle-orm';
import { LEADER_ROLE_NAME } from '@domain/access/role';
import type { User } from '@domain/access/user';
import type { NewUser, UserRepository } from '@application/ports/repositories';
import { isUuid } from '@shared/ids';
import type { Database } from '../client';
import { appUser, role } from '../schema';

const userColumns = {
  id: appUser.id,
  email: appUser.email,
  name: appUser.name,
  status: appUser.status,
  roleId: appUser.roleId,
  roleName: role.name,
  roleIsSystem: role.isSystem,
};

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  status: User['status'];
  roleId: string;
  roleName: string;
  roleIsSystem: boolean;
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  status: row.status,
  roleId: row.roleId,
  role: { name: row.roleName, isSystem: row.roleIsSystem },
});

export class DbUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  private select() {
    return this.db.select(userColumns).from(appUser).innerJoin(role, eq(role.id, appUser.roleId));
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.select().where(eq(appUser.email, email)).limit(1);
    return row ? toUser(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.select().where(eq(appUser.id, id)).limit(1);
    return row ? toUser(row) : null;
  }

  async list(): Promise<User[]> {
    const rows = await this.select().orderBy(appUser.email);
    return rows.map(toUser);
  }

  async create(input: NewUser): Promise<User> {
    const [inserted] = await this.db
      .insert(appUser)
      .values({
        email: input.email,
        roleId: input.roleId,
        status: input.status,
        invitedBy: input.invitedBy,
      })
      .returning({ id: appUser.id });
    const created = inserted ? await this.findById(inserted.id) : null;
    if (!created) throw new Error('User insert did not return a row');
    return created;
  }

  async markLoggedIn(id: string, name: string | null, at: Date): Promise<void> {
    await this.db
      .update(appUser)
      .set({ status: 'activo', lastLoginAt: at, ...(name ? { name } : {}) })
      .where(eq(appUser.id, id));
  }

  async setRole(id: string, roleId: string): Promise<void> {
    await this.db.update(appUser).set({ roleId }).where(eq(appUser.id, id));
  }

  async setStatus(id: string, status: User['status']): Promise<void> {
    await this.db.update(appUser).set({ status }).where(eq(appUser.id, id));
  }

  async countActiveLeaders(): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(appUser)
      .innerJoin(role, eq(role.id, appUser.roleId))
      .where(
        and(eq(role.name, LEADER_ROLE_NAME), eq(role.isSystem, true), eq(appUser.status, 'activo')),
      );
    return row?.total ?? 0;
  }
}
