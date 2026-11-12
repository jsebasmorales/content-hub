// Builds the committed Jira test fixtures from the private probe output (docs/jira-mapping.md).
//
// Usage:  pnpm probe:jira && node scripts/anonymize-jira-fixtures.mjs
//
// Input  (never committed): .data/jira-probe/search-sample.json  (real tenant responses)
// Output (committed):       tests/fixtures/jira/search-page.json (same structure, invented people)
//
// Only the fields the Hub requests are kept. People, ticket text, e-mails, avatars and links are
// replaced or dropped, and a final audit fails the script if any original personal string survived.
/* eslint-disable no-console -- CLI report script: printing is its purpose. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const INPUT = '.data/jira-probe/search-sample.json';
const OUTPUT = 'tests/fixtures/jira/search-page.json';
const KEPT_FIELDS = [
  'summary',
  'status',
  'issuetype',
  'priority',
  'assignee',
  'reporter',
  'created',
  'updated',
  'resolutiondate',
  'customfield_10062',
  'customfield_10152',
];

// Operational script outside src/: reading the shell/.env value is intended.
// eslint-disable-next-line no-restricted-properties
const SITE_URL = process.env.JIRA_BASE_URL;
const source = JSON.parse(readFileSync(INPUT, 'utf8'));

const names = new Map();
const accounts = new Map();
const stable = (map, original, make) => {
  if (!map.has(original)) map.set(original, make(map.size + 1));
  return map.get(original);
};
const toPerson = (user) =>
  user
    ? {
        accountId: stable(accounts, user.accountId, (n) => `acc-fixture-${String(n)}`),
        displayName: stable(
          names,
          user.displayName,
          (n) => `Person ${String.fromCharCode(64 + n)}`,
        ),
        accountType: 'atlassian',
      }
    : null;

/** Drops everything that can identify a person or the site from an SLA cycle or any nested value. */
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value === null || typeof value !== 'object') return value;
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    if (
      [
        'self',
        'href',
        '_links',
        'avatarUrls',
        'iconUrl',
        'emailAddress',
        'author',
        'timeZone',
      ].includes(key)
    ) {
      continue;
    }
    out[key] = clean(inner);
  }
  return out;
}

function anonymizeIssue(issue, index) {
  const fields = {};
  for (const name of KEPT_FIELDS) {
    const raw = issue.fields[name];
    if (name === 'assignee' || name === 'reporter') fields[name] = toPerson(raw);
    else if (name === 'summary') fields[name] = `Anonymized ticket ${String(index + 1)}`;
    else fields[name] = clean(raw ?? null);
  }
  const histories = (issue.changelog?.histories ?? []).map((history, i) => ({
    id: String(i + 1),
    created: history.created,
    // Only status changes matter to the Hub; any other change keeps its field name, never its text.
    items: history.items.map((item) =>
      item.field === 'status'
        ? { field: 'status', fromString: item.fromString, toString: item.toString }
        : { field: item.field, fromString: null, toString: null },
    ),
  }));
  return {
    id: String(10_000 + index),
    key: `JSMCO-${String(900 + index)}`,
    fields,
    changelog: { startAt: 0, maxResults: 100, total: histories.length, histories },
  };
}

const output = { issues: source.issues.map(anonymizeIssue), nextPageToken: null };
const text = `${JSON.stringify(output, null, 2)}\n`;

// Audit: nothing personal from the originals may appear in what we are about to commit.
const sensitive = new Map(); // value -> what kind of data it is (printed instead of the value)
const collect = (value) => {
  if (Array.isArray(value)) return value.forEach(collect);
  if (value === null || typeof value !== 'object') return;
  for (const [key, inner] of Object.entries(value)) {
    if (['displayName', 'accountId', 'emailAddress'].includes(key) && typeof inner === 'string') {
      sensitive.set(inner, key);
    } else if (key === 'summary' && typeof inner === 'string') sensitive.set(inner, key);
    else collect(inner);
  }
};
collect(source);
for (const issue of source.issues) sensitive.set(issue.key, 'issue key');
sensitive.set(new URL(SITE_URL ?? 'https://invalid.example').hostname.split('.')[0], 'site name');

const leaks = [...sensitive].filter(([value]) => value.length > 3 && text.includes(value));
if (leaks.length > 0) {
  console.error(
    `Refusing to write: ${String(leaks.length)} original value(s) leaked. Kinds: ${leaks.map(([, kind]) => kind).join(', ')}`,
  );
  process.exit(1);
}

// Second, independent check: whatever the originals were, no link or e-mail may remain.
if (/https?:\/\/|@/.test(text)) {
  console.error('Refusing to write: the fixture still contains a link or an e-mail address.');
  process.exit(1);
}

mkdirSync('tests/fixtures/jira', { recursive: true });
writeFileSync(OUTPUT, text);
console.log(
  `Wrote ${OUTPUT}: ${String(output.issues.length)} issues, audit checked ${String(sensitive.size)} strings.`,
);
