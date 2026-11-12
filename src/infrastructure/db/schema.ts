import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
// Relative import on purpose: drizzle-kit does not resolve tsconfig path aliases.
import { newId } from '../../shared/ids';

/** All timestamps are stored in UTC (SDD §4 conventions). */
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => timestamptz('created_at').notNull().defaultNow();
const updatedAt = () =>
  timestamptz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const id = () => uuid('id').primaryKey().$defaultFn(newId);

export const USER_STATUSES = ['invitado', 'activo', 'desactivado'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Roles are data, not code: new roles need no deploy (SDD §10.1). */
export const role = pgTable('role', {
  id: id(),
  name: text('name').notNull().unique(),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Fixed catalog of permission keys, seeded from the domain catalog (SDD §10.1). */
export const permission = pgTable('permission', {
  key: text('key').primaryKey(),
  createdAt: createdAt(),
});

export const rolePermission = pgTable(
  'role_permission',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    permissionKey: text('permission_key')
      .notNull()
      .references(() => permission.key, { onDelete: 'cascade' }),
    granted: boolean('granted').notNull().default(true),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionKey] })],
);

export const appUser = pgTable(
  'app_user',
  {
    id: id(),
    email: text('email').notNull().unique(),
    name: text('name'),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id),
    status: text('status', { enum: USER_STATUSES }).notNull().default('invitado'),
    /** IANA zone used to display dates (D-043). Validated against the domain list in code. */
    timeZone: text('time_zone').notNull().default('America/Bogota'),
    invitedBy: uuid('invited_by').references((): AnyPgColumn => appUser.id),
    invitedAt: timestamptz('invited_at').notNull().defaultNow(),
    lastLoginAt: timestamptz('last_login_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check('app_user_email_lowercase', sql`${table.email} = lower(${table.email})`),
    check('app_user_status_valid', sql`${table.status} in ('invitado', 'activo', 'desactivado')`),
    index('app_user_role_idx').on(table.roleId),
  ],
);

/** Opaque server-side session. `id` is the SHA-256 hash of the cookie value (SDD §4.3). */
export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
    expiresAt: timestamptz('expires_at').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (table) => [
    index('session_user_idx').on(table.userId),
    index('session_expires_idx').on(table.expiresAt),
  ],
);

/** Append-only: a database trigger rejects UPDATE, DELETE and TRUNCATE (see migration 0001). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorId: uuid('actor_id').references(() => appUser.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    at: timestamptz('at').notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_at_idx').on(table.at),
    index('audit_log_actor_idx').on(table.actorId),
  ],
);

export const webhookEvent = pgTable(
  'webhook_event',
  {
    id: id(),
    source: text('source', { enum: ['jira', 'crowdin'] }).notNull(),
    deliveryId: text('delivery_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamptz('received_at').notNull().defaultNow(),
    processedAt: timestamptz('processed_at'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
  },
  (table) => [
    // Idempotency: a repeated delivery is detected by this constraint (SDD §6.2).
    uniqueIndex('webhook_event_delivery_uq').on(table.source, table.deliveryId),
    index('webhook_event_pending_idx').on(table.processedAt),
  ],
);

/**
 * Fixed-window counters for rate limiting. Kept in the database, not in memory, because
 * serverless instances share no memory (SDD §11.2). Not listed in SDD §4.3; see D-023.
 */
export const rateLimitBucket = pgTable(
  'rate_limit_bucket',
  {
    key: text('key').notNull(),
    windowStart: timestamptz('window_start').notNull(),
    hits: integer('hits').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.windowStart] }),
    index('rate_limit_window_idx').on(table.windowStart),
  ],
);

export const STATUS_CATEGORIES = ['new', 'indeterminate', 'done'] as const;
export const SLA_METRIC_VALUES = ['first_response', 'done'] as const;
export const SLA_CYCLE_STATES = ['completed', 'ongoing'] as const;
export const SYNC_KINDS = ['manual', 'lazy', 'scheduled', 'webhook'] as const;
export const SYNC_STATUSES = ['running', 'succeeded', 'failed'] as const;

/**
 * Read-only cache of Jira tickets (SDD §4.1). Jira is the source of truth; every row can be
 * rebuilt by a full sync. The raw Jira payload is deliberately not stored (D-044).
 */
