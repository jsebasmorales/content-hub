import type { StatusTransition } from '@domain/jira/effort';
import type { SlaCycle } from '@domain/jira/sla';
import type { Ticket } from '@domain/jira/ticket';
import type { Result } from '@shared/result';

/** Everything the Hub keeps about one Jira ticket, already mapped into domain types. */
export interface IssueSnapshot {
  readonly ticket: Ticket;
  readonly transitions: readonly StatusTransition[];
  /** Cycles of both SLA metrics, completed and ongoing (D-039). */
  readonly slaCycles: readonly SlaCycle[];
}

export type JiraErrorKind = 'unauthorized' | 'rate_limited' | 'unavailable' | 'invalid_response';

/** Expected failures of talking to Jira. Never carries credentials or response bodies. */
export interface JiraError {
  readonly kind: JiraErrorKind;
  readonly message: string;
  /** Present for `rate_limited` when Jira said how long to wait. */
  readonly retryAfterSeconds?: number;
}

export interface IssuePage {
  readonly issues: readonly IssueSnapshot[];
  /** Null on the last page. */
  readonly nextPageToken: string | null;
}

export interface SearchIssuesInput {
  /** Only tickets updated at or after this moment; null reads the whole project (full load). */
  readonly updatedSince: Date | null;
  readonly pageToken: string | null;
}

/** Read-only access to Jira (SDD §6.1). Nothing here can change a ticket. */
export interface JiraGateway {
  searchIssues(input: SearchIssuesInput): Promise<Result<IssuePage, JiraError>>;
  /** Every ticket key in the project: lets a full reconciliation notice deleted tickets. */
  listIssueKeys(): Promise<Result<readonly string[], JiraError>>;
}

/** A cycle together with the ticket it belongs to, for lists such as "SLAs incumplidos". */
export interface StoredSlaCycle {
  readonly ticketKey: string;
  readonly cycle: SlaCycle;
}

export interface IssueRepository {
  /** Inserts or replaces each ticket together with its transitions and SLA cycles. */
  upsertMany(snapshots: readonly IssueSnapshot[]): Promise<void>;
  /** Removes tickets that no longer exist in Jira. Returns how many were removed. */
  deleteByKeys(keys: readonly string[]): Promise<number>;
  listKeys(): Promise<string[]>;
  listTickets(): Promise<Ticket[]>;
  listSlaCycles(): Promise<StoredSlaCycle[]>;
  listTransitions(ticketKey: string): Promise<StatusTransition[]>;
}
