import type { AccessTransaction, AccessUnitOfWork } from '@application/ports/unit-of-work';

/**
 * Fake of the leader lock: callers queue up and run one at a time, which is the behaviour the
 * contract tests compare against Postgres. It does not roll back on failure; the fakes only
 * need the same serialisation, not the same durability.
 */
export class InMemoryAccessUnitOfWork implements AccessUnitOfWork {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly repositories: AccessTransaction) {}

  withLeaderLock<T>(work: (tx: AccessTransaction) => Promise<T>): Promise<T> {
    const run = this.tail.then(() => work(this.repositories));
    // A failed job must not block the ones queued behind it.
    this.tail = run.catch(() => undefined);
    return run;
  }
}