export const jiraIssue = pgTable(
  'jira_issue',
  {
    id: id(),
    key: text('key').notNull().unique(),
    summary: text('summary').notNull(),
    status: text('status').notNull(),
    statusCategory: text('status_category', { enum: STATUS_CATEGORIES }).notNull(),
    requestType: text('request_type').notNull(),
    priority: text('priority'),
    /** Atlassian account id of the assignee. */
    assigneeId: text('assignee_id'),
    assigneeName: text('assignee_name'),
    /** Who asked for the work. Display name only, never an email (D-045). */
    requesterId: text('requester_id'),
    requesterName: text('requester_name'),
    jiraCreatedAt: timestamptz('jira_created_at').notNull(),
    resolvedAt: timestamptz('resolved_at'),
    jiraUpdatedAt: timestamptz('jira_updated_at').notNull(),
    syncedAt: timestamptz('synced_at').notNull().defaultNow(),
  },
  (table) => [
    check(
      'jira_issue_status_category_valid',
      sql`${table.statusCategory} in ('new', 'indeterminate', 'done')`,
    ),
    index('jira_issue_updated_idx').on(table.jiraUpdatedAt),
    index('jira_issue_status_category_idx').on(table.statusCategory),
    index('jira_issue_assignee_idx').on(table.assigneeId),
    index('jira_issue_requester_idx').on(table.requesterId),
  ],
);

/** Status history, used for the real time spent In progress (D-040). */
export const jiraStatusTransition = pgTable(
  'jira_status_transition',
  {
    id: id(),
    issueKey: text('issue_key')
      .notNull()
      .references(() => jiraIssue.key, { onDelete: 'cascade', onUpdate: 'cascade' }),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    at: timestamptz('at').notNull(),
  },
  (table) => [index('jira_status_transition_issue_idx').on(table.issueKey, table.at)],
);

/**
 * One SLA cycle as Jira calculated it (D-039). A table rather than the `sla_*` columns of SDD §4.1
 * because a ticket can have several cycles per metric when it is reopened (D-044).
 */
export const jiraSlaCycle = pgTable(
  'jira_sla_cycle',
  {
    id: id(),
    issueKey: text('issue_key')
      .notNull()
      .references(() => jiraIssue.key, { onDelete: 'cascade', onUpdate: 'cascade' }),
    metric: text('metric', { enum: SLA_METRIC_VALUES }).notNull(),
    state: text('state', { enum: SLA_CYCLE_STATES }).notNull(),
    startedAt: timestamptz('started_at').notNull(),
    stoppedAt: timestamptz('stopped_at'),
    breachAt: timestamptz('breach_at'),
    breached: boolean('breached').notNull(),
    paused: boolean('paused').notNull().default(false),
  },
  (table) => [
    check('jira_sla_cycle_metric_valid', sql`${table.metric} in ('first_response', 'done')`),
    check('jira_sla_cycle_state_valid', sql`${table.state} in ('completed', 'ongoing')`),
    index('jira_sla_cycle_issue_idx').on(table.issueKey),
    index('jira_sla_cycle_period_idx').on(table.metric, table.state, table.stoppedAt),
  ],
);

/** One execution of a sync (SDD §4.1). `error` is a short safe message, never a payload. */
export const syncRun = pgTable(
  'sync_run',
  {
    id: id(),
    source: text('source', { enum: ['jira', 'crowdin'] }).notNull(),
    kind: text('kind', { enum: SYNC_KINDS }).notNull(),
    startedAt: timestamptz('started_at').notNull(),
    finishedAt: timestamptz('finished_at'),
    status: text('status', { enum: SYNC_STATUSES }).notNull().default('running'),
    items: integer('items').notNull().default(0),
    error: text('error'),
  },
  (table) => [
    check('sync_run_status_valid', sql`${table.status} in ('running', 'succeeded', 'failed')`),
    index('sync_run_source_started_idx').on(table.source, table.startedAt),
  ],
);

/**
 * Lease that lets one sync run at a time across every instance (D-035, D-044). A lease with an
 * expiry, not a database session lock: the pooled connection string of Netlify DB does not keep
 * session state, and a crashed run must free the lock by itself.
 */
export const syncLock = pgTable('sync_lock', {
  name: text('name').primaryKey(),
  holder: text('holder').notNull(),
  expiresAt: timestamptz('expires_at').notNull(),
});

/**
 * What the Leader wrote about a quarter ("Lo aprendido", D-061). Append-only: a save adds a row,
 * so earlier versions stay readable and attributable. The database refuses UPDATE and DELETE.
 */
export const learnedEntry = pgTable(
  'learned_entry',
  {
    id: id(),
    quarterYear: integer('quarter_year').notNull(),
    quarterNumber: integer('quarter_number').notNull(),
    conclusions: text('conclusions').notNull().default(''),
    nextFocus: text('next_focus').notNull().default(''),
    notes: text('notes').notNull().default(''),
    authorId: uuid('author_id')
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (table) => [
    check('learned_entry_quarter_valid', sql`${table.quarterNumber} between 1 and 4`),
    index('learned_entry_quarter_idx').on(table.quarterYear, table.quarterNumber, table.createdAt),
  ],
);
