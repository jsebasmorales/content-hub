import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CsrfService } from '@infrastructure/auth/csrf';
import { createTestApp, type TestApp } from '../support/test-app';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.handle.close();
});

describe('database rate limiter', () => {
  const rule = { limit: 3, windowMs: 60_000 };

  it('allows up to the limit and then blocks with a retry time', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await t.app.rateLimiter.hit('ip:1.1.1.1:/login', rule)).allowed).toBe(true);
    }
    const blocked = await t.app.rateLimiter.hit('ip:1.1.1.1:/login', rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('counts each key separately', async () => {
    expect((await t.app.rateLimiter.hit('ip:2.2.2.2:/login', rule)).allowed).toBe(true);
  });

  it('starts a fresh count in the next window', async () => {
    t.clock.advance(61_000);
    expect((await t.app.rateLimiter.hit('ip:1.1.1.1:/login', rule)).allowed).toBe(true);
  });
});

describe('CsrfService', () => {
  const csrf = new CsrfService('a-long-enough-secret-for-the-tests-1234');

  it('accepts the token issued for the same session', () => {
    expect(csrf.verify('session-a', csrf.tokenFor('session-a'))).toBe(true);
  });

  it('rejects a token from another session or a forged one', () => {
    expect(csrf.verify('session-b', csrf.tokenFor('session-a'))).toBe(false);
    expect(csrf.verify('session-a', 'forged')).toBe(false);
    expect(csrf.verify('session-a', '')).toBe(false);
  });

  it('rejects tokens made with another secret', () => {
    const other = new CsrfService('a-different-secret-for-another-server-99');
    expect(csrf.verify('session-a', other.tokenFor('session-a'))).toBe(false);
  });
});
