import type {
  SyncKind,
  SyncLauncher,
  SyncLock,
  SyncMode,
  SyncOutcome,
  SyncRun,
  SyncRunRepository,
} from '@application/ports/sync';
import { newId } from '@shared/ids';

export class InMemorySyncRunRepository implements SyncRunRepository {
  private readonly runs: SyncRun[] = [];

  start(kind: SyncKind, now: Date): Promise<SyncRun> {
    const run: SyncRun = {
      id: newId(),
      source: 'jira',
      kind,
      startedAt: now,
      finishedAt: null,
      status: 'running',
      items: 0,
      error: null,
    };
    this.runs.push(run);
    return Promise.resolve(run);
  }

  finish(id: string, outcome: SyncOutcome, now: Date): Promise<void> {
    const index = this.runs.findIndex((run) => run.id === id);
    const run = this.runs[index];
    // Only a running run can be finished: a second `finish` must not rewrite history.
    if (run?.status === 'running') {
      this.runs[index] = { ...run, ...outcome, finishedAt: now };
    }
    return Promise.resolve();
  }

  latestSucceeded(): Promise<SyncRun | null> {
    return Promise.resolve(this.newestFirst().find((run) => run.status === 'succeeded') ?? null);
  }

  latest(): Promise<SyncRun | null> {
    return Promise.resolve(this.newestFirst()[0] ?? null);
  }

  findRunning(): Promise<SyncRun | null> {
    return Promise.resolve(this.newestFirst().find((run) => run.status === 'running') ?? null);
  }

  failStale(startedBefore: Date, now: Date): Promise<number> {
    let closed = 0;
    this.runs.forEach((run, index) => {
      if (run.status === 'running' && run.startedAt.getTime() < startedBefore.getTime()) {
        this.runs[index] = {
          ...run,
          status: 'failed',
          finishedAt: now,
          error: 'Interrupted: the run never finished',
        };
        closed += 1;
      }
    });
    return Promise.resolve(closed);
  }

  recent(limit: number): Promise<SyncRun[]> {
    return Promise.resolve(this.newestFirst().slice(0, Math.max(0, limit)));
  }

  /** Insertion order is the tie-breaker when two runs share a start time. */
  private newestFirst(): SyncRun[] {
    return this.runs
      .map((run, order) => ({ run, order }))
      .sort((a, b) => b.run.startedAt.getTime() - a.run.startedAt.getTime() || b.order - a.order)
      .map(({ run }) => run);
  }
}

/** Fake launcher: remembers what was asked for, starts nothing. */
export class FakeSyncLauncher implements SyncLauncher {
  readonly launches: { readonly kind: SyncKind; readonly mode: SyncMode }[] = [];
  private failing = false;

  /** The next launch fails, like a background function that cannot be reached. */
  failNextLaunch(): void {
    this.failing = true;
  }

  launch(kind: SyncKind, mode: SyncMode): Promise<void> {
    if (this.failing) {
      this.failing = false;
      return Promise.reject(new Error('The sync function could not be reached'));
    }
    this.launches.push({ kind, mode });
    return Promise.resolve();
  }
}

/**
 * Fake of the cross-instance lock: a lease with an expiry, like the real one. One holder at a
 * time; a lease nobody released (a crashed run) can be taken over once it expires.
 */
export class InMemorySyncLock implements SyncLock {
  private lease: { readonly holder: string; readonly expiresAt: number } | null = null;

  constructor(private readonly leaseMs: number = 15 * 60 * 1000) {}

  async runExclusive<T>(
    work: () => Promise<T>,
  ): Promise<{ acquired: true; value: T } | { acquired: false }> {
    const holder = newId();
    if (this.lease !== null && this.lease.expiresAt > Date.now()) return { acquired: false };
    this.lease = { holder, expiresAt: Date.now() + this.leaseMs };
    try {
      return { acquired: true, value: await work() };
    } finally {
      // Release only our own lease: if it expired and another run took over, leave theirs.
      if (this.currentHolder() === holder) this.lease = null;
    }
  }

  /** Read through a method so the compiler does not assume the lease is still ours after an await. */
  private currentHolder(): string | null {
    return this.lease?.holder ?? null;
  }
}
