import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema';

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DatabaseHandle {
  readonly db: Database;
  /** Runs the SQL migrations in `./migrations` against this database. */
  readonly migrate: () => Promise<void>;
  readonly close: () => Promise<void>;
}

const MIGRATIONS_FOLDER = new URL('./migrations', import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  '$1',
);

const PGLITE_PREFIX = 'pglite:';

/**
 * Opens a database from a connection string:
 *  - `pglite:memory`      embedded Postgres in memory (tests)
 *  - `pglite:<directory>` embedded Postgres persisted on disk (local development)
 *  - `postgres://...`     any standard Postgres (Netlify DB / Neon, Docker, other hosting)
 */
export async function openDatabase(url: string): Promise<DatabaseHandle> {
  if (url.startsWith(PGLITE_PREFIX)) {
    return openPglite(url.slice(PGLITE_PREFIX.length));
  }
  return openPostgres(url);
}

async function openPglite(location: string): Promise<DatabaseHandle> {
  if (location !== 'memory') mkdirSync(dirname(location), { recursive: true });
  const client = location === 'memory' ? new PGlite() : new PGlite(location);
  await client.waitReady;
  const db = drizzlePglite({ client, schema });
  return {
    db,
    migrate: async () => {
      const { migrate } = await import('drizzle-orm/pglite/migrator');
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    },
    close: () => client.close(),
  };
}

function openPostgres(url: string): Promise<DatabaseHandle> {
  // Small, short-lived pool: each serverless instance is brief and the provider pools too.
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  });
  const db = drizzlePg({ client: pool, schema });
  return Promise.resolve({
    db,
    migrate: async () => {
      const { migrate } = await import('drizzle-orm/node-postgres/migrator');
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    },
    close: () => pool.end(),
  });
}
