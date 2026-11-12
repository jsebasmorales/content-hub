import type {
  IssuePage,
  IssueRepository,
  IssueSnapshot,
  JiraError,
  JiraGateway,
  SearchIssuesInput,
  StoredSlaCycle,
} from '@application/ports/jira';
import type { StatusTransition } from '@domain/jira/effort';
import type { Ticket } from '@domain/jira/ticket';
import { err, ok, type Result } from '@shared/result';

/**
 * Fake Jira. Holds the tickets a test gives it, serves them page by page and can be told to fail,
 * so sync use cases are tested without a network (SDD §3 rule 7).
 */
export class FakeJiraGateway implements JiraGateway {
  private issues: readonly IssueSnapshot[] = [];
  private failures: JiraError[] = [];
  /** Every search the fake received, so a test can check what a sync asked for. */
  readonly searches: SearchIssuesInput[] = [];

  constructor(private readonly pageSize = 100) {}

  /** Replaces the tickets "in Jira". */
  setIssues(issues: readonly IssueSnapshot[]): void {
    this.issues = issues;
  }

  /** Back to an empty Jira with no scripted failures and no recorded searches. */
  reset(): void {
    this.issues = [];
    this.failures = [];
    this.searches.length = 0;
  }

  /** The next call (of any kind) fails with this error, once. */
  failNextCall(error: JiraError): void {
    this.failures.push(error);
  }

  searchIssues(input: SearchIssuesInput): Promise<Result<IssuePage, JiraError>> {
    this.searches.push(input);
    const failure = this.failures.shift();
    if (failure) return Promise.resolve(err(failure));

    const matching = this.issues.filter(
      (issue) =>
        input.updatedSince === null ||
        issue.ticket.updatedAt.getTime() >= input.updatedSince.getTime(),
    );
    const start = input.pageToken === null ? 0 : Number(input.pageToken);
    if (!Number.isInteger(start) || start < 0) {
      return Promise.resolve(err({ kind: 'invalid_response', message: 'Bad page token' }));
    }
    const end = start + this.pageSize;
    return Promise.resolve(
      ok({
        issues: matching.slice(start, end),
        nextPageToken: end < matching.length ? String(end) : null,
      }),
    );
  }

  listIssueKeys(): Promise<Result<readonly string[], JiraError>> {
    const failure = this.failures.shift();
    if (failure) return Promise.resolve(err(failure));
    return Promise.resolve(ok(this.issues.map((issue) => issue.ticket.key)));
  }
}

/** Fake of the ticket cache. Replacing a ticket replaces its transitions and SLA cycles too. */
export class InMemoryIssueRepository implements IssueRepository {
  private readonly snapshots = new Map<string, IssueSnapshot>();

  upsertMany(snapshots: readonly IssueSnapshot[]): Promise<void> {
    for (const snapshot of snapshots) this.snapshots.set(snapshot.ticket.key, snapshot);
    return Promise.resolve();
  }

  deleteByKeys(keys: readonly string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) if (this.snapshots.delete(key)) removed += 1;
    return Promise.resolve(removed);
  }

  listKeys(): Promise<string[]> {
    return Promise.resolve(this.sorted().map((snapshot) => snapshot.ticket.key));
  }

  listTickets(): Promise<Ticket[]> {
    return Promise.resolve(this.sorted().map((snapshot) => snapshot.ticket));
  }

  listSlaCycles(): Promise<StoredSlaCycle[]> {
    return Promise.resolve(
      this.sorted().flatMap((snapshot) =>
        [...snapshot.slaCycles]
          .sort(
            (a, b) =>
              a.startedAt.getTime() - b.startedAt.getTime() || compareCodeUnits(a.metric, b.metric),
          )
          .map((cycle) => ({ ticketKey: snapshot.ticket.key, cycle })),
      ),
    );
  }

  listTransitions(ticketKey: string): Promise<StatusTransition[]> {
    const transitions = this.snapshots.get(ticketKey)?.transitions ?? [];
    return Promise.resolve([...transitions].sort((a, b) => a.at.getTime() - b.at.getTime()));
  }

  private sorted(): IssueSnapshot[] {
    return [...this.snapshots.values()].sort((a, b) =>
      compareCodeUnits(a.ticket.key, b.ticket.key),
    );
  }
}

/** Same order as Postgres `collate "C"`, so the fake and the real adapter list alike. */
function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
