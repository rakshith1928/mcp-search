import type { ProviderName } from "./types.js";

export interface RateLimitConfig {
  /** Maximum tokens (requests) per window. */
  limit: number;
  /** Refill window in milliseconds. */
  windowMs: number;
}

/** Conservative per-provider defaults (requests per minute). */
export const DEFAULT_RATE_LIMITS: Record<ProviderName, RateLimitConfig> = {
  brave: { limit: 15, windowMs: 60_000 },
  anthropic: { limit: 10, windowMs: 60_000 },
  openai: { limit: 10, windowMs: 60_000 },
  moonshot: { limit: 10, windowMs: 60_000 },
};

export function rateLimitEnvKey(provider: ProviderName): string {
  return `OMNISEARCH_RATE_LIMIT_${provider.toUpperCase()}`;
}

/**
 * Parse `OMNISEARCH_RATE_LIMIT_<PROVIDER>` in `<limit>/<windowSeconds>` form
 * (e.g. `15/60`). Returns undefined when unset; throws a clear error on
 * malformed values.
 */
export function rateLimitFromEnv(
  provider: ProviderName,
  env: Record<string, string | undefined> = process.env,
): RateLimitConfig | undefined {
  const raw = env[rateLimitEnvKey(provider)];
  if (!raw) return undefined;

  const match = /^(\d+)\/(\d+)$/.exec(raw.trim());
  if (!match) {
    throw new Error(
      `Invalid ${rateLimitEnvKey(provider)}: '${raw}'. Expected <limit>/<windowSeconds>, e.g. 15/60.`,
    );
  }
  const limit = Number(match[1]);
  const windowSeconds = Number(match[2]);
  if (limit < 1 || windowSeconds < 1) {
    throw new Error(
      `Invalid ${rateLimitEnvKey(provider)}: '${raw}'. Limit and window must both be >= 1.`,
    );
  }
  return { limit, windowMs: windowSeconds * 1_000 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Token-bucket rate limiter. Tokens refill continuously across the window
 * (a 3/60 bucket refills one token every ~20s), so `acquire()` blocks exactly
 * as long as needed for the next token.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(private readonly config: RateLimitConfig) {
    this.tokens = config.limit;
    this.lastRefill = Date.now();
  }

  /** Consume one token, waiting until one is available. */
  async acquire(): Promise<void> {
    for (;;) {
      const waitMs = this.tryTake();
      if (waitMs === 0) return;
      await sleep(waitMs);
    }
  }

  /** Returns 0 when a token was consumed, otherwise how long to wait. */
  private tryTake(): number {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      this.tokens = Math.min(
        this.config.limit,
        this.tokens + (elapsed / this.config.windowMs) * this.config.limit,
      );
      this.lastRefill = now;
    }
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    return Math.ceil(((1 - this.tokens) / this.config.limit) * this.config.windowMs);
  }
}
