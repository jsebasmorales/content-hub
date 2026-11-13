// Independent recount of one request type, read straight from Jira (read only).
//
// Usage: node --env-file=.env scripts/recount-type.mjs "Launch New Content" [2026-T4]
//
// It repeats, with code that shares nothing with the Hub, the three numbers /resumen shows for a
// request type: created in the period, completed in the period and the share of what was created
// that is done today. Rules written from the definitions page (D-059, D-060), not from the Hub's code:
//   - period: calendar quarter in Bogotá time (UTC-5, no daylight saving);
//   - created: the ticket's creation date falls in the period;
//   - completed: the ticket is in the Done category today and the moment it entered that category
//     (resolution date when Jira has one, else the status-category change) falls in the period;
//   - % of created already completed: created in the period AND Done today, over created in the period.
// Only ticket keys, dates and statuses are printed: no summaries and no people.
const [type = 'Launch New Content', quarter = '2026-T4'] = process.argv.slice(2);
const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY } = process.env;
if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY) {
  console.error('Missing JIRA_* settings: run with node --env-file=.env');
  process.exit(1);
}
// Same rule as the Hub's outbound guard: only the company's Atlassian site, only over https.
const jiraUrl = new URL(JIRA_BASE_URL);
if (jiraUrl.protocol !== 'https:' || !jiraUrl.hostname.endsWith('.atlassian.net')) {
  console.error('JIRA_BASE_URL must be an https://….atlassian.net address');
  process.exit(1);
}
const BOGOTA_OFFSET = '-05:00';
const authorization = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`;

async function readAll() {
  const issues = [];
  let token;
  do {
    const response = await fetch(`${JIRA_BASE_URL}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jql: `project = ${JIRA_PROJECT_KEY} AND issuetype = "${type.replaceAll('"', '')}" ORDER BY created ASC`,
        maxResults: 100,
        fields: ['created', 'status', 'resolutiondate', 'statuscategorychangedate'],
        ...(token ? { nextPageToken: token } : {}),
      }),
    });
    if (!response.ok) throw new Error(`Jira answered ${String(response.status)}`);
    const page = await response.json();
    issues.push(...page.issues);
    token = page.nextPageToken;
  } while (token);
  return issues;
}

function quarterBounds(label) {
  const [year, q] = label.split('-T').map(Number);
  const startMonth = (q - 1) * 3 + 1;
  const pad = (n) => String(n).padStart(2, '0');
  const from = new Date(`${String(year)}-${pad(startMonth)}-01T00:00:00${BOGOTA_OFFSET}`);
  const endYear = startMonth + 3 > 12 ? year + 1 : year;
  const endMonth = startMonth + 3 > 12 ? 1 : startMonth + 3;
  const to = new Date(`${String(endYear)}-${pad(endMonth)}-01T00:00:00${BOGOTA_OFFSET}`);
  return { from, to };
}

const within = (moment, { from, to }) => moment !== null && moment >= from && moment < to;
const bogota = (moment) =>
  moment === null
    ? '—'
    : moment.toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).slice(0, 16).replace(' ', ' ');

const rows = (await readAll()).map((issue) => {
  const done = issue.fields.status.statusCategory.key === 'done';
  const finished = issue.fields.resolutiondate ?? issue.fields.statuscategorychangedate;
  return {
    key: issue.key,
    status: issue.fields.status.name,
    created: new Date(issue.fields.created),
    done,
    completedAt: done && finished ? new Date(finished) : null,
  };
});

function count(label) {
  const range = quarterBounds(label);
  const created = rows.filter((row) => within(row.created, range));
  const completed = rows.filter((row) => within(row.completedAt, range));
  const createdDone = created.filter((row) => row.done);
  const percent =
    created.length === 0 ? null : Math.round((createdDone.length / created.length) * 1000) / 10;
  return { label, range, created, completed, createdDone, percent };
}

const quarters = ['2025-T4', '2026-T1', '2026-T2', '2026-T3', '2026-T4'];
console.log(
  `Tipo: ${type} · ${String(rows.length)} tickets en total · hoy ${bogota(new Date())} (Bogotá)\n`,
);
console.log(
  '| Trimestre | Creados | Completados en el periodo | Creados y ya completados | % de lo creado ya completado |',
);
console.log(
  '| --------- | ------: | ------------------------: | -----------------------: | ---------------------------: |',
);
for (const label of quarters) {
  const c = count(label);
  console.log(
    `| ${label} | ${String(c.created.length)} | ${String(c.completed.length)} | ${String(c.createdDone.length)} | ${c.percent === null ? '—' : `${String(c.percent)} %`} |`,
  );
}

const focus = count(quarter);
console.log(`\nDetalle de ${quarter}:`);
for (const [title, list] of [
  ['Creados', focus.created],
  ['Completados', focus.completed],
]) {
  console.log(`\n${title} (${String(list.length)}):`);
  for (const row of list) {
    console.log(
      `- ${row.key} · creado ${bogota(row.created)} · ${row.status} · completado ${bogota(row.completedAt)}`,
    );
  }
}
