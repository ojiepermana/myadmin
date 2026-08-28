export interface RateLimiterOptions {
  readonly limit?: number;
  readonly windowMs?: number;
  readonly now?: () => number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
  blockedUntil: number;
  blocks: number;
}

/** Small process-local limiter for public pre-authentication endpoints. */
export class InMemoryRateLimiter {
  public readonly limit: number;
  public readonly windowMs: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, Bucket>();

  public constructor(options: RateLimiterOptions = {}) {
    this.limit = options.limit ?? 5;
    this.windowMs = options.windowMs ?? 60_000;
    this.now = options.now ?? Date.now;

    if (!Number.isInteger(this.limit) || this.limit < 1) {
      throw new RangeError('Rate limiter limit must be a positive integer');
    }
    if (!Number.isInteger(this.windowMs) || this.windowMs < 1) {
      throw new RangeError('Rate limiter window must be a positive integer');
    }
  }

  public consume(key: string): RateLimitResult {
    const timestamp = this.now();
    const current = this.buckets.get(key);
    const bucket =
      !current || timestamp >= current.resetAt
        ? {
            count: 0,
            resetAt: timestamp + this.windowMs,
            blockedUntil: current?.blockedUntil ?? 0,
            blocks: current?.blocks ?? 0,
          }
        : current;

    if (timestamp < bucket.blockedUntil) {
      this.buckets.set(key, bucket);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - timestamp) / 1000)),
      };
    }

    if (bucket.count >= this.limit) {
      bucket.blocks += 1;
      bucket.blockedUntil =
        timestamp + Math.min(this.windowMs * 2 ** (bucket.blocks - 1), 15 * 60_000);
      this.buckets.set(key, bucket);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - timestamp) / 1000)),
      };
    }

    bucket.count += 1;
    this.buckets.set(key, bucket);
    return {
      allowed: true,
      remaining: this.limit - bucket.count,
      retryAfterSeconds: 0,
    };
  }

  public reset(key: string): void {
    this.buckets.delete(key);
  }
}
