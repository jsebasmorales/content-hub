import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IssueRepository } from '@application/ports/jira';
import type { SyncLock, SyncRunRepository } from '@application/ports/sync';
import { openDatabase } from '@infrastructure/db/client';
import { DbIssueRepository } from '@infrastructure/db/repositories/issue-repository';
import { DbSyncLock } from '@infrastructure/db/repositories/sync-lock';
import { DbSyncRunRepository } from '@infrastructure/db/repositories/sync-run-repository';
import { InMemoryIssueRepository } from '@infrastructure/fakes/in-memory-jira';
import { InMemorySyncLock, InMemorySyncRunRepository } from '@infrastructure/fakes/in-memory-sync';
import { at, snapshot } from '../support/jira-fixtures';
import { APP_KINDS, createScratchDatabase, type AppKind } from '../support/test-app';

/**
 * Contract: the ticket cache, the sync history and the sync lock behave the same on Postgres
 * as in their in-memory fakes. If a fake drifts, these tests fail (SDD §3 rule 7, D-018).
 */

interface Stores {
  /** Fresh, empty repositories: every test starts from nothing. */
  readonly issues: () => Promise<IssueRepository>;
  readonly runs: () => Promise<SyncRunRepository>;
  /** `leaseMs` shortens the lease so a test can watch it expire. */
  readonly lock: (leaseMs?: number) => Promise<SyncLock>;
  readonly close: () => Promise<void>;
}

