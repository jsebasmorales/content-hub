import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditEntry, AuditLog } from '@application/ports/services';
import {
  DENIED_AUDIT_RULE,
  recordDeniedAttempt,
} from '../../src/presentation/security/denied-audit';
import { APP_KINDS, createTestApp, type TestApp } from '../support/test-app';

class SpyAudit implements AuditLog {
  readonly entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

for (const kind of APP_KINDS) {
  describe(`denied-access audit cap, ${kind} (D-023)`, () => {
    let t: TestApp;

    beforeAll(async () => {
      t = await createTestApp(kind);
    });

    afterAll(async () => {
      await t.close();
    });

    const attempt = (userId: string | null, ip = '9.9.9.9', route = '/admin/users') => ({
      routePattern: route,
      userId,
      ip,
    });

    it('writes at most the cap of audit rows per user and route each minute', async () => {
      const audit = new SpyAudit();
      for (let i = 0; i < DENIED_AUDIT_RULE.limit + 3; i++) {
        await recordDeniedAttempt({ rateLimiter: t.app.rateLimiter, audit }, attempt('user-a'));
      }
      expect(audit.entries).toHaveLength(DENIED_AUDIT_RULE.limit);
      expect(audit.entries[0]).toMatchObject({
        actorId: 'user-a',
        action: 'authz.denied',
        targetId: '/admin/users',
      });
    });

    it('gives every user, IP and route its own budget', async () => {
      const audit = new SpyAudit();
      const deps = { rateLimiter: t.app.rateLimiter, audit };
      for (let i = 0; i < DENIED_AUDIT_RULE.limit + 2; i++) {
        await recordDeniedAttempt(deps, attempt('user-b'));
      }
      await recordDeniedAttempt(deps, attempt('user-c'));
      await recordDeniedAttempt(deps, attempt('user-b', '9.9.9.9', '/admin/roles'));
      await recordDeniedAttempt(deps, attempt(null, '8.8.8.8'));
      expect(audit.entries).toHaveLength(DENIED_AUDIT_RULE.limit + 3);
      expect(audit.entries.at(-1)).toMatchObject({ actorId: null, ip: '8.8.8.8' });
    });

    it('lets anonymous callers with an unknown IP share one budget per route', async () => {
      const audit = new SpyAudit();
      for (let i = 0; i < DENIED_AUDIT_RULE.limit + 2; i++) {
        await recordDeniedAttempt(
          { rateLimiter: t.app.rateLimiter, audit },
          attempt(null, 'unknown', '/admin/audit'),
        );
      }
      expect(audit.entries).toHaveLength(DENIED_AUDIT_RULE.limit);
    });

    it('records again once the window has passed', async () => {
      const audit = new SpyAudit();
      const deps = { rateLimiter: t.app.rateLimiter, audit };
      for (let i = 0; i < DENIED_AUDIT_RULE.limit + 1; i++) {
        await recordDeniedAttempt(deps, attempt('user-d'));
      }
      t.clock.advance(DENIED_AUDIT_RULE.windowMs + 1_000);
      await recordDeniedAttempt(deps, attempt('user-d'));
      expect(audit.entries).toHaveLength(DENIED_AUDIT_RULE.limit + 1);
    });
  });
}
