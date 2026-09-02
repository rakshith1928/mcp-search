import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RATE_LIMITS,
  RateLimiter,
  rateLimitFromEnv,
  rateLimitEnvKey,
} from "./rate-limiter.js";

describe("RateLimiter", () => {
  test("allows a burst up to the limit without delay", async () => {
    const limiter = new RateLimiter({ limit: 3, windowMs: 60_000 });

    const start = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(Date.now() - start).toBeLessThan(50);
  });

  test("blocks once the budget is exhausted until tokens refill", async () => {
    // 2 tokens per 100ms window → ~50ms per refilled token.
    const limiter = new RateLimiter({ limit: 2, windowMs: 100 });

    await limiter.acquire();
    await limiter.acquire();

    const start = Date.now();
    await limiter.acquire();
    const waited = Date.now() - start;
    expect(waited).toBeGreaterThanOrEqual(40);
  });

  test("refills continuously over the window", async () => {
    // 4 tokens per 200ms → 50ms per token; after the burst of 4, two more
    // sequential acquires should take ~50ms each.
    const limiter = new RateLimiter({ limit: 4, windowMs: 200 });

    for (let i = 0; i < 4; i++) await limiter.acquire();

    const start = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    expect(Date.now() - start).toBeGreaterThanOrEqual(80);
  });
});

describe("rate limit configuration", () => {
  test("ships a default for every provider, brave at 15/minute", () => {
    for (const provider of ["brave", "anthropic", "openai", "moonshot"] as const) {
      expect(DEFAULT_RATE_LIMITS[provider]).toBeDefined();
    }
    expect(DEFAULT_RATE_LIMITS.brave).toEqual({ limit: 15, windowMs: 60_000 });
  });

  test("builds the per-provider env var name", () => {
    expect(rateLimitEnvKey("brave")).toBe("OMNISEARCH_RATE_LIMIT_BRAVE");
    expect(rateLimitEnvKey("moonshot")).toBe("OMNISEARCH_RATE_LIMIT_MOONSHOT");
  });

  test("parses <limit>/<windowSeconds> from the environment", () => {
    const config = rateLimitFromEnv("brave", { OMNISEARCH_RATE_LIMIT_BRAVE: "3/60" });
    expect(config).toEqual({ limit: 3, windowMs: 60_000 });
  });

  test("returns undefined when the env var is not set", () => {
    expect(rateLimitFromEnv("brave", {})).toBeUndefined();
  });

  test("throws a clear error on malformed values", () => {
    expect(() => rateLimitFromEnv("brave", { OMNISEARCH_RATE_LIMIT_BRAVE: "fast" })).toThrow(
      /OMNISEARCH_RATE_LIMIT_BRAVE/,
    );
  });
});
