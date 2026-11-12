import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LAUNCH_FAILED_TEXT } from '@application/use-cases/jira/request-jira-sync';
import { snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/**
 * How a visit or a button press turns into a background sync, and what the page says about how
 * fresh its data is (SDD §6.1, D-035, D-038).
 */

const MINUTE = 60_000;

for (const kind of APP_KINDS) {
  describe(`RequestJiraSync and GetSyncStatus: ${kind}`, () => {
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

    /** A finished, successful sync that started at the clock's current time. */
    const succeededSync = async (): Promise<void> => {
      t.jira.setIssues([snapshot('JSMCO-1', '2026-11-01T10:00:00Z')]);
      t.clock.advance(0);
      const result = await t.app.runSync.execute({ kind: 'manual', mode: 'incremental' });
      expect(result.status).toBe('succeeded');
    };

    describe('opening the dashboard (lazy)', () => {
      it('starts a background sync when nothing has ever been loaded', async () => {
        expect(await t.app.requestSync.lazy()).toEqual({ requested: true });
        expect(t.launcher.launches).toEqual([{ kind: 'lazy', mode: 'incremental' }]);
      });

      it('does nothing while the data is fresh', async () => {
        await succeededSync();
        t.clock.advance(10 * MINUTE);
        expect(await t.app.requestSync.lazy()).toEqual({ requested: false, reason: 'fresh' });
        expect(t.launcher.launches).toEqual([]);
      });

      it('starts one once the data is older than 15 minutes', async () => {
        await succeededSync();
        t.clock.advance(16 * MINUTE);
        expect(await t.app.requestSync.lazy()).toEqual({ requested: true });
      });

      it('does not try again within 5 minutes of a failed attempt', async () => {
        await succeededSync();
        t.clock.advance(20 * MINUTE);
        t.jira.failNextCall({ kind: 'unavailable', message: 'Jira failed (503)' });
        await t.app.runSync.execute({ kind: 'lazy', mode: 'incremental' });

        t.clock.advance(2 * MINUTE);
        expect(await t.app.requestSync.lazy()).toEqual({
          requested: false,
          reason: 'recent_attempt',
        });
        t.clock.advance(4 * MINUTE);
        expect(await t.app.requestSync.lazy()).toEqual({ requested: true });
      });

      it('does nothing while a sync is running', async () => {
        await t.app.runs.start('manual', t.clock.now());
        t.clock.advance(1 * MINUTE);
        expect(await t.app.requestSync.lazy()).toEqual({ requested: false, reason: 'running' });
      });

      it('is not blocked forever by a run that died', async () => {
        await t.app.runs.start('manual', t.clock.now());
        t.clock.advance(16 * MINUTE);
        expect(await t.app.requestSync.lazy()).toEqual({ requested: true });
      });
    });

    describe('the "Resincronizar" button (manual)', () => {
      it('always asks for a sync, even when the data is fresh', async () => {
        await succeededSync();
        t.clock.advance(1 * MINUTE);
        expect(await t.app.requestSync.manual()).toEqual({ requested: true });
        expect(t.launcher.launches).toEqual([{ kind: 'manual', mode: 'incremental' }]);
      });

      it('says a sync is already running instead of starting another', async () => {
        await t.app.runs.start('lazy', t.clock.now());
        expect(await t.app.requestSync.manual()).toEqual({ requested: false, reason: 'running' });
        expect(t.launcher.launches).toEqual([]);
      });

      it('reports a function that cannot be reached instead of failing the button', async () => {
        t.launcher.failNextLaunch();
        expect(await t.app.requestSync.manual()).toEqual({
          requested: false,
          reason: 'launch_failed',
        });
        expect(await t.app.requestSync.manual()).toEqual({ requested: true });
      });

      it('does not break the page when the launch fails on a visit', async () => {
        t.launcher.failNextLaunch();
        expect(await t.app.requestSync.lazy()).toEqual({
          requested: false,
          reason: 'launch_failed',
        });
      });

      it('writes a failed launch down, so the next visits do not all wait for it again', async () => {
        t.launcher.failNextLaunch();
        expect((await t.app.requestSync.lazy()).requested).toBe(false);

        // A minute later, with the data still stale, nobody retries: that is the 5-minute rule.
        t.clock.advance(1 * MINUTE);
        expect(await t.app.requestSync.lazy()).toEqual({
          requested: false,
          reason: 'recent_attempt',
        });
        expect(t.launcher.launches).toEqual([]);
        // The Leader can see launching is what fails, in words that carry nothing secret.
        expect(await t.app.syncStatus.execute()).toMatchObject({
          lastAttemptFailed: true,
          lastError: LAUNCH_FAILED_TEXT,
          running: false,
        });

        t.clock.advance(5 * MINUTE);
        expect(await t.app.requestSync.lazy()).toEqual({ requested: true });
      });

      it('also writes down a button press whose launch failed', async () => {
        t.launcher.failNextLaunch();
        await t.app.requestSync.manual();
        const [latest] = await t.app.runs.recent(1);
        expect(latest).toMatchObject({
          kind: 'manual',
          status: 'failed',
          error: LAUNCH_FAILED_TEXT,
        });
      });
    });

    describe('freshness shown on every page', () => {
      it('has nothing to show before the first sync', async () => {
        expect(await t.app.syncStatus.execute()).toEqual({
          lastUpdateAt: null,
          lastAttemptFailed: false,
          lastError: null,
          running: false,
          stale: true,
        });
      });

      it('shows when the last sync finished', async () => {
        await succeededSync();
        t.clock.advance(3 * MINUTE);
        expect(await t.app.syncStatus.execute()).toMatchObject({
          lastUpdateAt: new Date('2026-11-11T10:00:00Z'),
          lastAttemptFailed: false,
          stale: false,
        });
      });

      it('keeps the last good time and flags a failed attempt, so old data is not taken as fresh', async () => {
        await succeededSync();
        t.clock.advance(20 * MINUTE);
        t.jira.failNextCall({ kind: 'unavailable', message: 'Jira failed (503)' });
        await t.app.runSync.execute({ kind: 'lazy', mode: 'incremental' });

        expect(await t.app.syncStatus.execute()).toEqual({
          lastUpdateAt: new Date('2026-11-11T10:00:00Z'),
          lastAttemptFailed: true,
          lastError: 'Jira unavailable: Jira failed (503)',
          running: false,
          stale: true,
        });
      });

      it('says a sync is running, and stops saying so once it is presumed dead', async () => {
        await t.app.runs.start('manual', t.clock.now());
        expect((await t.app.syncStatus.execute()).running).toBe(true);
        t.clock.advance(16 * MINUTE);
        expect((await t.app.syncStatus.execute()).running).toBe(false);
      });
    });
  });
}
