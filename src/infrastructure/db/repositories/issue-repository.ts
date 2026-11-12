import { asc, inArray, sql } from 'drizzle-orm';
import type { IssueRepository, IssueSnapshot, StoredSlaCycle } from '@application/ports/jira';
import type { StatusTransition } from '@domain/jira/effort';
import type { SlaCycle } from '@domain/jira/sla';
import type { Ticket } from '@domain/jira/ticket';
import type { Database } from '../client';
import { jiraIssue, jiraSlaCycle, jiraStatusTransition } from '../schema';
import { chunk } from './chunk';

/** Rows per INSERT: keeps every statement far below Postgres' 65,535 parameter limit. */
const ROWS_PER_STATEMENT = 500;

/** Code-unit ordering, so the database sorts keys exactly like the in-memory fake does. */
const byKey = (column: typeof jiraIssue.key | typeof jiraSlaCycle.issueKey) =>
  sql`${column} collate "C"`;

const toTicket = (row: typeof jiraIssue.$inferSelect): Ticket => ({
  key: row.key,
  summary: row.summary,
  status: row.status,
  statusCategory: row.statusCategory,
  requestType: row.requestType,
  priority: row.priority,
  assigneeId: row.assigneeId,
  assigneeName: row.assigneeName,
  requesterId: row.requesterId,
  requesterName: row.requesterName,
  createdAt: row.jiraCreatedAt,
  resolvedAt: row.resolvedAt,
  updatedAt: row.jiraUpdatedAt,
});

const toCycle = (row: typeof jiraSlaCycle.$inferSelect): SlaCycle => ({
  metric: row.metric,
  state: row.state,
  startedAt: row.startedAt,
  stoppedAt: row.stoppedAt,
  breachAt: row.breachAt,
  breached: row.breached,
  paused: row.paused,
});

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const issueRow = ({ ticket }: IssueSnapshot) => ({
  key: ticket.key,
  summary: ticket.summary,
  status: ticket.status,
  statusCategory: ticket.statusCategory,
  requestType: ticket.requestType,
  priority: ticket.priority,
  assigneeId: ticket.assigneeId,
  assigneeName: ticket.assigneeName,
  requesterId: ticket.requesterId,
  requesterName: ticket.requesterName,
  jiraCreatedAt: ticket.createdAt,
  resolvedAt: ticket.resolvedAt,
  jiraUpdatedAt: ticket.updatedAt,
});

const transitionRows = (batch: readonly IssueSnapshot[]) =>
  batch.flatMap(({ ticket, transitions }) =>
    transitions.map((t) => ({
      issueKey: ticket.key,
      fromStatus: t.from,
      toStatus: t.to,
      at: t.at,
    })),
  );

const cycleRows = (batch: readonly IssueSnapshot[]) =>
  batch.flatMap(({ ticket, slaCycles }) =>
    slaCycles.map((c) => ({
      issueKey: ticket.key,
      metric: c.metric,
      state: c.state,
      startedAt: c.startedAt,
      stoppedAt: c.stoppedAt,
      breachAt: c.breachAt,
      breached: c.breached,
      paused: c.paused,
    })),
  );

/** On conflict every column is overwritten with the incoming value. */
const overwriteIssue = {
  summary: sql`excluded.summary`,
  status: sql`excluded.status`,
  statusCategory: sql`excluded.status_category`,
  requestType: sql`excluded.request_type`,
  priority: sql`excluded.priority`,
  assigneeId: sql`excluded.assignee_id`,
  assigneeName: sql`excluded.assignee_name`,
  requesterId: sql`excluded.requester_id`,
  requesterName: sql`excluded.requester_name`,
  jiraCreatedAt: sql`excluded.jira_created_at`,
  resolvedAt: sql`excluded.resolved_at`,
  jiraUpdatedAt: sql`excluded.jira_updated_at`,
  syncedAt: sql`now()`,
};

/** Saves up to one batch of tickets; the caller provides the transaction. */
async function saveBatch(tx: Transaction, batch: readonly IssueSnapshot[]): Promise<void> {
  const keys = batch.map((s) => s.ticket.key);
  await tx
    .insert(jiraIssue)
    .values(batch.map(issueRow))
    .onConflictDoUpdate({ target: jiraIssue.key, set: overwriteIssue });

  // A ticket's history and cycles are always replaced whole, never merged.
  await tx.delete(jiraStatusTransition).where(inArray(jiraStatusTransition.issueKey, keys));
  await tx.delete(jiraSlaCycle).where(inArray(jiraSlaCycle.issueKey, keys));
  for (const rows of chunk(transitionRows(batch), ROWS_PER_STATEMENT)) {
    await tx.insert(jiraStatusTransition).values(rows);
  }
  for (const rows of chunk(cycleRows(batch), ROWS_PER_STATEMENT)) {
    await tx.insert(jiraSlaCycle).values(rows);
  }
}

export class DbIssueRepository implements IssueRepository {
  constructor(private readonly db: Database) {}

  async upsertMany(snapshots: readonly IssueSnapshot[]): Promise<void> {
    // The same key twice in one call: the last one wins, like repeated single upserts.
    const latest = [...new Map(snapshots.map((s) => [s.ticket.key, s])).values()];
    if (latest.length === 0) return;
    await this.db.transaction(async (tx) => {
      for (const batch of chunk(latest, ROWS_PER_STATEMENT)) await saveBatch(tx, batch);
    });
  }

  async deleteByKeys(keys: readonly string[]): Promise<number> {
    if (keys.length === 0) return 0;
    let removed = 0;
    for (const batch of chunk([...keys], ROWS_PER_STATEMENT)) {
      // Transitions and cycles go with the ticket (ON DELETE CASCADE).
      const rows = await this.db
        .delete(jiraIssue)
        .where(inArray(jiraIssue.key, batch))
        .returning({ key: jiraIssue.key });
      removed += rows.length;
    }
    return removed;
  }

  async listKeys(): Promise<string[]> {
    const rows = await this.db
      .select({ key: jiraIssue.key })
      .from(jiraIssue)
      .orderBy(byKey(jiraIssue.key));
    return rows.map((row) => row.key);
  }

  async listTickets(): Promise<Ticket[]> {
    const rows = await this.db.select().from(jiraIssue).orderBy(byKey(jiraIssue.key));
    return rows.map(toTicket);
  }

  async listSlaCycles(): Promise<StoredSlaCycle[]> {
    const rows = await this.db
      .select()
      .from(jiraSlaCycle)
      .orderBy(byKey(jiraSlaCycle.issueKey), asc(jiraSlaCycle.startedAt), asc(jiraSlaCycle.metric));
    return rows.map((row) => ({ ticketKey: row.issueKey, cycle: toCycle(row) }));
  }

  async listTransitions(ticketKey: string): Promise<StatusTransition[]> {
    const rows = await this.db
      .select()
      .from(jiraStatusTransition)
      .where(sql`${jiraStatusTransition.issueKey} = ${ticketKey}`)
      .orderBy(asc(jiraStatusTransition.at));
    return rows.map((row) => ({ from: row.fromStatus, to: row.toStatus, at: row.at }));
  }
}
