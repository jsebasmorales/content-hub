import { and, desc, eq, lt } from 'drizzle-orm';
import type { SyncKind, SyncOutcome, SyncRun, SyncRunRepository } from '@application/ports/sync';
import { isUuid } from '@shared/ids';
import type { Database } from '../client';
import { syncRun } from '../schema';

const JIRA = 'jira';

const toRun = (row: typeof syncRun.$inferSelect): SyncRun => ({
  id: row.id,
  source: JIRA,
  // 'webhook' exists only for Crowdin rows; this repository reads Jira rows, which never use it.
  kind: row.kind === 'webhook' ? 'scheduled' : row.kind,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
  status: row.status,
  items: row.items,
  error: row.error,
});

/** Newest first. Ids are UUID v7, so they break ties between runs that start in the same ms. */
const newestFirst = [desc(syncRun.startedAt), desc(syncRun.id)];

export class DbSyncRunRepository implements SyncRunRepository {
  constructor(private readonly db: Database) {}

  async start(kind: SyncKind, now: Date): Promise<SyncRun> {
    const [row] = await this.db
      .insert(syncRun)
      .values({ source: JIRA, kind, startedAt: now, status: 'running' })
      .returning();
    if (!row) throw new Error('sync_run insert returned no row');
    return toRun(row);
  }

  async finish(id: string, outcome: SyncOutcome, now: Date): Promise<void> {
    if (!isUuid(id)) return;
    // Only a running run can be finished: a second `finish` must not rewrite history.
    await this.db
      .update(syncRun)
      .set({
        status: outcome.status,
        items: outcome.items,
        error: outcome.error,
        finishedAt: now,
      })
      .where(and(eq(syncRun.id, id), eq(syncRun.status, 'running')));
  }

  async latestSucceeded(): Promise<SyncRun | null> {
    return this.first(and(eq(syncRun.source, JIRA), eq(syncRun.status, 'succeeded')));
  }

  async latest(): Promise<SyncRun | null> {
    return this.first(eq(syncRun.source, JIRA));
  }

  async findRunning(): Promise<SyncRun | null> {
    return this.first(and(eq(syncRun.source, JIRA), eq(syncRun.status, 'running')));
  }

  async failStale(startedBefore: Date, now: Date): Promise<number> {
    const rows = await this.db
      .update(syncRun)
      .set({ status: 'failed', finishedAt: now, error: 'Interrupted: the run never finished' })
      .where(
        and(
          eq(syncRun.source, JIRA),
          eq(syncRun.status, 'running'),
          lt(syncRun.startedAt, startedBefore),
        ),
      )
      .returning({ id: syncRun.id });
    return rows.length;
  }

  async recent(limit: number): Promise<SyncRun[]> {
    if (limit <= 0) return [];
    const rows = await this.db
      .select()
      .from(syncRun)
      .where(eq(syncRun.source, JIRA))
      .orderBy(...newestFirst)
      .limit(limit);
    return rows.map(toRun);
  }

  private async first(where: ReturnType<typeof and>): Promise<SyncRun | null> {
    const [row] = await this.db
      .select()
      .from(syncRun)
      .where(where)
      .orderBy(...newestFirst)
      .limit(1);
    return row ? toRun(row) : null;
  }
}
