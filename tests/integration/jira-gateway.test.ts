import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slaCompliance } from '@domain/jira/sla-compliance';
import { OutboundNotAllowedError } from '@infrastructure/config/outbound-guard';
import { parseJiraDate } from '@infrastructure/jira/issue-mapper';
import { HttpJiraGateway, buildJql } from '@infrastructure/jira/jira-gateway';
import { JiraHttp } from '@infrastructure/jira/jira-http';

/**
 * The Jira client against recorded, anonymised responses and a scripted network. No real Jira,
 * no real waiting (SDD §13, contract tests).
 */

const BASE = 'https://example.atlassian.net';
const TOKEN = 'secret-token-value';
const EMAIL = 'service@example.com';
const SLA = { firstResponse: 'customfield_10062', done: 'customfield_10152' };

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/jira/search-page.json', import.meta.url), 'utf8'),
) as {
  issues: { key: string; fields: Record<string, unknown>; changelog: Record<string, unknown> }[];
};

type FixtureIssue = (typeof fixture.issues)[number];

/** A private copy of the first recorded ticket, safe to bend for a single test. */
function firstIssue(): FixtureIssue {
  const issue = fixture.issues[0];
  if (!issue) throw new Error('The fixture has no tickets');
  return structuredClone(issue);
}

type Step = Response | Error;
interface Call {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

const json = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), { status: 200, ...init });

/** A network that answers with the given steps in order and records every request. */
function scriptedNetwork(...steps: Step[]) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const queue = [...steps];
  const fetchFn = ((url: URL, init: RequestInit) => {
    calls.push({
      url: url.toString(),
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    });
    const step = queue.shift();
    if (step === undefined) throw new Error('The test network ran out of answers');
    return step instanceof Error ? Promise.reject(step) : Promise.resolve(step);
  }) as unknown as typeof fetch;
  const deps = {
    fetch: fetchFn,
    sleep: (ms: number): Promise<void> => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 1, // full backoff step, so waits are predictable
  };
  return { calls, sleeps, deps };
}

const gatewayOver = (network: ReturnType<typeof scriptedNetwork>) =>
  new HttpJiraGateway(
    { baseUrl: BASE, email: EMAIL, apiToken: TOKEN, projectKey: 'JSMCO', slaFields: SLA },
    network.deps,
  );

const firstPage = { updatedSince: null, pageToken: null };

