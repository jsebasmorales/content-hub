import { readFileSync } from 'node:fs';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolvePermissions } from '@domain/access/permission-set';
import { COLLABORATOR_ROLE_NAME } from '@domain/access/role';
import { rolePermission } from '@infrastructure/db/schema';
import { ON_REAL_POSTGRES, createTestApp, type TestApp } from '../support/test-app';

/**
 * Migration 0006 fixes databases created before "Lo aprendido" became the Leader's own page: there,
 * the Colaborador role was written once with every section and nothing re-runs that. The test
 * rebuilds that old state and applies the very SQL file that will run in production.
 */

const MIGRATION = readFileSync(
  new URL('../../src/infrastructure/db/migrations/0006_learned_leader_only.sql', import.meta.url),
  'utf8',
);
const [grantFix = '', revoke = ''] = MIGRATION.split('--> statement-breakpoint');

describe('migration 0006: "Lo aprendido" is the Leader’s page', () => {
  let t: TestApp;
  let collaboratorRoleId = '';

  async function collaboratorPermissions() {
    if (!t.db) throw new Error('expected a database');
    const grants = await t.app.roles.listGrants(collaboratorRoleId);
    return resolvePermissions({ name: COLLABORATOR_ROLE_NAME, isSystem: true }, grants);
  }

  beforeAll(async () => {
    t = await createTestApp('postgres');
    collaboratorRoleId = (await t.app.roles.findByName(COLLABORATOR_ROLE_NAME))?.id ?? '';
  });
  afterAll(async () => {
    await t.close();
  });

  it('starts new databases without the section for collaborators', async () => {
    expect((await collaboratorPermissions()).has('section.learn')).toBe(false);
    expect((await collaboratorPermissions()).has('section.exec')).toBe(true);
  });

  it('takes the section away from a database that was created with it', async () => {
    const db = t.db;
    if (!db) throw new Error('expected a database');
    // The old production state: the collaborator role was written with every section.
    await db
      .insert(rolePermission)
      .values({ roleId: collaboratorRoleId, permissionKey: 'section.learn', granted: true })
      .onConflictDoUpdate({
        target: [rolePermission.roleId, rolePermission.permissionKey],
        set: { granted: true },
      });
    expect((await collaboratorPermissions()).has('section.learn')).toBe(true);

    await db.execute(sql.raw(grantFix));

    expect((await collaboratorPermissions()).has('section.learn')).toBe(false);
    // Only that one grant changes: the rest of what collaborators see is untouched.
    expect((await collaboratorPermissions()).has('section.exec')).toBe(true);
    expect((await collaboratorPermissions()).has('section.sla')).toBe(true);
  });

  it('leaves other roles alone, and can run twice', async () => {
    const db = t.db;
    if (!db) throw new Error('expected a database');
    await db.execute(sql.raw(grantFix));
    const rows = await db
      .select()
      .from(rolePermission)
      .where(
        and(eq(rolePermission.permissionKey, 'section.learn'), eq(rolePermission.granted, true)),
      );
    expect(rows.every((row) => row.roleId !== collaboratorRoleId)).toBe(true);
  });

  it('does not fail where the runtime role does not exist', async () => {
    const db = t.db;
    if (!db) throw new Error('expected a database');
    await expect(db.execute(sql.raw(revoke))).resolves.toBeDefined();
  });

  it.skipIf(ON_REAL_POSTGRES)(
    'takes update, delete and truncate on learned_entry away from the runtime role',
    async () => {
      const db = t.db;
      if (!db) throw new Error('expected a database');
      await db.execute(sql`create role app_runtime`);
      await db.execute(
        sql`grant select, insert, update, delete, truncate on learned_entry to app_runtime`,
      );
      const can = async (privilege: string): Promise<boolean | undefined> => {
        // The embedded and the real driver both answer with `rows`, but the shared type says nothing.
        const result = (await db.execute(
          sql`select has_table_privilege('app_runtime', 'learned_entry', ${privilege}) as allowed`,
        )) as { rows: { allowed: boolean }[] };
        return result.rows[0]?.allowed;
      };
      expect(await can('UPDATE')).toBe(true);

      await db.execute(sql.raw(revoke));

      expect(await can('UPDATE')).toBe(false);
      expect(await can('DELETE')).toBe(false);
      expect(await can('TRUNCATE')).toBe(false);
      // It can still write new versions and read them.
      expect(await can('INSERT')).toBe(true);
      expect(await can('SELECT')).toBe(true);
    },
  );
});
