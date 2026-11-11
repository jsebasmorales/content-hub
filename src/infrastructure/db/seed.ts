import { eq } from 'drizzle-orm';
import { PERMISSION_CATALOG } from '@domain/access/permissions';
import { DEFAULT_ROLE_GRANTS } from '@domain/access/role';
import type { Database } from './client';
import { permission, role, rolePermission } from './schema';

/**
 * Idempotent bootstrap data: the permission catalog and the two built-in roles.
 * Default grants are written only when a role is first created, so later edits made by a
 * Leader in /permisos are never overwritten by a re-run.
 */
export async function seedAccessData(db: Database): Promise<void> {
  await db
    .insert(permission)
    .values(PERMISSION_CATALOG.map((key) => ({ key })))
    .onConflictDoNothing();

  for (const [name, keys] of Object.entries(DEFAULT_ROLE_GRANTS)) {
    const [existing] = await db.select().from(role).where(eq(role.name, name)).limit(1);
    if (existing) continue;
    const [created] = await db.insert(role).values({ name, isSystem: true }).returning();
    if (!created) throw new Error(`Could not create role ${name}`);
    await db
      .insert(rolePermission)
      .values(keys.map((permissionKey) => ({ roleId: created.id, permissionKey, granted: true })));
  }
}