describe('HttpJiraGateway.searchIssues: mapping a real-shaped response', () => {
  it('maps every ticket, person, history entry and SLA cycle', async () => {
    const network = scriptedNetwork(json({ issues: fixture.issues, nextPageToken: null }));
    const result = await gatewayOver(network).searchIssues(firstPage);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.issues).toHaveLength(5);
    expect(result.value.nextPageToken).toBeNull();
    const [first] = result.value.issues;
    expect(first?.ticket).toMatchObject({
      key: 'JSMCO-900',
      summary: 'Anonymized ticket 1',
      assigneeName: expect.stringMatching(/^Person /) as string,
      requesterName: expect.stringMatching(/^Person /) as string,
    });
    expect(first?.ticket.statusCategory).toMatch(/^(new|indeterminate|done)$/);
    // Every ticket has both SLA metrics, and transitions come out in time order.
    for (const { slaCycles, transitions } of result.value.issues) {
      expect(new Set(slaCycles.map((c) => c.metric))).toEqual(new Set(['first_response', 'done']));
      const times = transitions.map((t) => t.at.getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
    }
  });

  describe('when a ticket was finished', () => {
    /** The first recorded ticket, bent to the given status category and finish fields. */
    async function mapped(category: string, fields: Record<string, unknown>) {
      const issue = firstIssue();
      const status = issue.fields['status'] as { statusCategory: { key: string } };
      status.statusCategory.key = category;
      Object.assign(issue.fields, { resolutiondate: null }, fields);
      const network = scriptedNetwork(json({ issues: [issue], nextPageToken: null }));
      const result = await gatewayOver(network).searchIssues(firstPage);
      if (!result.ok) throw new Error('expected the ticket to be mapped');
      return { ticket: result.value.issues[0]?.ticket, network };
    }

    it('uses the moment it entered Done, because this workflow leaves Resolution empty', async () => {
      const { ticket } = await mapped('done', {
        statuscategorychangedate: '2026-11-12T09:31:04.295+0100',
      });
      expect(ticket?.resolvedAt).toEqual(new Date('2026-11-12T08:31:04.295Z'));
    });

    it('prefers the Resolution date when Jira does fill it', async () => {
      const { ticket } = await mapped('done', {
        resolutiondate: '2026-11-10T10:00:00.000+0000',
        statuscategorychangedate: '2026-11-12T09:31:04.295+0100',
      });
      expect(ticket?.resolvedAt).toEqual(new Date('2026-11-10T10:00:00.000Z'));
    });

    it('has no finish date for a ticket that is not done (reopened)', async () => {
      const { ticket } = await mapped('indeterminate', {
        resolutiondate: '2026-11-10T10:00:00.000+0000',
        statuscategorychangedate: '2026-11-12T09:31:04.295+0100',
      });
      expect(ticket?.resolvedAt).toBeNull();
    });

    it('asks Jira for the field', async () => {
      const { network } = await mapped('done', {});
      const body = network.calls[0]?.body as { fields: string[] };
      expect(body.fields).toContain('statuscategorychangedate');
    });
  });

  it('feeds the SLA rules without any further conversion', async () => {
    const network = scriptedNetwork(json({ issues: fixture.issues, nextPageToken: null }));
    const result = await gatewayOver(network).searchIssues(firstPage);
    if (!result.ok) throw new Error('expected success');
    const cycles = result.value.issues.flatMap((issue) => issue.slaCycles);
    const compliance = slaCompliance(cycles, new Date('2026-11-12T00:00:00Z'));
    expect(compliance.metrics.every((m) => m.total > 0)).toBe(true);
  });

  it('asks Jira only for what the Hub stores, authenticated, and nothing else', async () => {
    const network = scriptedNetwork(json({ issues: [], nextPageToken: null }));
    await gatewayOver(network).searchIssues({
      updatedSince: new Date('2026-11-01T00:00:00Z'),
      pageToken: 'next-1',
    });
    const [call] = network.calls;
    expect(call?.url).toBe(`${BASE}/rest/api/3/search/jql`);
    expect(call?.method).toBe('POST');
    expect(call?.headers['Authorization']).toBe(
      `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64')}`,
    );
    expect(call?.body).toMatchObject({
      jql: `project = "JSMCO" AND updated >= ${String(Date.parse('2026-11-01T00:00:00Z'))} ORDER BY updated ASC`,
      maxResults: 100,
      expand: 'changelog',
      nextPageToken: 'next-1',
    });
    const fields = (call?.body as { fields: string[] }).fields;
    expect(fields).toEqual(expect.arrayContaining(['summary', 'status', ...Object.values(SLA)]));
    // No description, comments, attachments or e-mail fields are requested.
    expect(fields).not.toEqual(expect.arrayContaining(['description']));
    expect(fields).not.toContain('comment');
    expect(JSON.stringify(call?.body)).not.toContain(TOKEN);
  });

  it('passes the continuation token on and reports the last page', async () => {
    const network = scriptedNetwork(
      json({ issues: [], nextPageToken: 'abc' }),
      json({ issues: [], nextPageToken: null }),
    );
    const gateway = gatewayOver(network);
    const first = await gateway.searchIssues(firstPage);
    expect(first.ok && first.value.nextPageToken).toBe('abc');
    const last = await gateway.searchIssues({ updatedSince: null, pageToken: 'abc' });
    expect(last.ok && last.value.nextPageToken).toBeNull();
  });
});