async function createStores(kind: AppKind): Promise<Stores> {
  if (kind === 'in-memory fakes') {
    return {
      issues: () => Promise.resolve(new InMemoryIssueRepository()),
      runs: () => Promise.resolve(new InMemorySyncRunRepository()),
      lock: (leaseMs) => Promise.resolve(new InMemorySyncLock(leaseMs)),
      close: () => Promise.resolve(),
    };
  }
  const scratch = await createScratchDatabase();
  const handle = await openDatabase(scratch.url);
  await handle.migrate();
  // The in-memory fakes are new per test; the database is cleared instead (cascade also clears
  // transitions and cycles).
  const empty = async (): Promise<void> => {
    await handle.db.execute(sql`truncate table jira_issue, sync_run, sync_lock cascade`);
  };
  return {
    issues: async () => {
      await empty();
      return new DbIssueRepository(handle.db);
    },
    runs: async () => {
      await empty();
      return new DbSyncRunRepository(handle.db);
    },
    lock: async (leaseMs) => {
      await empty();
      return new DbSyncLock(handle.db, leaseMs);
    },
    close: async () => {
      await handle.close();
      await scratch.drop();
    },
  };
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

for (const kind of APP_KINDS) {
  describe(`jira store contract: ${kind}`, () => {
    let stores: Stores;

    beforeAll(async () => {
      stores = await createStores(kind);
    });
    afterAll(async () => {
      await stores.close();
    });

    describe('IssueRepository', () => {
      it('stores tickets with their transitions and SLA cycles', async () => {
        const repo = await stores.issues();
        await repo.upsertMany([
          snapshot('JSMCO-2', '2026-11-05T10:00:00Z'),
          snapshot('JSMCO-1', '2026-11-01T10:00:00Z'),
        ]);
        expect(await repo.listKeys()).toEqual(['JSMCO-1', 'JSMCO-2']);
        const tickets = await repo.listTickets();
        expect(tickets.map((t) => t.key)).toEqual(['JSMCO-1', 'JSMCO-2']);
        expect(tickets[0]).toEqual(snapshot('JSMCO-1', '2026-11-01T10:00:00Z').ticket);
        const cycles = await repo.listSlaCycles();
        expect(cycles.map((c) => c.ticketKey)).toEqual(['JSMCO-1', 'JSMCO-2']);
        expect(cycles[0]?.cycle).toEqual(snapshot('JSMCO-1', '2026-11-01T10:00:00Z').slaCycles[0]);
        expect(await repo.listTransitions('JSMCO-1')).toEqual(
          snapshot('JSMCO-1', '2026-11-01T10:00:00Z').transitions,
        );
        expect(await repo.listTransitions('JSMCO-404')).toEqual([]);
      });

      it('is idempotent: saving a ticket again replaces it, never duplicates it', async () => {
        const repo = await stores.issues();
        await repo.upsertMany([snapshot('JSMCO-1', '2026-11-01T10:00:00Z')]);
        await repo.upsertMany([snapshot('JSMCO-1', '2026-11-09T10:00:00Z', 'Done')]);
        const tickets = await repo.listTickets();
        expect(tickets).toHaveLength(1);
        expect(tickets[0]?.status).toBe('Done');
        expect(tickets[0]?.statusCategory).toBe('done');
        expect(await repo.listSlaCycles()).toHaveLength(1);
        expect(await repo.listTransitions('JSMCO-1')).toHaveLength(1);
      });

      it('keeps assignee and requester names, and an unassigned ticket stays unassigned', async () => {
        const repo = await stores.issues();
        await repo.upsertMany([
          snapshot('JSMCO-1', '2026-11-01T10:00:00Z'),
          snapshot('JSMCO-2', '2026-11-02T10:00:00Z', 'To Do', { assigned: false }),
        ]);
        const [assigned, unassigned] = await repo.listTickets();
        expect(assigned).toMatchObject({
          assigneeId: 'acc-assignee-1',
          assigneeName: 'Ana Asignada',
          requesterId: 'acc-requester-1',
          requesterName: 'Raúl Solicitante',
        });
        expect(unassigned).toMatchObject({ assigneeId: null, assigneeName: null });
        expect(unassigned?.requesterName).toBe('Raúl Solicitante');
      });

      it('keeps the last copy when one call repeats a key', async () => {
        const repo = await stores.issues();
        await repo.upsertMany([
          snapshot('JSMCO-1', '2026-11-01T10:00:00Z'),
          snapshot('JSMCO-1', '2026-11-09T10:00:00Z', 'Done'),
        ]);
        expect((await repo.listTickets()).map((t) => t.status)).toEqual(['Done']);
      });

      it('lists keys in plain code-unit order, not natural order', async () => {
        const repo = await stores.issues();
        await repo.upsertMany(
          ['JSMCO-10', 'JSMCO-2', 'JSMCO-1'].map((key) => snapshot(key, '2026-11-01T10:00:00Z')),
        );
        expect(await repo.listKeys()).toEqual(['JSMCO-1', 'JSMCO-10', 'JSMCO-2']);
      });

      it('removes deleted tickets with their data, and counts only those that existed', async () => {
        const repo = await stores.issues();
        await repo.upsertMany([
          snapshot('JSMCO-1', '2026-11-01T10:00:00Z'),
          snapshot('JSMCO-2', '2026-11-02T10:00:00Z'),
        ]);
        expect(await repo.deleteByKeys(['JSMCO-2', 'JSMCO-99'])).toBe(1);
        expect(await repo.deleteByKeys([])).toBe(0);
        expect(await repo.listKeys()).toEqual(['JSMCO-1']);
        expect(await repo.listSlaCycles()).toHaveLength(1);
        expect(await repo.listTransitions('JSMCO-2')).toEqual([]);
      });

      it('handles an empty save and a large batch', async () => {
        const repo = await stores.issues();
        await repo.upsertMany([]);
        const many = Array.from({ length: 1200 }, (_, i) =>
          snapshot(`JSMCO-${String(i + 1)}`, '2026-11-01T10:00:00Z'),
        );
        await repo.upsertMany(many);
        expect(await repo.listKeys()).toHaveLength(1200);
        expect(await repo.listSlaCycles()).toHaveLength(1200);
      });
    });

    describe('SyncRunRepository', () => {
      const t0 = at('2026-11-11T10:00:00Z');
      const minutes = (n: number): Date => new Date(t0.getTime() + n * 60_000);

      it('has no history before the first run', async () => {
        const runs = await stores.runs();
        expect(await runs.latest()).toBeNull();
        expect(await runs.latestSucceeded()).toBeNull();
        expect(await runs.findRunning()).toBeNull();
      });

      it('opens a running run and closes it with its outcome', async () => {
        const runs = await stores.runs();
        const run = await runs.start('manual', t0);
        expect(run).toMatchObject({
          status: 'running',
          kind: 'manual',
          finishedAt: null,
          items: 0,
        });
        expect((await runs.findRunning())?.id).toBe(run.id);

        await runs.finish(run.id, { status: 'succeeded', items: 42, error: null }, minutes(1));
        expect(await runs.findRunning()).toBeNull();
        expect(await runs.latestSucceeded()).toMatchObject({
          id: run.id,
          status: 'succeeded',
          items: 42,
          finishedAt: minutes(1),
          startedAt: t0,
        });
      });

      it('keeps the last success when a later run fails', async () => {
        const runs = await stores.runs();
        const good = await runs.start('lazy', t0);
        await runs.finish(good.id, { status: 'succeeded', items: 5, error: null }, minutes(1));
        const bad = await runs.start('lazy', minutes(20));
        await runs.finish(
          bad.id,
          { status: 'failed', items: 0, error: 'Jira unavailable' },
          minutes(21),
        );
        expect((await runs.latestSucceeded())?.id).toBe(good.id);
        expect(await runs.latest()).toMatchObject({
          id: bad.id,
          status: 'failed',
          error: 'Jira unavailable',
        });
      });

      it('never rewrites a run that already finished', async () => {
        const runs = await stores.runs();
        const run = await runs.start('manual', t0);
        await runs.finish(run.id, { status: 'succeeded', items: 1, error: null }, minutes(1));
        await runs.finish(run.id, { status: 'failed', items: 0, error: 'late' }, minutes(9));
        expect(await runs.latest()).toMatchObject({ status: 'succeeded', items: 1, error: null });
      });

      it('ignores an id that is not a real run', async () => {
        const runs = await stores.runs();
        await expect(
          runs.finish('not-a-uuid', { status: 'failed', items: 0, error: null }, t0),
        ).resolves.toBeUndefined();
      });

      it('closes runs that never finished, and only those older than the cut-off', async () => {
        const runs = await stores.runs();
        const stuck = await runs.start('scheduled', t0);
        const fresh = await runs.start('manual', minutes(30));
        expect(await runs.failStale(minutes(20), minutes(31))).toBe(1);
        expect((await runs.findRunning())?.id).toBe(fresh.id);
        const closed = (await runs.recent(10)).find((r) => r.id === stuck.id);
        expect(closed).toMatchObject({ status: 'failed', finishedAt: minutes(31) });
      });

      it('lists recent runs newest first and honours the limit', async () => {
        const runs = await stores.runs();
        for (const n of [0, 10, 20]) await runs.start('lazy', minutes(n));
        expect((await runs.recent(2)).map((r) => r.startedAt)).toEqual([minutes(20), minutes(10)]);
        expect(await runs.recent(0)).toEqual([]);
      });
    });

    describe('SyncLock', () => {
      it('lets one sync run and turns the others away immediately', async () => {
        const lock = await stores.lock();
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const first = lock.runExclusive(async () => {
          await gate;
          return 'done';
        });
        // Give the first call time to take the lock before the second one tries.
        await pause(50);
        expect(await lock.runExclusive(() => Promise.resolve('never'))).toEqual({
          acquired: false,
        });
        release();
        expect(await first).toEqual({ acquired: true, value: 'done' });
      });

      it('frees the lock after success and after a failure', async () => {
        const lock = await stores.lock();
        await expect(lock.runExclusive(() => Promise.reject(new Error('boom')))).rejects.toThrow(
          'boom',
        );
        expect(await lock.runExclusive(() => Promise.resolve(1))).toEqual({
          acquired: true,
          value: 1,
        });
        expect(await lock.runExclusive(() => Promise.resolve(2))).toEqual({
          acquired: true,
          value: 2,
        });
      });

      it('lets a new run take over after a crashed run leaves its lease to expire', async () => {
        const lock = await stores.lock(300);
        // A run that never finishes, like a function that was killed.
        void lock.runExclusive(() => new Promise<never>(() => undefined));
        await pause(50);
        expect(await lock.runExclusive(() => Promise.resolve(1))).toEqual({ acquired: false });
        await pause(400);
        expect(await lock.runExclusive(() => Promise.resolve(2))).toEqual({
          acquired: true,
          value: 2,
        });
      });
    });
  });
}
