import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { snapshot } from '../support/jira-fixtures';
import { createSyncHarness, type SyncHarness } from '../support/jira-sync-harness';
import { APP_KINDS } from '../support/test-app';

/**
 * The Jira sync use cases end to end: the scripted Jira, the real use cases and either the
 * Postgres adapters or their fakes (SDD §6.1, D-035, D-047).
 */

const MINUTE = 60_000;
const day = (n: number): string => `2026-11-${String(n).padStart(2, '0')}T10:00:00Z`;
const tickets = (...keys: number[]) => keys.map((n) => snapshot(`JSMCO-${String(n)}`, day(n)));

for (const kind of APP_KINDS) {
  describe(`RunJiraSync: ${kind}`, () => {
    let t: SyncHarness;

    beforeAll(async () => {
      t = await createSyncHarness(kind, 2);
    });
    afterAll(async () => {
      await t.close();
    });
    beforeEach(async () => {
      await t.reset();
    });

    it('loads everything on the first run and records it', async () => {
      t.jira.setIssues(tickets(1, 2, 3, 4, 5));
      const result = await t.app.runSync.execute({ kind: 'manual', mode: 'incremental' });

      expect(result).toEqual({ status: 'succeeded', items: 5, deleted: 0, dryRun: false });
      expect(await t.app.issues.listKeys()).toEqual([
        'JSMCO-1',
        'JSMCO-2',
        'JSMCO-3',
        'JSMCO-4',
        'JSMCO-5',
      ]);
      // No earlier success, so the first run reads the whole project.
      expect(t.jira.searches[0]?.updatedSince).toBeNull();
      expect(await t.app.runs.latestSucceeded()).toMatchObject({
        kind: 'manual',
        status: 'succeeded',
        items: 5,
        startedAt: new Date('2026-11-11T10:00:00Z'),
      });
    });

    it('reads only what changed since the last success, with the safety margin', async () => {
      t.jira.setIssues(tickets(1, 2, 3));
      await t.app.runSync.execute({ kind: 'lazy', mode: 'incremental' });
      t.clock.advance(20 * MINUTE);
      t.jira.searches.length = 0;
      await t.app.runSync.execute({ kind: 'lazy', mode: 'incremental' });

      // The window opens 5 minutes before the previous run STARTED.
      expect(t.jira.searches[0]?.updatedSince).toEqual(new Date('2026-11-11T09:55:00Z'));
    });

    it('is idempotent: a second run over the same data changes nothing', async () => {
      t.jira.setIssues(tickets(1, 2, 3));
      await t.app.runSync.execute({ kind: 'manual', mode: 'full' });
      const before = await t.app.issues.listTickets();
      t.clock.advance(MINUTE);
      await t.app.runSync.execute({ kind: 'manual', mode: 'full' });
      expect(await t.app.issues.listTickets()).toEqual(before);
    });

    it('picks up an edited ticket', async () => {
      t.jira.setIssues(tickets(1, 2));
      await t.app.runSync.execute({ kind: 'manual', mode: 'incremental' });
      t.clock.advance(10 * MINUTE);
      t.jira.setIssues([
        snapshot('JSMCO-1', day(1)),
        snapshot('JSMCO-2', '2026-11-11T10:05:00Z', 'Done'),
      ]);
      await t.app.runSync.execute({ kind: 'manual', mode: 'incremental' });
      const done = (await t.app.issues.listTickets()).find((x) => x.key === 'JSMCO-2');
      expect(done).toMatchObject({ status: 'Done', statusCategory: 'done' });
    });

    describe('when Jira fails halfway (policy A, D-047)', () => {
      it('keeps the pages already saved, records the failure, and repeats from the last success', async () => {
        t.jira.setIssues(tickets(1, 2, 3, 4, 5));
        // The first page works; the second one fails.
        const realSearch = t.jira.searchIssues.bind(t.jira);
        let calls = 0;
        t.jira.searchIssues = async (input) => {
          calls += 1;
          if (calls === 2) {
            return { ok: false, error: { kind: 'unavailable', message: 'Jira failed (503)' } };
          }
          return realSearch(input);
        };
        const failed = await t.app.runSync.execute({ kind: 'manual', mode: 'incremental' });

        expect(failed).toEqual({
          status: 'failed',
          items: 2,
          error: 'Jira unavailable: Jira failed (503)',
        });
        // Page one (2 tickets) is kept and valid.
        expect(await t.app.issues.listKeys()).toEqual(['JSMCO-1', 'JSMCO-2']);
        expect(await t.app.runs.latest()).toMatchObject({ status: 'failed', items: 2 });
        expect(await t.app.runs.latestSucceeded()).toBeNull();
        // Still no success on record, so the next run starts from scratch and completes the job.
        t.jira.searchIssues = realSearch;
        t.clock.advance(5 * MINUTE);
        const retry = await t.app.runSync.execute({ kind: 'lazy', mode: 'incremental' });
        expect(retry).toMatchObject({ status: 'succeeded', items: 5 });
        expect(await t.app.issues.listKeys()).toHaveLength(5);
      });

      it('does not move the success marker forward, so nothing is skipped', async () => {
        t.jira.setIssues(tickets(1, 2));
        await t.app.runSync.execute({ kind: 'manual', mode: 'incremental' });
        t.clock.advance(30 * MINUTE);
        t.jira.failNextCall({ kind: 'rate_limited', message: 'Slow down' });
        const failed = await t.app.runSync.execute({ kind: 'lazy', mode: 'incremental' });
        expect(failed.status).toBe('failed');

        t.clock.advance(10 * MINUTE);
        t.jira.searches.length = 0;
        await t.app.runSync.execute({ kind: 'lazy', mode: 'incremental' });
        // Still measured from the first (good) run at 10:00, not from the failed one.
        expect(t.jira.searches[0]?.updatedSince).toEqual(new Date('2026-11-11T09:55:00Z'));
      });

      it('reports an unexpected crash with a generic message and frees the lock', async () => {
        t.jira.setIssues(tickets(1));
        t.jira.searchIssues = () => Promise.reject(new Error('connection to db-secret-host lost'));
        const result = await t.app.runSync.execute({ kind: 'manual', mode: 'incremental' });
        expect(result).toEqual({
          status: 'failed',
          items: 0,
          error: 'Unexpected error while syncing',
        });
        expect(JSON.stringify(await t.app.runs.latest())).not.toContain('db-secret-host');
      });
    });

    describe('concurrency and dead runs', () => {
      it('turns a second sync away while one is running, without touching Jira', async () => {
        t.jira.setIssues(tickets(1, 2));
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const realSearch = t.jira.searchIssues.bind(t.jira);
        t.jira.searchIssues = async (input) => {
          await gate;
          return realSearch(input);
        };
        const first = t.app.runSync.execute({ kind: 'manual', mode: 'incremental' });
        await new Promise((resolve) => setTimeout(resolve, 100));

        const second = await t.app.runSync.execute({ kind: 'lazy', mode: 'incremental' });
        expect(second).toEqual({ status: 'busy' });
        expect(await t.app.runs.findRunning()).toMatchObject({ kind: 'manual' });

        release();
        expect((await first).status).toBe('succeeded');
        t.jira.searchIssues = realSearch;
      });

      it('closes a run left "running" by a function that died', async () => {
        const dead = await t.app.runs.start('scheduled', new Date('2026-11-11T08:00:00Z'));
        t.jira.setIssues(tickets(1));
        await t.app.runSync.execute({ kind: 'manual', mode: 'incremental' });
        const closed = (await t.app.runs.recent(10)).find((run) => run.id === dead.id);
        expect(closed).toMatchObject({ status: 'failed' });
        expect(await t.app.runs.findRunning()).toBeNull();
      });
    });

    describe('tickets deleted in Jira', () => {
      it('removes them on a full read', async () => {
        t.jira.setIssues(tickets(1, 2, 3));
        await t.app.runSync.execute({ kind: 'manual', mode: 'full' });
        t.jira.setIssues(tickets(1, 3));
        const result = await t.app.runSync.execute({ kind: 'manual', mode: 'full' });
        expect(result).toMatchObject({ status: 'succeeded', deleted: 1 });
        expect(await t.app.issues.listKeys()).toEqual(['JSMCO-1', 'JSMCO-3']);
      });

      it('does not look for deletions on an incremental read', async () => {
        t.jira.setIssues(tickets(1, 2, 3));
        await t.app.runSync.execute({ kind: 'manual', mode: 'full' });
        t.clock.advance(10 * MINUTE);
        t.jira.setIssues(tickets(1));
        const result = await t.app.runSync.execute({ kind: 'lazy', mode: 'incremental' });
        expect(result).toMatchObject({ status: 'succeeded', deleted: 0 });
        expect(await t.app.issues.listKeys()).toHaveLength(3);
      });

      it('refuses a mass deletion that looks like a Jira glitch', async () => {
        const many = Array.from({ length: 30 }, (_, i) => i + 1);
        t.jira.setIssues(tickets(...many));
        await t.app.runSync.execute({ kind: 'manual', mode: 'full' });
        // Jira suddenly "lists" only 2 of the 30 tickets.
        t.jira.setIssues(tickets(1, 2));
        const result = await t.app.runSync.execute({ kind: 'manual', mode: 'full' });
        expect(result).toMatchObject({ status: 'failed' });
        expect(result.status === 'failed' && result.error).toContain('Refusing to delete 28 of 30');
        expect(await t.app.issues.listKeys()).toHaveLength(30);
      });

      it('refuses to wipe the cache when Jira lists no keys at all', async () => {
        const many = Array.from({ length: 30 }, (_, i) => i + 1);
        t.jira.setIssues(tickets(...many));
        await t.app.runSync.execute({ kind: 'manual', mode: 'full' });
        t.jira.setIssues([]);
        const result = await t.app.runSync.execute({ kind: 'manual', mode: 'full' });
        expect(result.status).toBe('failed');
        expect(await t.app.issues.listKeys()).toHaveLength(30);
      });
    });

    describe('dry run', () => {
      it('reports what it would do and writes nothing', async () => {
        t.jira.setIssues(tickets(1, 2, 3));
        await t.app.runSync.execute({ kind: 'manual', mode: 'full' });
        t.jira.setIssues(tickets(1, 2, 3, 4));
        const runsBefore = await t.app.runs.recent(50);

        const result = await t.app.runSync.execute({ kind: 'manual', mode: 'full', dryRun: true });
        expect(result).toEqual({ status: 'succeeded', items: 4, deleted: 0, dryRun: true });
        expect(await t.app.issues.listKeys()).toHaveLength(3);
        expect(await t.app.runs.recent(50)).toEqual(runsBefore);
      });
    });
  });
}