describe('HttpJiraGateway.searchIssues: tolerating how Jira really behaves', () => {
  const clone = () => firstIssue();
  const searchWith = async (issue: unknown) =>
    gatewayOver(scriptedNetwork(json({ issues: [issue], nextPageToken: null }))).searchIssues(
      firstPage,
    );

  it('treats an unknown status category as work in flight, never as done', async () => {
    const issue = clone();
    (issue.fields['status'] as { statusCategory: { key: string } }).statusCategory.key =
      'undefined';
    const result = await searchWith(issue);
    expect(result.ok && result.value.issues[0]?.ticket.statusCategory).toBe('indeterminate');
  });

  it('keeps a ticket whose assignee was deleted or who has no assignee', async () => {
    const issue = clone();
    issue.fields['assignee'] = null;
    issue.fields['reporter'] = { displayName: 'Former user' };
    const result = await searchWith(issue);
    expect(result.ok && result.value.issues[0]?.ticket).toMatchObject({
      assigneeId: null,
      assigneeName: null,
      requesterId: null,
      requesterName: 'Former user',
    });
  });

  it('accepts a ticket with no SLA data at all', async () => {
    const issue = clone();
    issue.fields[SLA.done] = null;
    issue.fields[SLA.firstResponse] = undefined;
    const result = await searchWith(issue);
    expect(result.ok && result.value.issues[0]?.slaCycles).toEqual([]);
  });

  it('reads an ongoing cycle with its paused flag', async () => {
    const issue = clone();
    issue.fields[SLA.done] = {
      completedCycles: [],
      ongoingCycle: {
        startTime: { epochMillis: 1_000 },
        breachTime: { epochMillis: 9_000 },
        breached: false,
        paused: true,
      },
    };
    const result = await searchWith(issue);
    const done = result.ok
      ? result.value.issues[0]?.slaCycles.filter((c) => c.metric === 'done')
      : [];
    expect(done).toEqual([
      {
        metric: 'done',
        state: 'ongoing',
        startedAt: new Date(1_000),
        stoppedAt: null,
        breachAt: new Date(9_000),
        breached: false,
        paused: true,
      },
    ]);
  });

  it('completes a history that Jira cut short using the history endpoint', async () => {
    const issue = clone();
    const embedded = issue.changelog['histories'] as unknown[];
    issue.changelog['total'] = embedded.length + 1;
    const extra = {
      id: '99',
      created: '2026-11-09T10:00:00.000+0100',
      items: [{ field: 'status', fromString: 'To Do', toString: 'In progress' }],
    };
    const network = scriptedNetwork(
      json({ issues: [issue], nextPageToken: null }),
      json({ values: [...embedded, extra], total: embedded.length + 1, startAt: 0 }),
    );
    const result = await gatewayOver(network).searchIssues(firstPage);
    expect(network.calls[1]?.method).toBe('GET');
    expect(network.calls[1]?.url).toBe(
      `${BASE}/rest/api/3/issue/${issue.key}/changelog?startAt=0&maxResults=100`,
    );
    const states = result.ok ? result.value.issues[0]?.transitions.map((t) => t.to) : [];
    expect(states).toContain('In progress');
  });
});

describe('HttpJiraGateway: errors', () => {
  it('rejects a response with an unexpected shape without echoing its content', async () => {
    const bad = { issues: [{ key: 'JSMCO-1', fields: { summary: 'Private words' } }] };
    const result = await gatewayOver(scriptedNetwork(json(bad))).searchIssues(firstPage);
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid_response' } });
    expect(JSON.stringify(result)).not.toContain('Private words');
  });

  it('rejects an SLA field with a broken shape and names the field, not its value', async () => {
    const issue = firstIssue();
    issue.fields[SLA.done] = { completedCycles: 'oops' };
    const result = await gatewayOver(
      scriptedNetwork(json({ issues: [issue], nextPageToken: null })),
    ).searchIssues(firstPage);
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid_response' } });
    expect(!result.ok && result.error.message).toContain(SLA.done);
  });

  it('rejects an unreadable date', async () => {
    const issue = firstIssue();
    issue.fields['updated'] = 'not a date';
    const result = await gatewayOver(
      scriptedNetwork(json({ issues: [issue], nextPageToken: null })),
    ).searchIssues(firstPage);
    expect(!result.ok && result.error.kind).toBe('invalid_response');
  });

  it('never leaks credentials in any error', async () => {
    const network = scriptedNetwork(new Response('denied', { status: 401 }));
    const result = await gatewayOver(network).searchIssues(firstPage);
    expect(result).toMatchObject({ ok: false, error: { kind: 'unauthorized' } });
    const text = JSON.stringify(result);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain('denied');
  });
});

