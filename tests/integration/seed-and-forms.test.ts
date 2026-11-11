import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { openDatabase, type DatabaseHandle } from '@infrastructure/db/client';
import { seedAccessData } from '@infrastructure/db/seed';
import { rolePermission, role } from '@infrastructure/db/schema';
import { MAX_FORM_BYTES, readForm } from '../../src/presentation/api/request-helpers';

let handle: DatabaseHandle;

beforeAll(async () => {
  handle = await openDatabase('pglite:memory');
  await handle.migrate();
});

afterAll(async () => {
  await handle.close();
});

describe('seedAccessData under concurrent cold starts (D-032)', () => {
  // PGlite has a single connection, so the two calls below are serialised: this checks the
  // "role already exists" branch (the lost-race path), not true parallelism. A real race needs
  // Postgres in CI (D-006 amendment, D-031).
  it('creates each role and its default grants exactly once', async () => {
    await Promise.all([seedAccessData(handle.db), seedAccessData(handle.db)]);
    await seedAccessData(handle.db);

    const roles = await handle.db.select().from(role);
    expect(roles.map((row) => row.name).sort()).toEqual(['Colaborador', 'Líder']);

    const grants = await handle.db.select().from(rolePermission);
    const unique = new Set(grants.map((grant) => `${grant.roleId}:${grant.permissionKey}`));
    expect(unique.size).toBe(grants.length);
  });

  it('does not restore default grants that a Leader removed from an existing role (D-020)', async () => {
    const [colaborador] = await handle.db.select().from(role).where(eq(role.name, 'Colaborador'));
    const [grant] = await handle.db
      .select()
      .from(rolePermission)
      .where(eq(rolePermission.roleId, colaborador?.id ?? ''))
      .limit(1);
    expect(grant).toBeDefined();
    await handle.db
      .delete(rolePermission)
      .where(
        and(
          eq(rolePermission.roleId, grant?.roleId ?? ''),
          eq(rolePermission.permissionKey, grant?.permissionKey ?? ''),
        ),
      );

    await seedAccessData(handle.db);

    const restored = await handle.db
      .select()
      .from(rolePermission)
      .where(
        and(
          eq(rolePermission.roleId, grant?.roleId ?? ''),
          eq(rolePermission.permissionKey, grant?.permissionKey ?? ''),
        ),
      );
    expect(restored).toHaveLength(0);
  });
});

const schema = z.object({ name: z.string() });

function post(body: BodyInit): Request {
  return new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
}

describe('readForm body cap (D-025)', () => {
  it('parses a small form', async () => {
    expect(await readForm(post('name=ana'), schema)).toEqual({ name: 'ana' });
  });

  it('rejects an oversized body even without a Content-Length header', async () => {
    const chunk = new TextEncoder().encode('a'.repeat(1024));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('name='));
        for (let sent = 0; sent <= MAX_FORM_BYTES; sent += chunk.byteLength) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
    const request = new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect(await readForm(request, schema)).toBeNull();
  });
});
