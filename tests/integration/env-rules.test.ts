import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '@infrastructure/config/env-rules';

const valid = {
  DATABASE_URL: 'pglite:.data/test',
  SESSION_SECRET: 'x'.repeat(32),
  ALLOWED_EMAIL_DOMAIN: 'holafly.com',
  BOOTSTRAP_LEADER_EMAIL: 'lider@holafly.com',
  PUBLIC_APP_URL: 'http://localhost:4321',
  AUTH_PROVIDER: 'local',
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
    expect(problemsOf({ ...valid, JIRA_EMAIL: '' })).toEqual([]);
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

  it('never includes secret values in error messages', () => {
    const problems = problemsOf({ ...valid, SESSION_SECRET: 'super-secret-short' });
    expect(problems.join()).not.toContain('super-secret-short');
  });
});
