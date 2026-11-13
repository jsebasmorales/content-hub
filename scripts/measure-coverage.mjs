// Read-only measurement of how much history the production database holds (PLAN_FILTROS §0.4).
//
// Usage (PowerShell), with the connection string you already use for the Hub. A read-only role is
// ideal, but the runtime role works too: the script only ever reads.
//   $env:DATABASE_URL = Read-Host "Cadena de conexión"
//   node scripts/measure-coverage.mjs
//   Remove-Item Env:DATABASE_URL
//
// What it prints, and nothing else: row totals, the earliest and latest dates, and counts per month
// (tickets created, tickets resolved, SLA cycles closed per metric). No ticket keys, titles, names,
// request types or connection details. Months are in Bogotá time (UTC-5, no daylight saving), as the
// Hub counts them. It does not write: the whole run is one READ ONLY transaction that is rolled back.
//
// `pglite:<directory>` is also accepted, so the script can be tried against a copy of the local base.
import pg from 'pg';

// Operational script outside src/: reading the connection string from the shell is intended.
// eslint-disable-next-line no-restricted-properties
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL first (see the usage at the top of this file).');
  process.exit(2);
}

async function open() {
  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const client = new PGlite(url.slice('pglite:'.length));
    await client.waitReady;
    return { query: (sql) => client.query(sql), close: () => client.close() };
  }
  if (!url.startsWith('postgres')) {
    console.error('DATABASE_URL must start with postgres:// or postgresql://');
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: url, statement_timeout: 30_000 });
  await client.connect();
  return { query: (sql) => client.query(sql), close: () => client.end() };
}

const BOGOTA = `'America/Bogota'`;
const month = (column) => `to_char(${column} at time zone ${BOGOTA}, 'YYYY-MM')`;
const day = (column) => `to_char(${column} at time zone ${BOGOTA}, 'YYYY-MM-DD')`;

const QUERIES = {
  totals: `
    select count(*)::int as tickets,
           count(resolved_at)::int as resolved,
           ${day('min(jira_created_at)')} as first_created,
           ${day('max(jira_created_at)')} as last_created,
           ${day('min(resolved_at)')} as first_resolved
    from jira_issue`,
  cycles: `
    select metric,
           count(*)::int as cycles,
           count(*) filter (where state = 'completed')::int as closed,
           count(*) filter (where state = 'ongoing')::int as ongoing,
           ${day('min(started_at)')} as first_started,
           ${day(`min(stopped_at) filter (where state = 'completed')`)} as first_closed
    from jira_sla_cycle group by metric order by metric`,
  created: `select ${month('jira_created_at')} as m, count(*)::int as n from jira_issue group by 1 order by 1`,
  resolved: `select ${month('resolved_at')} as m, count(*)::int as n from jira_issue where resolved_at is not null group by 1 order by 1`,
  closed: `select ${month('stopped_at')} as m, metric, count(*)::int as n from jira_sla_cycle where state = 'completed' and stopped_at is not null group by 1, 2 order by 1, 2`,
};

const db = await open();
try {
  await db.query('begin read only');
  const out = {};
  for (const [name, sql] of Object.entries(QUERIES)) out[name] = (await db.query(sql)).rows;
  await db.query('rollback');

  const months = [
    ...new Set([...out.created, ...out.resolved, ...out.closed].map((r) => r.m)),
  ].sort();
  const pick = (rows, m, metric) =>
    rows.find((r) => r.m === m && (metric === undefined || r.metric === metric))?.n ?? 0;
  const table = months.map((m) => ({
    mes: m,
    creados: pick(out.created, m),
    resueltos: pick(out.resolved, m),
    ciclos_cerrados_first_response: pick(out.closed, m, 'first_response'),
    ciclos_cerrados_done: pick(out.closed, m, 'done'),
  }));

  const line = (value) => JSON.stringify(value);
  const print = (text) =>
    process.stdout.write(`${text}
`);
  print(`generado: ${new Date().toISOString()}`);
  print(`totales: ${line(out.totals[0])}`);
  for (const cycle of out.cycles) print(`ciclos: ${line(cycle)}`);
  print('por_mes (hora de Bogotá):');
  for (const row of table) print(`  ${line(row)}`);
} catch (error) {
  // Only the error code: the message of a failed connection can carry the host name.
  console.error(`The measurement failed (${error?.code ?? 'unknown'}). Nothing was written.`);
  process.exitCode = 1;
} finally {
  await db.close().catch(() => undefined);
}
