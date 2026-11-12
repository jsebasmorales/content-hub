// Creates (or rotates) the least-privilege role the deployed app connects with (D-030, D-017).
//
// Usage (PowerShell), with the OWNER connection string, the one used to run `pnpm db:migrate`:
//   $env:DATABASE_URL = Read-Host "Cadena del dueño (Read and write)"
//   node scripts/create-runtime-role.mjs
//   Remove-Item Env:DATABASE_URL
//
// It prints the connection string for the new role (host switched to the pooled endpoint).
// Paste it into Netlify as DATABASE_URL. Keep using the owner string only for `pnpm db:migrate`.
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const ROLE = 'app_runtime';
// Operational script outside src/: reading the owner string from the shell is intended.
// eslint-disable-next-line no-restricted-properties
const ownerUrl = process.env.DATABASE_URL;
if (!ownerUrl?.startsWith('postgres')) {
  console.error('Set DATABASE_URL to the owner connection string (postgresql://...).');
  process.exit(2);
}

const quote = (name) => `"${name.replaceAll('"', '""')}"`;
// base64url has only letters, digits, "-" and "_": safe inside a SQL string literal.
const password = randomBytes(32).toString('base64url');

const owner = new pg.Client({ connectionString: ownerUrl });
await owner.connect();
try {
  const { rows } = await owner.query('select current_database() as db, current_user as owner');
  const { db, owner: ownerRole } = rows[0];
  const exists = (await owner.query('select 1 from pg_roles where rolname = $1', [ROLE])).rowCount;

  await owner.query(
    exists
      ? `alter role ${ROLE} login password '${password}'`
      : `create role ${ROLE} login password '${password}'`,
  );
  // Plain DML on existing and future tables. No DDL, no ownership, so it cannot drop the
  // audit_log trigger or alter tables.
  await owner.query(`grant connect on database ${quote(db)} to ${ROLE}`);
  await owner.query(`grant usage on schema public to ${ROLE}`);
  await owner.query(
    `grant select, insert, update, delete on all tables in schema public to ${ROLE}`,
  );
  await owner.query(`grant usage, select on all sequences in schema public to ${ROLE}`);
  await owner.query(
    `alter default privileges for role ${quote(ownerRole)} in schema public ` +
      `grant select, insert, update, delete on tables to ${ROLE}`,
  );
  await owner.query(
    `alter default privileges for role ${quote(ownerRole)} in schema public ` +
      `grant usage, select on sequences to ${ROLE}`,
  );
  // audit_log is append-only (D-017): defense in depth on top of the trigger.
  await owner.query(`revoke update, delete, truncate on audit_log from ${ROLE}`);
  // learned_entry keeps every version of the Leader's text (D-061): same defense in depth. Migration
  // 0006 does this too; here it covers a role created after that migration. The table only exists once
  // the migrations have run, so the script no longer fails when it is run before them.
  const learned = await owner.query("select to_regclass('public.learned_entry') as found");
  if (learned.rows[0]?.found) {
    await owner.query(`revoke update, delete, truncate on learned_entry from ${ROLE}`);
  }

  const runtime = new URL(ownerUrl);
  runtime.username = ROLE;
  runtime.password = password;
  const direct = runtime.toString();
  // Neon's pooled endpoint is the same endpoint id plus "-pooler" in the first host label.
  const [label, ...rest] = runtime.hostname.split('.');
  if (label && !label.endsWith('-pooler'))
    runtime.hostname = [`${label}-pooler`, ...rest].join('.');
  const pooled = runtime.toString();

  // Same pool settings as the app (src/infrastructure/db/client.ts), so a pooler that rejects
  // them fails here and not in production.
  for (const [name, url] of [['pooled', pooled]]) {
    const probe = new pg.Pool({ connectionString: url, max: 1, statement_timeout: 15_000 });
    try {
      await probe.query('select 1');
      await probe.query('select count(*) from audit_log');
      console.warn(`OK: ${name} connection works with the app's pool settings.`);
    } catch (error) {
      console.error(`FAILED (${name}): ${error.message}`);
      console.error('Use the direct string below instead of the pooled one.');
    } finally {
      await probe.end();
    }
  }

  console.warn(`\nRole ${ROLE} ready in database ${db} (owner: ${ownerRole}).`);
  console.warn('DATABASE_URL for Netlify (pooled):\n');
  process.stdout.write(pooled + '\n');
  console.warn('\nFallback, direct (use only if the pooled one failed):\n');
  process.stdout.write(direct + '\n');
} finally {
  await owner.end();
}
