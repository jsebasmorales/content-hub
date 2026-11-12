import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncInput, SyncResult } from '@application/use-cases/jira/run-jira-sync';
import { safeEqual } from '@infrastructure/auth/constant-time';
import { EnvError } from '@infrastructure/config/env-rules';
import { readFunctionEnv } from '@infrastructure/config/function-env';
import { HttpSyncLauncher, SyncLaunchError } from '@infrastructure/netlify/http-sync-launcher';
import { InlineSyncLauncher } from '@infrastructure/netlify/inline-sync-launcher';
import { SYNC_FUNCTION_PATH, SYNC_SECRET_HEADER } from '@infrastructure/netlify/sync-contract';
import {
  createSyncHandler,
  type SyncFunctionEvent,
} from '@infrastructure/netlify/sync-jira-handler';
import { snapshot } from '../support/jira-fixtures';
import { createSyncHarness } from '../support/jira-sync-harness';

/**
 * The background sync function and the code that calls it (D-048): who may start a sync, what a
 * request may contain, and that the caller and the function agree on the contract.
 */

const SECRET = 'a-long-shared-secret-for-the-sync-function-0123456789';
const SITE = 'https://hub.example.com';

describe('safeEqual', () => {
  it('compares secrets of any length without throwing', () => {
    expect(safeEqual('same-secret', 'same-secret')).toBe(true);
    expect(safeEqual('same-secret', 'same-secreT')).toBe(false);
    expect(safeEqual('short', 'a-much-longer-value')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('createSyncHandler', () => {
  const executed: SyncInput[] = [];
  let logs: string[] = [];

  const handler = (result: SyncResult = { status: 'busy' }) =>
    createSyncHandler({
      secret: SECRET,
      execute: (input) => {
        executed.push(input);
        return Promise.resolve(result);
      },
    });
  const event = (overrides: Partial<SyncFunctionEvent> = {}): SyncFunctionEvent => ({
    httpMethod: 'POST',
    headers: { [SYNC_SECRET_HEADER]: SECRET },
    body: JSON.stringify({ kind: 'manual', mode: 'incremental' }),
    ...overrides,
  });

  beforeEach(() => {
    executed.length = 0;
    logs = [];
    vi.spyOn(console, 'warn').mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['no secret', { headers: {} }],
    ['a wrong secret', { headers: { [SYNC_SECRET_HEADER]: 'x'.repeat(SECRET.length) } }],
    ['a secret of another length', { headers: { [SYNC_SECRET_HEADER]: 'short' } }],
    ['an empty secret', { headers: { [SYNC_SECRET_HEADER]: '' } }],
    ['a GET even with the right secret', { httpMethod: 'GET' }],
    ['a PUT even with the right secret', { httpMethod: 'PUT' }],
  ])('answers an empty 404 and runs nothing for %s', async (_label, overrides) => {
    const response = await handler()(event(overrides));
    expect(response).toEqual({ statusCode: 404, body: '' });
    expect(executed).toEqual([]);
  });

  it.each([
    ['broken JSON', '{"kind":'],
    ['an empty body', ''],
    ['an unknown kind', JSON.stringify({ kind: 'hack', mode: 'full' })],
    ['an unknown mode', JSON.stringify({ kind: 'manual', mode: 'everything' })],
    ['extra options', JSON.stringify({ kind: 'manual', mode: 'full', dryRun: false })],
    ['a missing field', JSON.stringify({ kind: 'manual' })],
    ['an oversized body', JSON.stringify({ kind: 'manual', mode: 'full', pad: 'x'.repeat(2_000) })],
  ])('rejects %s with a 400 once authenticated', async (_label, body) => {
    expect(await handler()(event({ body }))).toEqual({ statusCode: 400, body: '' });
    expect(executed).toEqual([]);
  });

  it('treats a missing body as empty', async () => {
    expect((await handler()(event({ body: null }))).statusCode).toBe(400);
  });

  it.each(['manual', 'lazy', 'scheduled'] as const)(
    'runs a %s sync exactly as asked',
    async (kind) => {
      const response = await handler({ status: 'succeeded', items: 3, deleted: 0, dryRun: false })(
        event({ body: JSON.stringify({ kind, mode: 'full' }) }),
      );
      expect(response).toEqual({ statusCode: 202, body: '{"status":"succeeded"}' });
      // Only kind and mode reach the sync: a caller cannot ask for a dry run or anything else.
      expect(executed).toEqual([{ kind, mode: 'full' }]);
    },
  );

  it('reports a busy sync without failing', async () => {
    const response = await handler({ status: 'busy' })(event());
    expect(response).toEqual({ statusCode: 202, body: '{"status":"busy"}' });
  });

  it('never writes the secret, or what was presented, to the logs', async () => {
    const presented = 'wrong-secret-that-someone-tried';
    await handler()(event({ headers: { [SYNC_SECRET_HEADER]: presented } }));
    await handler()(event());
    const all = logs.join('\n');
    expect(all).toContain('sync.function_rejected');
    expect(all).toContain('sync.function_finished');
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain(presented);
  });
});

describe('HttpSyncLauncher', () => {
  const recorded: { url: string; init: RequestInit }[] = [];
  const network = (answer: Response | Error) =>
    ((url: URL, init: RequestInit) => {
      recorded.push({ url: url.toString(), init });
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    }) as unknown as typeof fetch;

  beforeEach(() => {
    recorded.length = 0;
  });

  it('calls the background function of its own site with the secret and the request', async () => {
    const launcher = new HttpSyncLauncher(
      { baseUrl: SITE, secret: SECRET },
      { fetch: network(new Response('', { status: 202 })) },
    );
    await launcher.launch('lazy', 'incremental');

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.url).toBe(`${SITE}${SYNC_FUNCTION_PATH}`);
    expect(recorded[0]?.init.method).toBe('POST');
    expect(recorded[0]?.init.headers).toMatchObject({ [SYNC_SECRET_HEADER]: SECRET });
    const body = recorded[0]?.init.body;
    expect(typeof body === 'string' ? (JSON.parse(body) as unknown) : null).toEqual({
      kind: 'lazy',
      mode: 'incremental',
    });
  });

  it('uses only the origin of the site, whatever path the address carries', async () => {
    const launcher = new HttpSyncLauncher(
      { baseUrl: `${SITE}/some/path?x=1`, secret: SECRET },
      { fetch: network(new Response('', { status: 202 })) },
    );
    await launcher.launch('manual', 'incremental');
    expect(recorded[0]?.url).toBe(`${SITE}${SYNC_FUNCTION_PATH}`);
  });

  it.each([404, 500, 502])('fails when the function answers %i', async (status) => {
    const launcher = new HttpSyncLauncher(
      { baseUrl: SITE, secret: SECRET },
      { fetch: network(new Response('internal details', { status })) },
    );
    const failure = await launcher.launch('manual', 'incremental').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SyncLaunchError);
    expect(String(failure)).not.toContain(SECRET);
    expect(String(failure)).not.toContain('internal details');
  });

  it('fails clearly, without leaking anything, when the network does', async () => {
    const launcher = new HttpSyncLauncher(
      { baseUrl: SITE, secret: SECRET },
      { fetch: network(new Error(`socket closed while sending ${SECRET}`)) },
    );
    const failure = await launcher.launch('manual', 'incremental').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SyncLaunchError);
    expect(String(failure)).not.toContain(SECRET);
  });
});

describe('the launcher and the function agree (end to end, no network)', () => {
  it('a launched sync reaches the function, passes authentication and records a run', async () => {
    const t = await createSyncHarness('in-memory fakes');
    t.jira.setIssues([
      snapshot('JSMCO-1', '2026-11-10T10:00:00Z'),
      snapshot('JSMCO-2', '2026-11-10T11:00:00Z'),
    ]);

    // The function, built from the same pieces as production but over the in-memory sync.
    const handle = createSyncHandler({
      secret: SECRET,
      execute: (input) => t.app.runSync.execute(input),
    });
    // A "network" that hands the launcher's request to the function, as Netlify would.
    const toFunction = (async (url: URL, init: RequestInit) => {
      expect(new URL(url).pathname).toBe(SYNC_FUNCTION_PATH);
      const headers = Object.fromEntries(
        Object.entries(init.headers as Record<string, string>).map(([k, v]) => [
          k.toLowerCase(),
          v,
        ]),
      );
      const reply = await handle({
        httpMethod: String(init.method),
        headers,
        body: typeof init.body === 'string' ? init.body : null,
      });
      return new Response(reply.body, { status: reply.statusCode });
    }) as unknown as typeof fetch;

    await new HttpSyncLauncher({ baseUrl: SITE, secret: SECRET }, { fetch: toFunction }).launch(
      'manual',
      'incremental',
    );

    expect(await t.app.issues.listKeys()).toEqual(['JSMCO-1', 'JSMCO-2']);
    expect(await t.app.runs.latestSucceeded()).toMatchObject({ kind: 'manual', items: 2 });
  });

  it('a launcher with the wrong secret changes nothing', async () => {
    const t = await createSyncHarness('in-memory fakes');
    t.jira.setIssues([snapshot('JSMCO-1', '2026-11-10T10:00:00Z')]);
    const handle = createSyncHandler({ secret: SECRET, execute: (i) => t.app.runSync.execute(i) });
    const toFunction = (async (_url: URL, init: RequestInit) => {
      const reply = await handle({
        httpMethod: String(init.method),
        headers: init.headers as Record<string, string>,
        body: typeof init.body === 'string' ? init.body : null,
      });
      return new Response(reply.body, { status: reply.statusCode });
    }) as unknown as typeof fetch;

    const failure = await new HttpSyncLauncher(
      { baseUrl: SITE, secret: 'not-the-right-secret-but-long-enough-to-pass' },
      { fetch: toFunction },
    )
      .launch('manual', 'incremental')
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SyncLaunchError);
    expect(await t.app.issues.listKeys()).toEqual([]);
    expect(await t.app.runs.latest()).toBeNull();
  });
});

describe('InlineSyncLauncher (local development)', () => {
  it('starts the sync without making the caller wait for it', async () => {
    let finish: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const started: SyncInput[] = [];
    const launcher = new InlineSyncLauncher(
      () =>
        ({
          execute: async (input: SyncInput) => {
            started.push(input);
            await gate;
            return { status: 'busy' } as const;
          },
        }) as never,
    );
    await launcher.launch('manual', 'incremental'); // returns while the sync is still waiting
    expect(started).toEqual([{ kind: 'manual', mode: 'incremental' }]);
    finish();
  });

  it('swallows a failure of the background sync instead of crashing the server', async () => {
    const launcher = new InlineSyncLauncher(
      () => ({ execute: () => Promise.reject(new Error('boom')) }) as never,
    );
    await expect(launcher.launch('lazy', 'incremental')).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});

describe('readFunctionEnv', () => {
  const valid = {
    DATABASE_URL: 'postgres://user:pass@db.example.com/app?sslmode=require',
    SYNC_TRIGGER_SECRET: SECRET,
    JIRA_BASE_URL: 'https://example.atlassian.net',
    JIRA_EMAIL: 'bot@example.com',
    JIRA_API_TOKEN: 'token-value',
    JIRA_PROJECT_KEY: 'JSMCO',
  };

  it('reads what the function needs, with the default SLA field ids', () => {
    const env = readFunctionEnv(valid);
    expect(env.databaseUrl).toBe(valid.DATABASE_URL);
    expect(env.secret).toBe(SECRET);
    expect(env.jira.JIRA_FIELD_SLA_DONE).toBe('customfield_10152');
  });

  it.each(['DATABASE_URL', 'SYNC_TRIGGER_SECRET', 'JIRA_API_TOKEN', 'JIRA_PROJECT_KEY'])(
    'names %s when it is missing',
    (key) => {
      const rest = Object.fromEntries(Object.entries(valid).filter(([name]) => name !== key));
      expect(() => readFunctionEnv(rest)).toThrow(EnvError);
      expect(() => readFunctionEnv(rest)).toThrow(key);
    },
  );

  it('rejects a short secret without echoing it', () => {
    const attempt = () => readFunctionEnv({ ...valid, SYNC_TRIGGER_SECRET: 'too-short-secret' });
    expect(attempt).toThrow('SYNC_TRIGGER_SECRET');
    expect(attempt).not.toThrow('too-short-secret');
  });
});
