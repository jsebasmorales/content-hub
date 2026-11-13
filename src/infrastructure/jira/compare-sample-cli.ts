import { mkdirSync, writeFileSync } from 'node:fs';
import { cycleOutcome, SLA_METRICS, type SlaCycle } from '@domain/jira/sla';
import { z } from 'zod';
import { readCliEnv, readJiraCliEnv } from '../config/cli-env';
import { openDatabase } from '../db/client';
import { DbIssueRepository } from '../db/repositories/issue-repository';
import { JiraHttp } from './jira-http';
import { buildSlaReport } from '@domain/jira/sla-report';
import { quarterLabel, quarterRange } from '@domain/jira/quarter';
import { recentQuarters } from '@domain/jira/report-period';
import { compareIssue, rawCompliance, type Comparison, type RawIssue } from './sample-compare';
import {
  chooseSample,
  SAMPLE_SIZE,
  type SampleCandidate,
  type SampleItem,
} from './sample-selection';

// Usage:  pnpm compare:jira          a varied sample of 30 tickets, with a sheet to check by eye
//         pnpm compare:jira --all    every ticket in the cache (a summary and the differences only)
// Reads the cache, picks the sample, reads those tickets from Jira (read only) and compares them
// field by field. Writes a sheet to .data/comparacion-muestra.md (ignored by git: it names tickets
// and people) and prints a summary. Reads DATABASE_URL and the JIRA_* settings from .env.

const OUTPUT = '.data/comparacion-muestra.md';
const ALL = process.argv.includes('--all');
/** Jira answers up to 100 tickets per request here. */
const CHUNK = 100;
const jira = readJiraCliEnv();
const now = new Date();

const answer = z.object({
  issues: z.array(z.object({ key: z.string(), fields: z.record(z.string(), z.unknown()) })),
});

const day = (date: Date | null): string =>
  date === null
    ? '—'
    : date.toLocaleString('es-CO', {
        timeZone: 'America/Bogota',
        dateStyle: 'medium',
        timeStyle: 'short',
      });

const OUTCOME_WORD = { met: 'cumplido', breached: 'incumplido', excluded: 'no cuenta' } as const;

function slaSummary(cycles: readonly SlaCycle[]): string {
  return SLA_METRICS.map((metric) => {
    const mine = cycles.filter((cycle) => cycle.metric === metric);
    const label = metric === 'first_response' ? '1ª respuesta' : 'Resolución';
    if (mine.length === 0) return `${label}: sin ciclo`;
    return `${label}: ${mine.map((cycle) => OUTCOME_WORD[cycleOutcome(cycle, now)]).join(' + ')}`;
  }).join('<br>');
}

async function readChunk(keys: readonly string[]): Promise<RawIssue[]> {
  const http = new JiraHttp({
    baseUrl: jira.JIRA_BASE_URL,
    email: jira.JIRA_EMAIL,
    apiToken: jira.JIRA_API_TOKEN,
  });
  const result = await http.request('POST', '/rest/api/3/search/jql', {
    jql: `key in (${keys.join(',')})`,
    maxResults: keys.length,
    fields: [
      'summary',
      'status',
      'issuetype',
      'assignee',
      'reporter',
      'created',
      'updated',
      'resolutiondate',
      'statuscategorychangedate',
      jira.JIRA_FIELD_SLA_RESPONSE,
      jira.JIRA_FIELD_SLA_DONE,
    ],
  });
  if (!result.ok) throw new Error(`Jira answered with an error: ${result.error.kind}`);
  return answer.parse(result.value).issues;
}

async function readFromJira(keys: readonly string[]): Promise<RawIssue[]> {
  const issues: RawIssue[] = [];
  for (let start = 0; start < keys.length; start += CHUNK) {
    issues.push(...(await readChunk(keys.slice(start, start + CHUNK))));
  }
  return issues;
}

const VERDICT_WORD = {
  match: '✔ Coincide',
  stale: '⚠ Cambió en Jira después',
  mismatch: '✖ NO coincide',
} as const;

const HEADER = [
  '| # | Ticket | Tipo | Estado | Responsable | Creado | Completado | Qué dice el Hub de los SLA | Por qué está en la muestra | Comprobación automática |',
  '| - | ------ | ---- | ------ | ----------- | ------ | ---------- | -------------------------- | -------------------------- | ----------------------- |',
];

function sheetRow(
  index: number,
  item: SampleItem,
  candidate: SampleCandidate | undefined,
  comparison: Comparison | undefined,
): string {
  const number = String(index + 1);
  if (!candidate) return `| ${number} | ${item.key} | (no está en el Hub) | | | | | | | |`;
  const { ticket, cycles } = candidate;
  const link = `[${item.key}](${new URL(`/browse/${item.key}`, jira.JIRA_BASE_URL).toString()})`;
  const verdict = comparison ? VERDICT_WORD[comparison.verdict] : '✖ No se encontró en Jira';
  const cells = [
    number,
    link,
    ticket.requestType,
    ticket.status,
    ticket.assigneeName ?? 'Sin asignar',
    day(ticket.createdAt),
    day(ticket.resolvedAt),
    slaSummary(cycles),
    item.reasons.join('; '),
    verdict,
  ];
  return `| ${cells.join(' | ')} |`;
}

