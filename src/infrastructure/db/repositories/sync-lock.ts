import { and, eq, lte, sql } from 'drizzle-orm';
import type { SyncLock } from '@application/ports/sync';
import { newId } from '@shared/ids';
import type { Database } from '../client';
import { syncLock } from '../schema';

const LOCK_NAME = 'jira-sync';

/** Matches the longest a Netlify background function may run. */
export const DEFAULT_SYNC_LEASE_MS = 15 * 60 * 1000;

/**
 * One sync at a time across every instance, using an expiring lease row instead of a session
 * advisory lock: the pooled Netlify DB connection does not keep session state, and a run that
 * dies must release the lock by itself when its lease expires (D-044).
 */
export class DbSyncLock implements SyncLock {
  constructor(
    private readonly db: Database,
    private readonly leaseMs: number = DEFAULT_SYNC_LEASE_MS,
  ) {}

  async runExclusive<T>(
    work: () => Promise<T>,
  ): Promise<{ acquired: true; value: T } | { acquired: false }> {
    const holder = newId();
    if (!(await this.tryAcquire(holder))) return { acquired: false };
    try {
      return { acquired: true, value: await work() };
    } finally {
      await this.release(holder);
    }
  }

  /** Takes the lease if nobody holds it or the current one has expired. One atomic statement. */
  private async tryAcquire(holder: string): Promise<boolean> {
    const expiresAt = sql`now() + make_interval(secs => ${this.leaseMs / 1000})`;
    const rows = await this.db
      .insert(syncLock)
      .values({ name: LOCK_NAME, holder, expiresAt })
      .onConflictDoUpdate({
        target: syncLock.name,
        set: { holder, expiresAt },
        setWhere: lte(syncLock.expiresAt, sql`now()`),
      })
      .returning({ holder: syncLock.holder });
    return rows[0]?.holder === holder;
  }

  /** Releases only our own lease: if it expired and someone else took over, leave theirs alone. */
  private async release(holder: string): Promise<void> {
    await this.db
      .delete(syncLock)
      .where(and(eq(syncLock.name, LOCK_NAME), eq(syncLock.holder, holder)));
  }
}
