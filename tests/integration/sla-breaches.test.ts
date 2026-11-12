import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import type { IssueSnapshot } from '@application/ports/jira';
import { at, snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/** /incumplimientos: needs `section.breach`, lists missed cycles and honours period and filters. */

const allowed = PermissionSet.of(['section.breach']);

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
        period: Record<string, string>;
        filter: Record<string, string>;
        page: number;
      }> = {},
    ) => {
      const result = await t.app.slaBreaches.execute(allowed, {
        period: input.period ?? {},
        filter: input.filter ?? {},
        page: input.page ?? 1,
      });
      if (!result.ok) throw new Error('expected the breaches');
      return result.value;
    };

    it('refuses people without the section permission', async () => {
      const none = await t.app.slaBreaches.execute(PermissionSet.EMPTY, {
        period: {},
        filter: {},
        page: 1,
      });
      expect(none).toEqual({ ok: false, error: 'forbidden' });
      const other = PermissionSet.of(['section.sla']);
      const refused = await t.app.slaBreaches.execute(other, { period: {}, filter: {}, page: 1 });
      expect(refused.ok).toBe(false);
    });

    it('lists the breaches of the current quarter, worst delay first', async () => {
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

    it('honours the period, and says when it ignored one', async () => {
      await t.app.issues.upsertMany([late('JSMCO-1', '2026-10-12T10:00:00Z')]);
      expect((await run({ period: { quarter: '2026-T3' } })).summary.total).toBe(0);
      expect((await run({ period: { from: '2026-10-01', to: '2026-10-31' } })).summary.total).toBe(
        1,
      );
      expect((await run({ period: { from: 'ayer', to: 'hoy' } })).resolved.ignored).toBe(true);
    });

    it('filters by assignee and type, ignoring values that do not exist', async () => {
      await t.app.issues.upsertMany([
        late('JSMCO-1', '2026-10-12T10:00:00Z', { requestType: 'Edit' }),
        late('JSMCO-2', '2026-10-13T10:00:00Z', {
          requestType: 'Translate',
          assigneeId: null,
          assigneeName: null,
        }),
      ]);
      const translate = await run({ filter: { requestType: 'Translate' } });
      expect(translate.rows.items.map((r) => r.ticketKey)).toEqual(['JSMCO-2']);
      const unassigned = await run({ filter: { assigneeId: '__unassigned__' } });
      expect(unassigned.rows.items.map((r) => r.ticketKey)).toEqual(['JSMCO-2']);
      const bogus = await run({ filter: { requestType: 'Made up' } });
      expect(bogus.rows.total).toBe(2);
      expect(bogus.filter.requestType).toBeNull();
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
