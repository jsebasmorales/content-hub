import type { RateLimiter } from '@application/ports/rate-limiter';
import type { AuditLog } from '@application/ports/services';
import { logEvent } from '@shared/log';

/** Denied-access audit entries allowed per subject and route each minute (D-023). */
export const DENIED_AUDIT_RULE = { limit: 5, windowMs: 60_000 } as const;

export interface DeniedAttempt {
  readonly routePattern: string;
  readonly userId: string | null;
  /** The middleware reports 'unknown' when the platform gives no client address. */
  readonly ip: string;
}

/**
 * Logs a hidden-route attempt. The audit log is append-only and kept for a year, so a looping
 * client must not be able to fill it: past the cap the response is still a 404, only the
 * audit row is skipped (the structured log line stays).
 *
 * The budget belongs to the user when signed in, otherwise to the IP. Anonymous requests with an
 * unknown IP share one budget per route on purpose: the cap protects the table, and Netlify
 * always supplies the client address, so that bucket is not reachable in production.
 */
export async function recordDeniedAttempt(
  deps: { readonly rateLimiter: RateLimiter; readonly audit: AuditLog },
  attempt: DeniedAttempt,
): Promise<void> {
  const { routePattern, userId, ip } = attempt;
  logEvent('warn', 'authz.hidden', { route: routePattern, userId });
  const subject = userId ? `user:${userId}` : `ip:${ip}`;
  const budget = await deps.rateLimiter.hit(`denied:${subject}:${routePattern}`, DENIED_AUDIT_RULE);
  if (!budget.allowed) return;
  await deps.audit.record({
    actorId: userId,
    action: 'authz.denied',
    targetType: 'route',
    targetId: routePattern,
    ip,
  });
}
