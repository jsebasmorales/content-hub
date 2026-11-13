import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import { EMPTY_RAW_FILTER, type RawGlobalFilter } from '@domain/jira/global-filter';
import type { IssueSnapshot } from '@application/ports/jira';
import { at, snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/** /incumplimientos: needs `section.breach`, lists missed cycles and honours the global filter. */

const allowed = PermissionSet.of(['section.breach']);
const raw = (patch: Partial<RawGlobalFilter> = {}): RawGlobalFilter => ({
  ...EMPTY_RAW_FILTER,
  ...patch,
});
/** Every breach of these tests is in T4 of 2026. */
const t4 = { period: 'T4', year: '2026' };

/** A ticket whose only SLA cycle ended late (a breach) at the given time. */
function late(key: string, stoppedAt: string, patch: Partial<IssueSnapshot['ticket']> = {}) {
  const base = snapshot(key, stoppedAt, 'Done');
  return {
    ...base,
    ticket: { ...base.ticket, ...patch },
    slaCycles: [
      {
        metric: 'done' as const,
        state: 'completed' as const,
        startedAt: at('2026-10-01T10:00:00Z'),
        stoppedAt: at(stoppedAt),
        breachAt: at('2026-10-10T10:00:00Z'),
        breached: true,
        paused: false,
      },
    ],
  };
}

for (const kind of APP_KINDS) {
  describe(`GetSlaBreaches: ${kind}`, () => {
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

    const run = async (
      input: Partial<{
        global: Partial<RawGlobalFilter>;
        filter: Record<string, string>;
        page: number;
      }> = {},
    ) => {
      const result = await t.app.slaBreaches.execute(allowed, {
        global: raw(input.global ?? t4),
        filter: input.filter ?? {},
        page: input.page ?? 1,
      });
      if (!result.ok) throw new Error('expected the breaches');
      return result.value;
    };

    it('refuses people without the section permission', async () => {
      const input = { global: raw(), filter: {}, page: 1 };
      expect(await t.app.slaBreaches.execute(PermissionSet.EMPTY, input)).toEqual({
        ok: false,
        error: 'forbidden',
      });
      const other = PermissionSet.of(['section.sla']);
      expect((await t.app.slaBreaches.execute(other, input)).ok).toBe(false);
    });

    it('lists the breaches of the period, worst delay first', async () => {
      await t.app.issues.upsertMany([
        late('JSMCO-1', '2026-10-12T10:00:00Z'),
        late('JSMCO-2', '2026-10-20T10:00:00Z'),
        snapshot('JSMCO-3', '2026-10-15T10:00:00Z', 'Done'),
      ]);
      const page = await run();
      expect(page.rows.items.map((r) => r.ticketKey)).toEqual(['JSMCO-2', 'JSMCO-1']);
      expect(page.summary.total).toBe(2);
      expect(page.summary.byMetric).toEqual({ first_response: 0, done: 2 });
    });

    it('looks at the last 30 days when nothing was asked', async () => {
      await t.app.issues.upsertMany([
        late('JSMCO-1', '2026-09-12T10:00:00Z'),
        late('JSMCO-2', '2026-11-05T10:00:00Z'),
      ]);
      const page = await run({ global: {} });
      expect(page.panel.filter.window.days).toBe(30);
      expect(page.rows.items.map((r) => r.ticketKey)).toEqual(['JSMCO-2']);
    });

    it('honours the period, and says when it ignored one', async () => {
      await t.app.issues.upsertMany([late('JSMCO-1', '2026-10-12T10:00:00Z')]);
      expect((await run({ global: { period: 'T3', year: '2026' } })).summary.total).toBe(0);
      expect((await run({ global: { from: '2026-10-01', to: '2026-10-31' } })).summary.total).toBe(
        1,
      );
      const bogus = await run({ global: { from: 'ayer', to: 'hoy' } });
      expect(bogus.panel.filter.notices).toContain('period');
    });

    it('filters by assignee, ignoring values that do not exist', async () => {
      await t.app.issues.upsertMany([
        late('JSMCO-1', '2026-10-12T10:00:00Z', { requestType: 'Edit' }),
        late('JSMCO-2', '2026-10-13T10:00:00Z', {
          requestType: 'Translate',
          assigneeId: null,
          assigneeName: null,
        }),
      ]);
      const unassigned = await run({ filter: { assigneeId: '__unassigned__' } });
      expect(unassigned.rows.items.map((r) => r.ticketKey)).toEqual(['JSMCO-2']);
      const bogus = await run({ filter: { assigneeId: 'nadie' } });
      expect(bogus.rows.total).toBe(2);
      expect(bogus.filter.assigneeId).toBeNull();
    });

    it('narrows the summary and the list to the request types of the global filter', async () => {
      await t.app.issues.upsertMany([
        late('JSMCO-1', '2026-10-12T10:00:00Z', { requestType: 'Edit' }),
        late('JSMCO-2', '2026-10-13T10:00:00Z', { requestType: 'Translate' }),
      ]);
      const page = await run({ global: { ...t4, types: ['Translate'] } });
      expect(page.rows.items.map((r) => r.ticketKey)).toEqual(['JSMCO-2']);
      // The totals above the list follow the types too, so the page never disagrees with itself.
      expect(page.summary.total).toBe(1);
      expect(page.panel.filter.activeCount).toBe(2);
    });

    it('pages a long list', async () => {
      await t.app.issues.upsertMany(
        Array.from({ length: 30 }, (_, i) =>
          late(`JSMCO-${String(i + 1)}`, '2026-10-20T10:00:00Z'),
        ),
      );
      const second = await run({ page: 2 });
      expect(second.rows).toMatchObject({ page: 2, pageCount: 2, total: 30 });
      expect(second.rows.items).toHaveLength(5);
    });

    it('works before the first sync', async () => {
      const page = await run();
      expect(page.summary.total).toBe(0);
      expect(page.rows.items).toEqual([]);
    });
  });
}