describe('JiraHttp: retries, backoff and limits (SDD §6.4)', () => {
  const http = (network: ReturnType<typeof scriptedNetwork>, maxAttempts = 4) =>
    new JiraHttp(
      { baseUrl: BASE, email: EMAIL, apiToken: TOKEN },
      { ...network.deps, maxAttempts },
    );
  const get = (client: JiraHttp) => client.request('GET', '/rest/api/3/myself');

  it('waits for Retry-After on a 429, then succeeds', async () => {
    const network = scriptedNetwork(
      new Response('', { status: 429, headers: { 'Retry-After': '3' } }),
      json({ ok: true }),
    );
    expect(await get(http(network))).toEqual({ ok: true, value: { ok: true } });
    expect(network.sleeps).toEqual([3_000]);
  });

  it('gives up at once when Jira asks for a very long wait', async () => {
    const network = scriptedNetwork(
      new Response('', { status: 429, headers: { 'Retry-After': '600' } }),
    );
    const result = await get(http(network));
    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'rate_limited', retryAfterSeconds: 600 },
    });
    expect(network.sleeps).toEqual([]);
  });

  it('backs off exponentially on server errors and recovers', async () => {
    const network = scriptedNetwork(
      new Response('', { status: 503 }),
      new Response('', { status: 502 }),
      json({ fine: 1 }),
    );
    expect((await get(http(network))).ok).toBe(true);
    expect(network.sleeps).toEqual([500, 1_000]);
  });

  it('applies jitter between half and the full step', async () => {
    const network = scriptedNetwork(new Response('', { status: 500 }), json({}));
    const client = new JiraHttp(
      { baseUrl: BASE, email: EMAIL, apiToken: TOKEN },
      { ...network.deps, random: () => 0 },
    );
    await get(client);
    expect(network.sleeps).toEqual([250]);
  });

  it('stops after the maximum number of attempts', async () => {
    const network = scriptedNetwork(
      new Response('', { status: 500 }),
      new Response('', { status: 500 }),
      new Response('', { status: 500 }),
    );
    const result = await get(http(network, 3));
    expect(result).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
    expect(network.calls).toHaveLength(3);
    expect(network.sleeps).toHaveLength(2);
  });

  it('retries a network failure and then reports Jira as unavailable', async () => {
    const network = scriptedNetwork(new Error('socket hang up'), new Error('timeout'));
    const result = await get(http(network, 2));
    expect(result).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
    expect(JSON.stringify(result)).not.toContain('socket');
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [400, 'invalid_response'],
    [404, 'invalid_response'],
  ])('does not retry a %i', async (status, kind) => {
    const network = scriptedNetwork(new Response('', { status }));
    expect(await get(http(network))).toMatchObject({ ok: false, error: { kind } });
    expect(network.calls).toHaveLength(1);
    expect(network.sleeps).toEqual([]);
  });

  it('reports a body that is not JSON', async () => {
    const network = scriptedNetwork(new Response('<html>', { status: 200 }));
    expect(await get(http(network))).toMatchObject({
      ok: false,
      error: { kind: 'invalid_response' },
    });
  });

  it('can only reach the configured Jira site (SSRF guard)', async () => {
    const network = scriptedNetwork(json({}));
    await expect(
      http(network).request('GET', '@evil.example.com/rest/api/3/myself'),
    ).rejects.toThrow(OutboundNotAllowedError);
    expect(network.calls).toHaveLength(0);
  });
});

describe('HttpJiraGateway.listIssueKeys', () => {
  it('pages through every key asking for nothing else', async () => {
    const network = scriptedNetwork(
      json({ issues: [{ key: 'JSMCO-1' }, { key: 'JSMCO-2' }], nextPageToken: 't2' }),
      json({ issues: [{ key: 'JSMCO-3' }], nextPageToken: null }),
    );
    const result = await gatewayOver(network).listIssueKeys();
    expect(result).toEqual({ ok: true, value: ['JSMCO-1', 'JSMCO-2', 'JSMCO-3'] });
    expect(network.calls[0]?.body).toMatchObject({ fields: ['key'] });
    expect(network.calls[1]?.body).toMatchObject({ nextPageToken: 't2' });
  });

  it('passes a Jira failure through', async () => {
    const network = scriptedNetwork(new Response('', { status: 401 }));
    expect(await gatewayOver(network).listIssueKeys()).toMatchObject({
      ok: false,
      error: { kind: 'unauthorized' },
    });
  });
});

describe('buildJql and parseJiraDate', () => {
  it('uses epoch milliseconds so the time zone of the Jira account never matters', () => {
    expect(buildJql('JSMCO', new Date(1_700_000_000_123))).toBe(
      'project = "JSMCO" AND updated >= 1700000000123 ORDER BY updated ASC',
    );
    expect(buildJql('JSMCO', null)).toBe('project = "JSMCO" ORDER BY updated ASC');
  });

  it('cannot be broken out of by a quote in the project key', () => {
    expect(buildJql('A" OR 1=1 --', null)).toBe('project = "A OR 1=1 --" ORDER BY updated ASC');
  });

  it('reads the offset format Jira uses', () => {
    expect(parseJiraDate('2026-11-10T21:36:00.150+0100')?.toISOString()).toBe(
      '2026-11-10T20:36:00.150Z',
    );
    expect(parseJiraDate('2026-11-10T15:36:00.000-0500')?.toISOString()).toBe(
      '2026-11-10T20:36:00.000Z',
    );
    expect(parseJiraDate('nonsense')).toBeNull();
  });
});
