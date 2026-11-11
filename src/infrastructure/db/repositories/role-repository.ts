import { eq } from 'drizzle-orm';
import type { PermissionGrant } from '@domain/access/permission-set';
import type { RoleRecord, RoleRepository } from '@application/ports/repositories';
import type { Database } from '../client';
import { role, rolePermission } from '../schema';

const toRecord = (row: { id: string; name: string; isSystem: boolean }): RoleRecord => row;

export class DbRoleRepository implements RoleRepository {
  constructor(private readonly db: Database) {}

  async findByName(name: string): Promise<RoleRecord | null> {
    const [row] = await this.db.select().from(role).where(eq(role.name, name)).limit(1);
    return row ? toRecord(row) : null;
  }

  async findById(id: string): Promise<RoleRecord | null> {
    const [row] = await this.db.select().from(role).where(eq(role.id, id)).limit(1);
    return row ? toRecord(row) : null;
  }

  async list(): Promise<RoleRecord[]> {
    const rows = await this.db.select().from(role).orderBy(role.name);
    return rows.map(toRecord);
  }

  async listGrants(roleId: string): Promise<PermissionGrant[]> {
    return this.db
      .select({
        permissionKey: rolePermission.permissionKey,
        granted: rolePermission.granted,
      })
      .from(rolePermission)
      .where(eq(rolePermission.roleId, roleId));
  }

  async setGrant(roleId: string, permissionKey: string, granted: boolean): Promise<void> {
    await this.db
      .insert(rolePermission)
      .values({ roleId, permissionKey, granted })
      .onConflictDoUpdate({
        target: [rolePermission.roleId, rolePermission.permissionKey],
        set: { granted },
      });
  }
}
