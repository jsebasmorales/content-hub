export type SyncKind = 'manual' | 'lazy' | 'scheduled';
export type SyncStatus = 'running' | 'succeeded' | 'failed';

/** One execution of a sync (`sync_run`, SDD §4.1). */
export interface SyncRun {
  readonly id: string;
  readonly source: 'jira';
  readonly kind: SyncKind;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly status: SyncStatus;
  readonly items: number;
  /** A short, safe message. Never a payload, a token or a stack trace. */
  readonly error: string | null;
}

export interface SyncOutcome {
  readonly status: 'succeeded' | 'failed';
  readonly items: number;
  readonly error: string | null;
}

export interface SyncRunRepository {
  start(kind: SyncKind, now: Date): Promise<SyncRun>;
  finish(id: string, outcome: SyncOutcome, now: Date): Promise<void>;
  /** The most recent run that succeeded. Its `startedAt` is the safe start of the next window. */
  latestSucceeded(): Promise<SyncRun | null>;
  /** The most recent run of any status. */
  latest(): Promise<SyncRun | null>;
  findRunning(): Promise<SyncRun | null>;
  /**
   * Marks as failed any run still "running" that started before `startedBefore`: a background
   * function that died would otherwise block every later sync. Returns how many were closed.
   */
  failStale(startedBefore: Date, now: Date): Promise<number>;
  recent(limit: number): Promise<SyncRun[]>;
}

export type SyncMode = 'incremental' | 'full';

/**
 * Starts a sync in the background and returns at once, so a page or a button never waits for
 * Jira (D-035). The real one calls a Netlify background function (step 1.7).
 */
export interface SyncLauncher {
  launch(kind: SyncKind, mode: SyncMode): Promise<void>;
}

/** Lets only one sync run at a time, across every instance of the app (D-035). */
export interface SyncLock {
  /** Runs `work` if nobody else is syncing; otherwise returns `{ acquired: false }` at once. */
  runExclusive<T>(
    work: () => Promise<T>,
  ): Promise<{ acquired: true; value: T } | { acquired: false }>;
}