function differencesBlock(comparisons: ReadonlyMap<string, Comparison>): string {
  const problems = [...comparisons.values()].filter((c) => c.differences.length > 0);
  if (problems.length === 0) {
    return 'Ninguna: todos los tickets coinciden con Jira en todos los campos comparados.';
  }
  return problems
    .map((c) => {
      const why =
        c.verdict === 'stale'
          ? 'cambió en Jira después de la última sincronización'
          : 'NO coincide';
      const lines = c.differences.map((d) => `- **${d.field}**: Hub = ${d.hub} · Jira = ${d.jira}`);
      return ['### ' + c.key + ' (' + why + ')', '', ...lines].join('\n');
    })
    .join('\n\n');
}

function sheet(
  items: readonly SampleItem[],
  candidates: ReadonlyMap<string, SampleCandidate>,
  comparisons: ReadonlyMap<string, Comparison>,
): string {
  const rows = items.map((item, index) =>
    sheetRow(index, item, candidates.get(item.key), comparisons.get(item.key)),
  );
  return [
    '# Comparación de una muestra de tickets contra Jira',
    '',
    `Generada el ${day(now)} (hora de Bogotá). Este archivo menciona tickets y personas: no se sube al repositorio.`,
    '',
    ...HEADER,
    ...rows,
    '',
    '## Diferencias',
    '',
    differencesBlock(comparisons),
    '',
  ].join('\n');
}

/** The Hub's quarterly SLA figures against a recount made straight from Jira's answers. */
function quarterlyAgreement(
  raw: readonly RawIssue[],
  tickets: Parameters<typeof buildSlaReport>[0]['tickets'],
  records: Parameters<typeof buildSlaReport>[0]['records'],
  fields: { firstResponse: string; done: string },
): { lines: string[]; disagreements: number } {
  const lines: string[] = [];
  let disagreements = 0;
  for (const quarter of recentQuarters(now)) {
    const range = quarterRange(quarter);
    const fromJira = rawCompliance(raw, fields, range, now);
    const hub = buildSlaReport({ tickets, records, range, buckets: [], now }).overall.metrics;
    for (const metric of hub) {
      const theirs = fromJira[metric.metric];
      const agree = theirs.met === metric.met && theirs.breached === metric.breached;
      if (!agree) disagreements += 1;
      const label = metric.metric === 'first_response' ? '1ª respuesta' : 'Resolución  ';
      lines.push(
        `${quarterLabel(quarter)} ${label}: Hub ${String(metric.met)} cumplidos / ${String(metric.breached)} incumplidos · Jira ${String(theirs.met)} / ${String(theirs.breached)} ${agree ? '✔' : '✖ NO COINCIDE'}`,
      );
    }
  }
  return { lines, disagreements };
}

const handle = await openDatabase(readCliEnv().DATABASE_URL);
try {
  const issues = new DbIssueRepository(handle.db);
  const [tickets, stored] = await Promise.all([issues.listTickets(), issues.listSlaCycles()]);
  const byKey = new Map<string, SampleCandidate>(
    tickets.map((ticket) => [ticket.key, { ticket, cycles: [] as SlaCycle[] }]),
  );
  for (const { ticketKey, cycle } of stored) {
    (byKey.get(ticketKey)?.cycles as SlaCycle[] | undefined)?.push(cycle);
  }
  const sample = ALL
    ? [...byKey.keys()].map((key) => ({ key, reasons: ['Todos los tickets'] }))
    : chooseSample([...byKey.values()], now);
  const raw = await readFromJira(sample.map((item) => item.key));
  const fields = { firstResponse: jira.JIRA_FIELD_SLA_RESPONSE, done: jira.JIRA_FIELD_SLA_DONE };

  const comparisons = new Map<string, Comparison>();
  for (const issue of raw) {
    const candidate = byKey.get(issue.key);
    if (candidate) comparisons.set(issue.key, compareIssue(issue, candidate, fields, now));
  }
  mkdirSync('.data', { recursive: true });
  // A table of every ticket would be unreadable: with --all the sheet keeps the differences only.
  writeFileSync(OUTPUT, sheet(ALL ? [] : sample, byKey, comparisons), 'utf8');

  const count = (verdict: Comparison['verdict']) =>
    [...comparisons.values()].filter((c) => c.verdict === verdict).length;
  const missing = sample.length - comparisons.size;
  console.warn(
    `${ALL ? 'All' : 'Sample of'} ${String(sample.length)}${ALL ? '' : `/${String(SAMPLE_SIZE)}`} tickets: ${String(count('match'))} match, ` +
      `${String(count('stale'))} changed in Jira since the last sync, ${String(count('mismatch'))} MISMATCH, ` +
      `${String(missing)} not found in Jira. Sheet: ${OUTPUT}`,
  );
  let recountFailed = false;
  if (ALL) {
    const agreement = quarterlyAgreement(raw, tickets, stored, fields);
    for (const line of agreement.lines) console.warn(line);
    recountFailed = agreement.disagreements > 0;
  }
  if (count('mismatch') > 0 || missing > 0 || recountFailed) process.exitCode = 1;
} finally {
  await handle.close();
}
