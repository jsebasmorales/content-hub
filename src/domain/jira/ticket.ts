/** Jira's own grouping of statuses. The domain groups by category, never by status name. */
export type StatusCategory = 'new' | 'indeterminate' | 'done';

/** A Jira work item as the Hub stores it (read-only cache, SDD §4.1). */
export interface Ticket {
  readonly key: string;
  readonly summary: string;
  readonly status: string;
  readonly statusCategory: StatusCategory;
  /** Equals the Jira issue type: here the request type and the issue type are the same. */
  readonly requestType: string;
  readonly priority: string | null;
  /** Atlassian account id of the person the ticket is assigned to. */
  readonly assigneeId: string | null;
  /** Display name only: no email is stored (D-045). */
  readonly assigneeName: string | null;
  /** The person who asked for the work (Jira's reporter / portal requester). */
  readonly requesterId: string | null;
  readonly requesterName: string | null;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
  readonly updatedAt: Date;
}

/**
 * Request types the team marked as no longer in use (Jira keeps them, named "… DON'T USE").
 * Breakdowns by type leave them out so a retired type does not look like a live one.
 */
export const isObsoleteRequestType = (requestType: string): boolean =>
  /don['’]?t\s+use/i.test(requestType);

const TICKET_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

/**
 * The address of a ticket in Jira, or null when it cannot be built safely: no base address,
 * a base that is not https, or a key that does not look like a Jira key. Never throws.
 */
export function ticketUrl(baseUrl: string | null | undefined, key: string): string | null {
  if (!baseUrl || !TICKET_KEY.test(key) || !URL.canParse(baseUrl)) return null;
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:') return null;
  return new URL(`/browse/${key}`, base.origin).toString();
}

export const isDone = (ticket: Pick<Ticket, 'statusCategory'>): boolean =>
  ticket.statusCategory === 'done';
