import { lt, sql } from 'drizzle-orm';
import type { RateLimiter, RateLimitResult, RateLimitRule } from '@application/ports/rate-limiter';
import type { Clock } from '@application/ports/services';
import type { Database } from '../client';
import { rateLimitBucket } from '../schema';

const CLEANUP_PROBABILITY = 0.02;
const KEEP_BUCKETS_MS = 24 * 60 * 60 * 1000;

/** Fixed-window counter stored in Postgres, so every serverless instance sees the same count. */
export class DbRateLimiter implements RateLimiter {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async hit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const nowMs = this.clock.now().getTime();
    const windowStartMs = Math.floor(nowMs / rule.windowMs) * rule.windowMs;
    const [row] = await this.db
      .insert(rateLimitBucket)
      .values({ key, windowStart: new Date(windowStartMs), hits: 1 })
      .onConflictDoUpdate({
        target: [rateLimitBucket.key, rateLimitBucket.windowStart],
        set: { hits: sql`${rateLimitBucket.hits} + 1` },
      })
      .returning({ hits: rateLimitBucket.hits });
    if (Math.random() < CLEANUP_PROBABILITY) await this.deleteOldBuckets(nowMs);
    return {
      allowed: (row?.hits ?? 1) <= rule.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + rule.windowMs - nowMs) / 1000)),
    };
  }

  private async deleteOldBuckets(nowMs: number): Promise<void> {
    await this.db
      .delete(rateLimitBucket)
      .where(lt(rateLimitBucket.windowStart, new Date(nowMs - KEEP_BUCKETS_MS)));
  }
}
