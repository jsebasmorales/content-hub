import type { SlaCycleRecord } from './sla-report';
import { isDone, isObsoleteRequestType, type Ticket } from './ticket';

/**
 * What the cached data looks like, so nobody has to guess how far to trust a figure. Every item is
 * a count of something the dashboard shows or leaves out, never a judgement.
 */
export interface DataQuality {
  readonly tickets: number;
  readonly openTickets: number;
  /** Open tickets nobody is assigned to. */
  readonly openWithoutAssignee: number;
  /** Cycles still open on tickets that are already done: Jira never stopped the clock. */
  readonly closedWithOpenClock: number;
  /** Cycles whose clock is paused on tickets that are still open. */
  readonly pausedOnOpenTickets: number;
  /** Tickets of a request type the team retired. They stay in the data. */
  readonly retiredTypeTickets: number;
  /** The oldest ticket creation and the latest ticket change seen in Jira. Null with no data. */
  readonly oldestCreatedAt: Date | null;
  readonly newestUpdatedAt: Date | null;
}

const earliest = (dates: readonly Date[]): Date | null =>
  dates.length === 0 ? null : new Date(Math.min(...dates.map((date) => date.getTime())));

const latest = (dates: readonly Date[]): Date | null =>
  dates.length === 0 ? null : new Date(Math.max(...dates.map((date) => date.getTime())));

/** Pure: counts what is in the cache. */
export function buildDataQuality(input: {
  tickets: readonly Ticket[];
  records: readonly SlaCycleRecord[];
}): DataQuality {
  const { tickets, records } = input;
  const byKey = new Map(tickets.map((ticket) => [ticket.key, ticket]));
  const open = tickets.filter((ticket) => !isDone(ticket));
  let closedWithOpenClock = 0;
  let pausedOnOpenTickets = 0;
  for (const { ticketKey, cycle } of records) {
    const ticket = byKey.get(ticketKey);
    if (!ticket || cycle.state !== 'ongoing') continue;
    if (isDone(ticket)) closedWithOpenClock += 1;
    else if (cycle.paused) pausedOnOpenTickets += 1;
  }
  return {
    tickets: tickets.length,
    openTickets: open.length,
    openWithoutAssignee: open.filter((ticket) => ticket.assigneeId === null).length,
    closedWithOpenClock,
    pausedOnOpenTickets,
    retiredTypeTickets: tickets.filter((ticket) => isObsoleteRequestType(ticket.requestType))
      .length,
    oldestCreatedAt: earliest(tickets.map((ticket) => ticket.createdAt)),
    newestUpdatedAt: latest(tickets.map((ticket) => ticket.updatedAt)),
  };
}
