import type { IssueRepository, JiraError, JiraGateway } from '@application/ports/jira';
import type { Clock } from '@application/ports/services';
import type {
  SyncKind,
  SyncLock,
  SyncMode,
  SyncOutcome,
  SyncRunRepository,
} from '@application/ports/sync';
import { incrementalSince, isSafeDeletion } from '@domain/jira/sync-policy';
import { logEvent } from '@shared/log';

/** Safety stop: far more pages than any realistic project has. */
const MAX_PAGES = 200;

export interface RunJiraSyncDeps {
  readonly jira: JiraGateway;
  readonly issues: IssueRepository;
  readonly runs: SyncRunRepository;
  readonly lock: SyncLock;
  readonly clock: Clock;
}

export interface SyncInput {
  readonly kind: SyncKind;
  readonly mode: SyncMode;
  /** Reads Jira and reports what would change, without writing anything. */
  readonly dryRun?: boolean;
}

export type SyncResult =
  | { readonly status: 'busy' }
  | {
      readonly status: 'succeeded';
      readonly items: number;
      /** Tickets removed (or, in a dry run, that would be removed) because Jira no longer has them. */
      readonly deleted: number;
      readonly dryRun: boolean;
    }
  | { readonly status: 'failed'; readonly items: number; readonly error: string };

type Failure = Extract<SyncResult, { status: 'failed' }>;

const describe = (error: JiraError): string => `Jira ${error.kind}: ${error.message}`;

/**
 * Brings the ticket cache up to date with Jira (SDD §6.1).
 *
 * Each page is saved as soon as it is read, and every ticket is saved whole, so a failure halfway
 * leaves valid data behind and the next run simply repeats from the last *successful* start
 * (D-047). Only one sync runs at a time.
 */
export class RunJiraSync {
  constructor(private readonly deps: RunJiraSyncDeps) {}

  async execute(input: SyncInput): Promise<SyncResult> {
    const outcome = await this.deps.lock.runExclusive(() => this.runLocked(input));
    return outcome.acquired ? outcome.value : { status: 'busy' };
  }

  private async runLocked(input: SyncInput): Promise<SyncResult> {
    const { runs, clock } = this.deps;
    const dryRun = input.dryRun === true;
    const startedAt = clock.now();
    // Holding the lock means no other sync is alive: any run still "running" is a dead one.
    if (!dryRun) await runs.failStale(startedAt, startedAt);

    const last = await runs.latestSucceeded();
    // The window starts when the last good run STARTED, so changes made while it ran are re-read.
    const since = input.mode === 'full' ? null : incrementalSince(last?.startedAt ?? null);
    const run = dryRun ? null : await runs.start(input.kind, startedAt);

    const result = await this.sync(since, dryRun);
    if (run) await runs.finish(run.id, toOutcome(result), clock.now());
    return result;
  }

  /** A full read (no lower bound) is also the moment to notice tickets deleted in Jira. */
  private async sync(since: Date | null, dryRun: boolean): Promise<SyncResult> {
    try {
      const pages = await this.readPages(since, dryRun);
      if (pages.status === 'failed') return pages;
      if (since !== null) return { status: 'succeeded', items: pages.items, deleted: 0, dryRun };
      const deleted = await this.removeDeleted(dryRun);
      if (typeof deleted !== 'number') return { ...deleted, items: pages.items };
      return { status: 'succeeded', items: pages.items, deleted, dryRun };
    } catch (error) {
      // Log the class of the problem only: the message could carry database details.
      logEvent('error', 'jira.sync_crashed', {
        name: error instanceof Error ? error.name : 'unknown',
      });
      return { status: 'failed', items: 0, error: 'Unexpected error while syncing' };
    }
  }

  private async readPages(
    since: Date | null,
    dryRun: boolean,
  ): Promise<{ status: 'ok'; items: number } | Failure> {
    let items = 0;
    let pageToken: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await this.deps.jira.searchIssues({ updatedSince: since, pageToken });
      if (!result.ok) return { status: 'failed', items, error: describe(result.error) };
      if (!dryRun) await this.deps.issues.upsertMany(result.value.issues);
      items += result.value.issues.length;
      pageToken = result.value.nextPageToken;
      if (pageToken === null) return { status: 'ok', items };
    }
    return { status: 'failed', items, error: 'Jira returned more pages than the safety limit' };
  }

  /** Removes cached tickets Jira no longer lists, unless that looks like a glitch. */
  private async removeDeleted(
    dryRun: boolean,
  ): Promise<number | Pick<Failure, 'status' | 'error'>> {
    const listed = await this.deps.jira.listIssueKeys();
    if (!listed.ok) return { status: 'failed', error: describe(listed.error) };
    const inJira = new Set(listed.value);
    const stored = await this.deps.issues.listKeys();
    const missing = stored.filter((key) => !inJira.has(key));
    if (!isSafeDeletion(missing.length, stored.length)) {
      return {
        status: 'failed',
        error: `Refusing to delete ${String(missing.length)} of ${String(stored.length)} cached tickets`,
      };
    }
    return dryRun ? missing.length : this.deps.issues.deleteByKeys(missing);
  }
}

function toOutcome(result: SyncResult): SyncOutcome {
  if (result.status === 'succeeded') {
    return { status: 'succeeded', items: result.items, error: null };
  }
  return {
    status: 'failed',
    items: result.status === 'failed' ? result.items : 0,
    error: result.status === 'failed' ? result.error : null,
  };
}
