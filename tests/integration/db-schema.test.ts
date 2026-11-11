import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { openDatabase, type DatabaseHandle } from '@infrastructure/db/client';
import { appUser, auditLog, role, webhookEvent } from '@infrastructure/db/schema';

let handle: DatabaseHandle;

beforeAll(async () => {
  handle = await openDatabase('pglite:memory');
  await handle.migrate();
});

afterAll(async () => {
  await handle.close();
});

const tablesResult = z.object({ rows: z.array(z.object({ table_name: z.string() })) });

async function tableNames(): Promise<string[]> {
  const result = await handle.db.execute(
    sql`select table_name from information_schema.tables where table_schema = 'public'`,
  );
  return tablesResult.parse(result).rows.map((row) => row.table_name);
}

describe('database schema (SDD §4.3)', () => {
  it('creates every access and audit table', async () => {
    const names = await tableNames();
    for (const expected of [
      'app_user',
      'role',
      'permission',
      'role_permission',
      'session',
      'audit_log',
      'webhook_event',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('rejects emails that are not lowercase', async () => {
    const [leader] = await handle.db
      .insert(role)
      .values({ name: 'Líder', isSystem: true })
      .returning();
    await expect(
      handle.db.insert(appUser).values({ email: 'Mixed@Holafly.com', roleId: leader?.id ?? '' }),
    ).rejects.toThrow();
  });

  it('treats a repeated webhook delivery as a conflict (idempotency)', async () => {
    const event = {
      source: 'jira',
      deliveryId: 'abc',
      type: 'jira:issue_updated',
      payload: {},
    } as const;
    await handle.db.insert(webhookEvent).values(event);
    await expect(handle.db.insert(webhookEvent).values(event)).rejects.toThrow();
  });

  it('keeps audit_log append-only', async () => {
    const [entry] = await handle.db
      .insert(auditLog)
      .values({ action: 'test.created', targetType: 'test' })
      .returning();
    await expect(
      handle.db.execute(
        sql`update audit_log set action = 'tampered' where id = ${entry?.id ?? ''}`,
      ),
    ).rejects.toThrow();
    await expect(handle.db.execute(sql`delete from audit_log`)).rejects.toThrow();
    await expect(handle.db.execute(sql`truncate audit_log`)).rejects.toThrow();
  });
});
