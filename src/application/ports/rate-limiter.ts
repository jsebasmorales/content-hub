export interface RateLimitRule {
  /** Maximum hits allowed inside one window. */
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

/** Counts hits per key, shared across server instances (SDD §11.2). */
export interface RateLimiter {
  hit(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
}
