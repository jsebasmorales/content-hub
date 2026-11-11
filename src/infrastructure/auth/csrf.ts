import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Anti-CSRF token bound to the session: HMAC(SESSION_SECRET, sessionId). Forms include it and
 * handlers verify it in constant time. It complements checkOrigin and SameSite=Lax (SDD §11.2).
 */
export class CsrfService {
  constructor(private readonly secret: string) {}

  tokenFor(sessionId: string): string {
    return createHmac('sha256', this.secret).update(`csrf:${sessionId}`).digest('base64url');
  }

  verify(sessionId: string, candidate: string): boolean {
    const expected = Buffer.from(this.tokenFor(sessionId));
    const received = Buffer.from(candidate);
    return expected.length === received.length && timingSafeEqual(expected, received);
  }
}
