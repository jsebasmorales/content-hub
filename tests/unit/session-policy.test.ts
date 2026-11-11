import { describe, expect, it } from 'vitest';
import {
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  SESSION_TOUCH_INTERVAL_MS,
  evaluateSession,
  needsTouch,
  sessionExpiry,
} from '@domain/access/session-policy';
import { canSignIn } from '@domain/access/user';

const start = new Date('2026-01-15T10:00:00Z');
const after = (ms: number): Date => new Date(start.getTime() + ms);

describe('session lifetime (SDD §11.2)', () => {
  it('uses 12 hours absolute and 60 minutes idle', () => {
    expect(SESSION_ABSOLUTE_TTL_MS).toBe(12 * 60 * 60 * 1000);
    expect(SESSION_IDLE_TTL_MS).toBe(60 * 60 * 1000);
  });

  it('computes the absolute expiry from creation time', () => {
    expect(sessionExpiry(start).getTime()).toBe(start.getTime() + SESSION_ABSOLUTE_TTL_MS);
  });

  const session = { expiresAt: sessionExpiry(start), lastSeenAt: start };

  it('is valid while recent and before expiry', () => {
    expect(evaluateSession(session, after(SESSION_IDLE_TTL_MS - 1))).toBe('valid');
  });

  it('goes idle exactly at the idle limit', () => {
    expect(evaluateSession(session, after(SESSION_IDLE_TTL_MS))).toBe('idle');
  });

  it('expires at the absolute limit even if it was just used', () => {
    const active = { ...session, lastSeenAt: after(SESSION_ABSOLUTE_TTL_MS - 1000) };
    expect(evaluateSession(active, after(SESSION_ABSOLUTE_TTL_MS))).toBe('expired');
  });

  it('refreshes last-seen at most once per interval', () => {
    expect(needsTouch(session, after(SESSION_TOUCH_INTERVAL_MS - 1))).toBe(false);
    expect(needsTouch(session, after(SESSION_TOUCH_INTERVAL_MS))).toBe(true);
  });
});

describe('canSignIn', () => {
  it('lets invited and active users in', () => {
    expect(canSignIn({ status: 'invitado' })).toBe(true);
    expect(canSignIn({ status: 'activo' })).toBe(true);
  });

  it('keeps deactivated users out', () => {
    expect(canSignIn({ status: 'desactivado' })).toBe(false);
  });
});
