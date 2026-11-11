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
