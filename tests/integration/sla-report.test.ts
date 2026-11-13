import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import { EMPTY_RAW_FILTER, type RawGlobalFilter } from '@domain/jira/global-filter';
import type { IssueSnapshot } from '@application/ports/jira';
import { at, snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/** /sla: needs `section.sla`, reads cached cycles and honours the global filter. */

const allowed = PermissionSet.of(['section.sla']);
const raw = (patch: Partial<RawGlobalFilter> = {}): RawGlobalFilter => ({
  ...EMPTY_RAW_FILTER,
  ...patch,
});

/** A ticket whose only SLA cycle is a running "done" clock with the given limit. */
function running(
  key: string,
  breachAt: string,
  paused = false,
  requestType?: string,
): IssueSnapshot {
  const base = snapshot(key, '2026-11-10T10:00:00Z');
  return {
    ...base,
    ticket: requestType === undefined ? base.ticket : { ...base.ticket, requestType },
    slaCycles: [
      {
        metric: 'done',
        state: 'ongoing',
        startedAt: at('2026-11-02T10:00:00Z'),
        stoppedAt: null,
        breachAt: at(breachAt),
        breached: false,
        paused,
      },
    ],
  };
}

for (const kind of APP_KINDS) {
  describe(`GetSlaReport: ${kind}`, () => {
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

    const run = async (patch: Partial<RawGlobalFilter> = {}) => {
      const result = await t.app.slaReport.execute(allowed, raw(patch));
      if (!result.ok) throw new Error('expected the report');
      return result.value;
    };

    it('refuses people without the section permission', async () => {
      expect(await t.app.slaReport.execute(PermissionSet.EMPTY, raw())).toEqual({
        ok: false,
        error: 'forbidden',
      });
      const other = PermissionSet.of(['section.exec']);
      expect((await t.app.slaReport.execute(other, raw())).ok).toBe(false);
    });

    it('reports the last 30 days by default', async () => {
      await t.app.issues.upsertMany([snapshot('JSMCO-1', '2026-11-05T10:00:00Z', 'Done')]);
      const page = await run();
      expect(page.panel.filter.window.preset).toEqual({ kind: 'rolling', days: 30 });
      const done = page.report.overall.metrics.find((m) => m.metric === 'done');
      expect(done).toMatchObject({ met: 1, total: 1, ratePercent: 100 });
      // 30 days are drawn week by week at the finest: a percentage per day would be noise.
      expect(page.granularity).toBe('weekly');
      expect(page.now).toEqual(t.clock.now());
    });

    it('honours a custom period and a quarter, and says when it ignored one', async () => {
      await t.app.issues.upsertMany([snapshot('JSMCO-1', '2026-11-05T10:00:00Z', 'Done')]);

      const outside = await run({ from: '2026-10-01', to: '2026-10-31' });
      expect(outside.report.overall.goalMet).toBeNull();

      // The period is cut at today (11 Nov), and says so.
      const inside = await run({ from: '2026-11-01', to: '2026-11-30' });
      expect(inside.report.overall.metrics.find((m) => m.metric === 'done')?.total).toBe(1);
      expect(inside.panel.filter.window.partial).toBe(true);

      const past = await run({ period: 'T3', year: '2026' });
      expect(past.panel.filter.window.preset).toMatchObject({
        quarter: { year: 2026, quarter: 3 },
      });

      const bogus = await run({ from: 'ayer', to: 'hoy' });
      expect(bogus.panel.filter.notices).toContain('period');
    });

    it('lists running clocks, most urgent first, and counts paused ones apart', async () => {
      await t.app.issues.upsertMany([
        running('JSMCO-1', '2026-11-14T10:00:00Z'),
        running('JSMCO-2', '2026-11-10T10:00:00Z'),
        running('JSMCO-3', '2026-11-20T10:00:00Z', true),
      ]);
      // A quarter that is over: the running clocks are about now, not about the period.
      const page = await run({ period: 'T1', year: '2026' });
      expect(page.report.ongoing.map((c) => [c.ticketKey, c.breached])).toEqual([
        ['JSMCO-2', true],
        ['JSMCO-1', false],
      ]);
      expect(page.report.pausedCount).toBe(1);
    });

    it('narrows compliance, the type table and the running clocks to the chosen types', async () => {
      const edit = snapshot('JSMCO-2', '2026-11-05T10:00:00Z', 'Done');
      await t.app.issues.upsertMany([
        snapshot('JSMCO-1', '2026-11-05T10:00:00Z', 'Done'),
        { ...edit, ticket: { ...edit.ticket, requestType: 'Edit' } },
        running('JSMCO-3', '2026-11-14T10:00:00Z', false, 'Edit'),
        running('JSMCO-4', '2026-11-15T10:00:00Z'),
      ]);
      const all = await run();
      const only = await run({ types: ['Edit'] });
      expect(all.report.byRequestType).toHaveLength(2);
      expect(only.report.byRequestType.map((r) => r.requestType)).toEqual(['Edit']);
      expect(all.report.ongoing).toHaveLength(2);
      expect(only.report.ongoing.map((c) => c.ticketKey)).toEqual(['JSMCO-3']);
      expect(only.panel.filter.activeCount).toBe(1);
    });

    it('works before the first sync', async () => {
      const page = await run();
      expect(page.report.overall.goalMet).toBeNull();
      expect(page.report.ongoing).toEqual([]);
    });
  });
}
