import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PermissionSet } from '@domain/access/permission-set';
import { RUNS_LISTED } from '@application/use-cases/jira/get-system-status';
import { snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/** /estado: needs `action.sync` (who may sync is who sees how syncing is going). */

const allowed = PermissionSet.of(['action.sync']);
const MINUTE = 60_000;

for (const kind of APP_KINDS) {
  describe(`GetSystemStatus: ${kind}`, () => {
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

    it('refuses people who cannot request a sync', async () => {
      expect(await t.app.systemStatus.execute(PermissionSet.EMPTY)).toEqual({
        ok: false,
        error: 'forbidden',
      });
      // Seeing the dashboard is not enough: this page is for whoever acts on the sync.
      expect((await t.app.systemStatus.execute(PermissionSet.of(['section.exec']))).ok).toBe(false);
    });

    it('lists the latest runs, newest first, with how each ended', async () => {
      const first = await t.app.runs.start('manual', t.clock.now());
      await t.app.runs.finish(
        first.id,
        { status: 'succeeded', items: 40, error: null },
        t.clock.now(),
      );
      t.clock.advance(5 * MINUTE);
      const second = await t.app.runs.start('lazy', t.clock.now());
      await t.app.runs.finish(
        second.id,
        { status: 'failed', items: 0, error: 'Jira unavailable: Jira failed (503)' },
        t.clock.now(),
      );

      const result = await t.app.systemStatus.execute(allowed);
      if (!result.ok) throw new Error('expected the status');
      expect(result.value.runs.map((run) => [run.kind, run.status])).toEqual([
        ['lazy', 'failed'],
        ['manual', 'succeeded'],
      ]);
      expect(result.value.runs[0]?.error).toBe('Jira unavailable: Jira failed (503)');
      expect(result.value.status).toMatchObject({ lastAttemptFailed: true });
    });

    it('lists no more runs than the page shows', async () => {
      for (let i = 0; i < RUNS_LISTED + 5; i += 1) {
        const run = await t.app.runs.start('lazy', t.clock.now());
        await t.app.runs.finish(
          run.id,
          { status: 'succeeded', items: 1, error: null },
          t.clock.now(),
        );
        t.clock.advance(MINUTE);
      }
      const result = await t.app.systemStatus.execute(allowed);
      if (!result.ok) throw new Error('expected the status');
      expect(result.value.runs).toHaveLength(RUNS_LISTED);
    });

    it('reports the quality of the cached data', async () => {
      await t.app.issues.upsertMany([
        snapshot('JSMCO-1', '2026-11-05T10:00:00Z', 'Done'),
        snapshot('JSMCO-2', '2026-11-06T10:00:00Z'),
      ]);
      const result = await t.app.systemStatus.execute(allowed);
      if (!result.ok) throw new Error('expected the status');
      expect(result.value.quality).toMatchObject({
        tickets: 2,
        openTickets: 1,
        openWithoutAssignee: 0,
      });
      expect(result.value.quality.newestUpdatedAt).toEqual(new Date('2026-11-06T10:00:00Z'));
    });

    it('works before the first sync', async () => {
      const result = await t.app.systemStatus.execute(allowed);
      if (!result.ok) throw new Error('expected the status');
      expect(result.value.runs).toEqual([]);
      expect(result.value.quality.tickets).toBe(0);
      expect(result.value.status.lastUpdateAt).toBeNull();
    });
  });
}
