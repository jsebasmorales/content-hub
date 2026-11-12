import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Compares two secrets without leaking, through timing, how much of them matched. Both sides are
 * hashed first, so strings of different length are compared in the same time and never throw.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}
