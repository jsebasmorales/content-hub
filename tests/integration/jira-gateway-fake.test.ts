import { describe, expect, it } from 'vitest';
import { FakeJiraGateway } from '@infrastructure/fakes/in-memory-jira';
import { at, snapshot } from '../support/jira-fixtures';

describe('FakeJiraGateway', () => {
  const issues = [
    snapshot('JSMCO-1', '2026-11-01T10:00:00Z'),
    snapshot('JSMCO-2', '2026-11-05T10:00:00Z'),
    snapshot('JSMCO-3', '2026-11-10T10:00:00Z'),
  ];

  it('pages through every ticket with a continuation token', async () => {
    const jira = new FakeJiraGateway(2);
    jira.setIssues(issues);
    const first = await jira.searchIssues({ updatedSince: null, pageToken: null });
    expect(first.ok && first.value.issues.map((i) => i.ticket.key)).toEqual(['JSMCO-1', 'JSMCO-2']);
    const token = first.ok ? first.value.nextPageToken : null;
    expect(token).not.toBeNull();
    const second = await jira.searchIssues({ updatedSince: null, pageToken: token });
    expect(second.ok && second.value.issues.map((i) => i.ticket.key)).toEqual(['JSMCO-3']);
    expect(second.ok && second.value.nextPageToken).toBeNull();
  });

  it('returns only tickets updated at or after the incremental bound', async () => {
    const jira = new FakeJiraGateway();
    jira.setIssues(issues);
    const result = await jira.searchIssues({
      updatedSince: at('2026-11-05T10:00:00Z'),
      pageToken: null,
    });
    expect(result.ok && result.value.issues.map((i) => i.ticket.key)).toEqual([
      'JSMCO-2',
      'JSMCO-3',
    ]);
  });

  it('fails once when told to, then recovers', async () => {
    const jira = new FakeJiraGateway();
    jira.setIssues(issues);
    jira.failNextCall({ kind: 'rate_limited', message: 'Slow down', retryAfterSeconds: 30 });
    const failed = await jira.searchIssues({ updatedSince: null, pageToken: null });
    expect(failed).toEqual({
      ok: false,
      error: { kind: 'rate_limited', message: 'Slow down', retryAfterSeconds: 30 },
    });
    expect((await jira.searchIssues({ updatedSince: null, pageToken: null })).ok).toBe(true);
  });

  it('rejects a malformed page token and lists every key', async () => {
    const jira = new FakeJiraGateway();
    jira.setIssues(issues);
    const bad = await jira.searchIssues({ updatedSince: null, pageToken: 'abc' });
    expect(!bad.ok && bad.error.kind).toBe('invalid_response');
    const keys = await jira.listIssueKeys();
    expect(keys.ok && keys.value).toEqual(['JSMCO-1', 'JSMCO-2', 'JSMCO-3']);
  });

  it('records what each search asked for', async () => {
    const jira = new FakeJiraGateway();
    await jira.searchIssues({ updatedSince: at('2026-11-05T10:00:00Z'), pageToken: null });
    expect(jira.searches).toEqual([{ updatedSince: at('2026-11-05T10:00:00Z'), pageToken: null }]);
  });
});
