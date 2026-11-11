import { createHash, randomBytes } from 'node:crypto';
import type { Clock, TokenService } from '@application/ports/services';

/** 256 bits of randomness; the database stores only the SHA-256 hash of the token. */
export class CryptoTokenService implements TokenService {
  issue(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
