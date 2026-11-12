// Read-only probe of the real Jira tenant (SDD §6.3, Phase 1 step 1.0). Repeatable.
//
// Usage:  pnpm probe:jira
//
// It only issues GET requests plus the read-only JQL search (POST /search/jql). It prints a
// summary WITHOUT credentials and saves the raw responses to .data/jira-probe/ (ignored by git)
// so they can be anonymized before becoming contract-test fixtures.
/* eslint-disable no-console -- CLI report script: printing is its purpose. */
import { mkdirSync, writeFileSync } from 'node:fs';

// Operational script outside src/: reading the shell/.env values is intended.
/* eslint-disable no-restricted-properties */
const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY } = process.env;
/* eslint-enable no-restricted-properties */

const OUT_DIR = '.data/jira-probe';
const TIMEOUT_MS = 15_000;

if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY) {
  console.error('Missing JIRA_* values. Run through "pnpm probe:jira" so .env is loaded.');
  process.exit(2);
}
const base = new URL(JIRA_BASE_URL);
if (base.protocol !== 'https:' || !base.hostname.endsWith('.atlassian.net')) {
  console.error('JIRA_BASE_URL must be https://<site>.atlassian.net');
  process.exit(2);
}
const origin = base.origin;
const authHeader = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`;

mkdirSync(OUT_DIR, { recursive: true });
const save = (name, data) =>
  writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(data, null, 2));

/** Returns { status, ok, body } and never throws on HTTP errors; network errors are reported. */
async function call(method, path, body) {
  try {
    const res = await fetch(`${origin}${path}`, {
      method,
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { nonJson: text.slice(0, 200) };
    }
    return {
      status: res.status,
      ok: res.ok,
      body: parsed,
      retryAfter: res.headers.get('retry-after'),
    };
  } catch (error) {
    return { status: 0, ok: false, body: { error: error instanceof Error ? error.name : 'error' } };
  }
}

const section = (title) => console.log(`\n=== ${title} ===`);
const line = (label, value) => console.log(`${label.padEnd(34)} ${value}`);

// 1. Credentials
section('1. Credenciales');
const me = await call('GET', '/rest/api/3/myself');
line('GET /myself', me.status);
if (!me.ok) {
  console.error('Las credenciales no funcionan (401 = correo o token mal; 0 = red/URL).');
  process.exit(1);
}
line('Cuenta activa', me.body.active);
line('Tipo de cuenta', me.body.accountType);
save('myself', { accountType: me.body.accountType, active: me.body.active });

// 2. Project
section('2. Proyecto');
const project = await call('GET', `/rest/api/3/project/${encodeURIComponent(JIRA_PROJECT_KEY)}`);
line(`GET /project/${JIRA_PROJECT_KEY}`, project.status);
if (project.ok) {
  line('Clave', project.body.key);
  line('Nombre', project.body.name);
  line('Tipo', `${project.body.projectTypeKey} (${project.body.style})`);
  save('project', project.body);
} else {
  const list = await call('GET', '/rest/api/3/project/search?maxResults=50');
  console.log(
    'La clave configurada no existe o no es visible. Proyectos visibles (clave · nombre):',
  );
  for (const p of list.body?.values ?? []) console.log(`  ${p.key} · ${p.name}`);
  process.exit(1);
}

// 3. Statuses and issue types
section('3. Estados y tipos de incidencia');
const statuses = await call('GET', `/rest/api/3/project/${JIRA_PROJECT_KEY}/statuses`);
line('GET /project/{key}/statuses', statuses.status);
for (const type of statuses.body ?? []) {
  console.log(
    `  ${type.name}: ${type.statuses.map((s) => `${s.name} [${s.statusCategory?.key}]`).join(', ')}`,
  );
}
save('statuses', statuses.body);

// 4. Fields (ids are read from config in the app, never hardcoded)
section('4. Campos relevantes');
const fields = await call('GET', '/rest/api/3/field');
line('GET /field', `${fields.status} (${fields.body?.length ?? 0} campos)`);
const interesting =
  /epic|parent|sprint|request type|time to|sla|story point|team|objective|goal|quarter/i;
const custom = (fields.body ?? []).filter((f) => f.custom && interesting.test(f.name));
for (const f of custom) console.log(`  ${f.id} · ${f.name} · ${f.schema?.type ?? '?'}`);
save('fields-relevant', custom);

// 5. Search + volume
section('5. Búsqueda (POST /search/jql)');
const jql = `project = "${JIRA_PROJECT_KEY}" ORDER BY updated DESC`;
const count = await call('POST', '/rest/api/3/search/approximate-count', { jql });
line('Tickets del proyecto (aprox.)', count.ok ? count.body.count : `error ${count.status}`);
const search = await call('POST', '/rest/api/3/search/jql', {
  jql,
  maxResults: 5,
  fields: ['*all'],
  expand: 'changelog',
});
line('POST /search/jql', search.status);
const issues = search.body?.issues ?? [];
line('Tickets devueltos', issues.length);
line('Paginación', search.body?.nextPageToken ? 'nextPageToken presente' : 'sin siguiente página');
save('search-sample', search.body);
if (issues[0]) {
  const f = issues[0].fields;
  line('Ejemplo · clave', issues[0].key);
  line('Ejemplo · tipo', f.issuetype?.name);
  line('Ejemplo · estado', `${f.status?.name} [${f.status?.statusCategory?.key}]`);
  line(
    'Ejemplo · padre/épica',
    f.parent ? `${f.parent.key} (${f.parent.fields?.issuetype?.name})` : 'sin padre',
  );
  line(
    'Ejemplo · changelog',
    `${issues[0].changelog?.histories?.length ?? 0} entradas en la página`,
  );
}

// 6. Service Desk and SLAs (requires agent permission)
section('6. Service Desk y SLAs');
const desks = await call('GET', '/rest/servicedeskapi/servicedesk');
line('GET /servicedesk', desks.status);
const desk = (desks.body?.values ?? []).find((d) => d.projectKey === JIRA_PROJECT_KEY);
line('Service Desk del proyecto', desk ? `id ${desk.id}` : 'no encontrado');
if (desk) {
  const types = await call(
    'GET',
    `/rest/servicedeskapi/servicedesk/${desk.id}/requesttype?limit=50`,
  );
  line(
    'Tipos de solicitud',
    types.ok ? (types.body.values ?? []).map((t) => t.name).join(' | ') : types.status,
  );
  save('request-types', types.body);
}
if (issues[0]) {
  const sla = await call('GET', `/rest/servicedeskapi/request/${issues[0].key}/sla`);
  line(`GET /request/${issues[0].key}/sla`, sla.status);
  if (sla.ok) {
    for (const metric of sla.body.values ?? []) {
      line(
        '  Métrica SLA',
        `${metric.name} · ciclo completado: ${metric.completedCycles?.length ?? 0} · en curso: ${metric.ongoingCycle ? 'sí' : 'no'}`,
      );
    }
    save('sla-sample', sla.body);
    console.log('  => La cuenta PUEDE leer SLAs.');
  } else {
    console.log(
      '  => La cuenta NO puede leer SLAs (suele faltar el rol de agente del Service Desk).',
    );
  }
}

console.log(`\nRespuestas crudas guardadas en ${OUT_DIR}/ (ignoradas por git).`);
