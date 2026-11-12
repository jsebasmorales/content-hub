import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '@infrastructure/config/env-rules';

const valid = {
  DATABASE_URL: 'pglite:.data/test',
  SESSION_SECRET: 'x'.repeat(32),
  ALLOWED_EMAIL_DOMAIN: 'holafly.com',
  BOOTSTRAP_LEADER_EMAIL: 'lider@holafly.com',
  PUBLIC_APP_URL: 'http://localhost:4321',
  AUTH_PROVIDER: 'local',
  JIRA_BASE_URL: 'https://example.atlassian.net',
  JIRA_EMAIL: 'bot@holafly.com',
  JIRA_API_TOKEN: 'token-value',
  JIRA_PROJECT_KEY: 'JSMCO',
  SYNC_TRIGGER_SECRET: 's'.repeat(32),
};
const dev = { isProduction: false };
const prod = { isProduction: true };

function problemsOf(raw: Record<string, unknown>, context = dev): readonly string[] {
  try {
    parseEnv(raw, context);
  } catch (error) {
    if (error instanceof EnvError) return error.problems;
    throw error;
  }
  return [];
}

describe('parseEnv', () => {
  it('accepts the minimal valid configuration', () => {
    expect(problemsOf(valid)).toEqual([]);
  });

  it.each(Object.keys(valid))('fails when required %s is missing', (key) => {
    const rest = Object.fromEntries(Object.entries(valid).filter(([name]) => name !== key));
    expect(problemsOf(rest).some((p) => p.startsWith(key))).toBe(true);
  });

  it('treats empty values as not set', () => {
    expect(problemsOf({ ...valid, CROWDIN_TOKEN: '' })).toEqual([]);
    expect(problemsOf({ ...valid, SESSION_SECRET: '' }).length).toBeGreaterThan(0);
  });

  it('rejects a short session secret', () => {
    expect(problemsOf({ ...valid, SESSION_SECRET: 'short' })).not.toEqual([]);
  });

  it('rejects a bootstrap leader outside the allowed domain', () => {
    const problems = problemsOf({ ...valid, BOOTSTRAP_LEADER_EMAIL: 'x@gmail.com' });
    expect(problems.join()).toContain('BOOTSTRAP_LEADER_EMAIL');
  });

  it('forbids the local auth provider in production', () => {
    expect(problemsOf(valid, prod).join()).toContain('"local" is forbidden in production');
  });

  it('requires Atlassian settings when AUTH_PROVIDER=atlassian', () => {
    const problems = problemsOf(
      {
        ...valid,
        AUTH_PROVIDER: 'atlassian',
        DATABASE_URL: 'postgres://u:p@db.example.com/app?sslmode=require',
      },
      prod,
    );
    expect(problems).toHaveLength(3);
  });

  describe('production database', () => {
    const prodAtlassian = {
      ...valid,
      AUTH_PROVIDER: 'atlassian',
      ATLASSIAN_CLIENT_ID: 'id',
      ATLASSIAN_CLIENT_SECRET: 'secret',
      ATLASSIAN_REDIRECT_URI: 'https://hub.example.com/api/auth/callback',
    };
    const withDb = (DATABASE_URL: string) => problemsOf({ ...prodAtlassian, DATABASE_URL }, prod);

    it('forbids the embedded database', () => {
      expect(withDb('pglite:.data/dev').join()).toContain('embedded database is forbidden');
    });

    it('requires TLS for remote Postgres', () => {
      expect(withDb('postgres://u:p@db.example.com/app').join()).toContain('sslmode=require');
      expect(withDb('postgres://u:p@db.example.com/app?sslmode=disable').join()).toContain(
        'sslmode',
      );
    });

    it('accepts encrypted remote Postgres and a local one', () => {
      expect(withDb('postgres://u:p@db.example.com/app?sslmode=require')).toEqual([]);
      expect(withDb('postgres://u:p@localhost:5432/app')).toEqual([]);
    });
  });

  describe('Jira (required since Phase 1)', () => {
    it.each([
      'http://example.atlassian.net',
      'https://example.com',
      'https://example.atlassian.net.evil.com',
      'https://example.atlassian.net/jira',
      'https://example.atlassian.net/?x=1',
      'not a url',
    ])('rejects JIRA_BASE_URL %s', (JIRA_BASE_URL) => {
      expect(problemsOf({ ...valid, JIRA_BASE_URL }).join()).toContain('JIRA_BASE_URL');
    });

    it.each(['jsmco', 'J', 'JSM-CO', 'TOOLONGKEY123'])('rejects JIRA_PROJECT_KEY %s', (key) => {
      expect(problemsOf({ ...valid, JIRA_PROJECT_KEY: key }).join()).toContain('JIRA_PROJECT_KEY');
    });

    it('rejects a malformed service account email', () => {
      expect(problemsOf({ ...valid, JIRA_EMAIL: 'not-an-email' }).join()).toContain('JIRA_EMAIL');
    });

    it('defaults the SLA field ids and validates overrides', () => {
      const parsed = parseEnv(valid, dev);
      expect(parsed.JIRA_FIELD_SLA_RESPONSE).toBe('customfield_10062');
      expect(parsed.JIRA_FIELD_SLA_DONE).toBe('customfield_10152');
      expect(
        parseEnv({ ...valid, JIRA_FIELD_SLA_DONE: 'customfield_1' }, dev).JIRA_FIELD_SLA_DONE,
      ).toBe('customfield_1');
      expect(problemsOf({ ...valid, JIRA_FIELD_SLA_DONE: 'summary' }).join()).toContain(
        'JIRA_FIELD_SLA_DONE',
      );
    });
  });

  it('never includes secret values in error messages', () => {
    const problems = problemsOf({ ...valid, SESSION_SECRET: 'super-secret-short' });
    expect(problems.join()).not.toContain('super-secret-short');
  });

  it('does not leak the Jira token in error messages', () => {
    const problems = problemsOf({ ...valid, JIRA_BASE_URL: 'http://x.example.com' });
    expect(problems.join()).not.toContain('token-value');
  });
});
