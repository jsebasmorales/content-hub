import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import type { IssueSnapshot } from '@application/ports/jira';
import { snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/** The /tareas list: needs `section.work`, filters the cache and pages it. */

const allowed = PermissionSet.of(['section.work']);

function issue(key: string, updatedAt: string, patch: Partial<IssueSnapshot['ticket']> = {}) {
  const base = snapshot(key, updatedAt);
  return { ...base, ticket: { ...base.ticket, ...patch } };
}

for (const kind of APP_KINDS) {
  describe(`ListTasks: ${kind}`, () => {
    let t: SyncHarness;

    beforeAll(async () => {
      t = await createSyncHarness(kind);
    });
    afterAll(async () => {
      await t.close();
    });
    beforeEach(async () => {
      await t.reset();
    });

    it('refuses people without the section permission', async () => {
      const result = await t.app.listTasks.execute(PermissionSet.EMPTY, { filter: {}, page: 1 });
      expect(result).toEqual({ ok: false, error: 'forbidden' });
      const other = PermissionSet.of(['section.exec']);
      expect((await t.app.listTasks.execute(other, { filter: {}, page: 1 })).ok).toBe(false);
    });

    it('lists the cached tasks, most recent activity first', async () => {
      await t.app.issues.upsertMany([
        issue('JSMCO-1', '2026-11-01T10:00:00Z'),
        issue('JSMCO-2', '2026-11-03T10:00:00Z'),
        issue('JSMCO-3', '2026-11-02T10:00:00Z'),
      ]);
      const result = await t.app.listTasks.execute(allowed, { filter: {}, page: 1 });
      if (!result.ok) throw new Error('expected the list');
      expect(result.value.tasks.items.map((task) => task.key)).toEqual([
        'JSMCO-2',
        'JSMCO-3',
        'JSMCO-1',
      ]);
      expect(result.value.totalInCache).toBe(3);
    });

    it('filters by type, status, requester and assignee together', async () => {
      await t.app.issues.upsertMany([
        issue('JSMCO-1', '2026-11-01T10:00:00Z', { requestType: 'Edit' }),
        issue('JSMCO-2', '2026-11-02T10:00:00Z', { requestType: 'Translate' }),
        issue('JSMCO-3', '2026-11-03T10:00:00Z', {
          requestType: 'Translate',
          assigneeId: null,
          assigneeName: null,
        }),
      ]);
      const run = async (filter: Record<string, string>) => {
        const result = await t.app.listTasks.execute(allowed, { filter, page: 1 });
        if (!result.ok) throw new Error('expected the list');
        return result.value.tasks.items.map((task) => task.key);
      };
      expect(await run({ requestType: 'Translate' })).toEqual(['JSMCO-3', 'JSMCO-2']);
      expect(await run({ requestType: 'Translate', assigneeId: '__unassigned__' })).toEqual([
        'JSMCO-3',
      ]);
      expect(await run({ requesterId: 'acc-requester-1', status: 'To Do' })).toHaveLength(3);
    });

    it('searches the key and the summary', async () => {
      await t.app.issues.upsertMany([
        issue('JSMCO-1', '2026-11-01T10:00:00Z', { summary: 'Nueva landing de verano' }),
        issue('JSMCO-2', '2026-11-02T10:00:00Z', { summary: 'Corregir enlaces' }),
      ]);
      const run = async (text: string) => {
        const result = await t.app.listTasks.execute(allowed, { filter: { text }, page: 1 });
        if (!result.ok) throw new Error('expected the list');
        return result.value.tasks.items.map((task) => task.key);
      };
      expect(await run('LANDING')).toEqual(['JSMCO-1']);
      expect(await run('jsmco-2')).toEqual(['JSMCO-2']);
      expect(await run('nada que ver')).toEqual([]);
    });

    it('builds a link to the ticket only when Jira is configured', () => {
      // The harness wires no Jira address, so no link can be made.
      expect(t.app.ticketUrl('JSMCO-1')).toBeNull();
    });

    it('ignores a filter value that does not exist instead of showing an empty page', async () => {
      await t.app.issues.upsertMany([issue('JSMCO-1', '2026-11-01T10:00:00Z')]);
      const result = await t.app.listTasks.execute(allowed, {
        filter: { requestType: 'Made up', assigneeId: 'nobody' },
        page: 1,
      });
      if (!result.ok) throw new Error('expected the list');
      expect(result.value.filter).toEqual({
        requestType: null,
        status: null,
        requesterId: null,
        assigneeId: null,
        text: null,
      });
      expect(result.value.tasks.total).toBe(1);
    });

    it('pages the list and clamps a page that does not exist', async () => {
      await t.app.issues.upsertMany(
        Array.from({ length: 30 }, (_, i) =>
          issue(
            `JSMCO-${String(i + 1)}`,
            `2026-11-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
          ),
        ),
      );
      const second = await t.app.listTasks.execute(allowed, { filter: {}, page: 2 });
      const beyond = await t.app.listTasks.execute(allowed, { filter: {}, page: 99 });
      if (!second.ok || !beyond.ok) throw new Error('expected the list');
      expect(second.value.tasks).toMatchObject({ page: 2, pageCount: 2, total: 30 });
      expect(second.value.tasks.items).toHaveLength(5);
      expect(beyond.value.tasks.page).toBe(2);
    });

    it('works before the first sync', async () => {
      const result = await t.app.listTasks.execute(allowed, { filter: {}, page: 1 });
      if (!result.ok) throw new Error('expected the list');
      expect(result.value.tasks.total).toBe(0);
      expect(result.value.totalInCache).toBe(0);
    });
  });
}
