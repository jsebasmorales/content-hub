/** Absolute session lifetime: 12 hours (SDD §11.2). */
export const SESSION_ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000;
/** Idle timeout: 60 minutes without activity (SDD §11.2). */
export const SESSION_IDLE_TTL_MS = 60 * 60 * 1000;
/** `last_seen_at` is refreshed at most this often to avoid a write on every request. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

export interface SessionTimes {
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
}

export type SessionState = 'valid' | 'expired' | 'idle';

export function sessionExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS);
}

export function evaluateSession(session: SessionTimes, now: Date): SessionState {
  if (now.getTime() >= session.expiresAt.getTime()) return 'expired';
  if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_IDLE_TTL_MS) return 'idle';
  return 'valid';
}

export function needsTouch(session: SessionTimes, now: Date): boolean {
  return now.getTime() - session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;
}
