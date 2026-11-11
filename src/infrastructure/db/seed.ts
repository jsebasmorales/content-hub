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
    await db.transaction(async (tx) => {
      // `role.name` is unique: when two cold starts race, only one insert returns a row and the
      // loser skips the grants, so default grants are written exactly once (D-032).
      const [created] = await tx
        .insert(role)
        .values({ name, isSystem: true })
        .onConflictDoNothing({ target: role.name })
        .returning();
      if (!created) return;
      await tx
        .insert(rolePermission)
        .values(
          keys.map((permissionKey) => ({ roleId: created.id, permissionKey, granted: true })),
        );
    });
  }
}
