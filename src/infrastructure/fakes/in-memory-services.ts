import type {
  AuthFailure,
  DirectAuthProvider,
  ExternalIdentity,
  RedirectAuthProvider,
  RedirectCallback,
  RedirectStart,
} from '@application/ports/auth-provider';
import type { RateLimiter, RateLimitResult, RateLimitRule } from '@application/ports/rate-limiter';
import type { AuditEntry, AuditLog, Clock, TokenService } from '@application/ports/services';
import { err, ok, type Result } from '@shared/result';

/** Clock that tests move forward by hand to exercise expiry rules. */
export class FakeClock implements Clock {
  constructor(private current = new Date('2026-01-15T10:00:00Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  /** Jumps to an exact moment, for tests that need a fixed starting point. */
  set(moment: Date): void {
    this.current = new Date(moment);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class InMemoryAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

/** Predictable tokens ("token-1", "token-2"...) with a reversible fake hash. */
export class SequentialTokenService implements TokenService {
  private counter = 0;

  issue(): { token: string; tokenHash: string } {
    this.counter += 1;
    const token = `token-${String(this.counter)}`;
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return `hash:${token}`;
  }
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();

  constructor(private readonly clock: Clock) {}

  hit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const nowMs = this.clock.now().getTime();
    const windowStartMs = Math.floor(nowMs / rule.windowMs) * rule.windowMs;
    const bucket = `${key}@${String(windowStartMs)}`;
    const hits = (this.counts.get(bucket) ?? 0) + 1;
    this.counts.set(bucket, hits);
    return Promise.resolve({
      allowed: hits <= rule.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + rule.windowMs - nowMs) / 1000)),
    });
  }
}

/** Direct provider that vouches for whatever email it receives. */
export class FakeDirectAuthProvider implements DirectAuthProvider {
  readonly kind = 'direct' as const;

  authenticate(email: string): Promise<Result<ExternalIdentity, AuthFailure>> {
    return Promise.resolve(email.trim() ? ok({ email, name: null }) : err('invalid-credentials'));
  }
}

/** Redirect provider with a scripted outcome, for flows that need no network. */
export class FakeRedirectAuthProvider implements RedirectAuthProvider {
  readonly kind = 'redirect' as const;

  constructor(private outcome: Result<ExternalIdentity, AuthFailure>) {}

  setOutcome(outcome: Result<ExternalIdentity, AuthFailure>): void {
    this.outcome = outcome;
  }

  begin(): RedirectStart {
    return {
      authorizationUrl: 'https://auth.example.test/authorize?state=fake-state',
      state: 'fake-state',
      codeVerifier: 'fake-verifier',
    };
  }

  complete(input: RedirectCallback): Promise<Result<ExternalIdentity, AuthFailure>> {
    return Promise.resolve(input.code ? this.outcome : err('invalid-credentials'));
  }
}
