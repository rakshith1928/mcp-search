import { describe, expect, test } from "bun:test";
import { cacheKey, LRUCache } from "./cache.js";

describe("LRUCache", () => {
  test("stores and retrieves values", () => {
    const cache = new LRUCache<string>({ maxEntries: 2, ttlMs: 1_000 });

    cache.set("a", "alpha");
    expect(cache.get("a")).toBe("alpha");
  });

  test("returns undefined for expired entries (TTL)", async () => {
    const cache = new LRUCache<string>({ maxEntries: 2, ttlMs: 20 });

    cache.set("a", "alpha");
    await Bun.sleep(40);
    expect(cache.get("a")).toBeUndefined();
  });

  test("evicts the least-recently-used entry beyond maxEntries", () => {
    const cache = new LRUCache<string>({ maxEntries: 2, ttlMs: 60_000 });

    cache.set("a", "alpha");
    cache.set("b", "beta");
    cache.set("c", "gamma");

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("beta");
    expect(cache.get("c")).toBe("gamma");
  });

  test("get refreshes recency", () => {
    const cache = new LRUCache<string>({ maxEntries: 2, ttlMs: 60_000 });

    cache.set("a", "alpha");
    cache.set("b", "beta");
    cache.get("a"); // a is now most recently used
    cache.set("c", "gamma"); // evicts b

    expect(cache.get("a")).toBe("alpha");
    expect(cache.get("b")).toBeUndefined();
  });

  test("overwrite refreshes recency and preserves the newer value", () => {
    const cache = new LRUCache<string>({ maxEntries: 2, ttlMs: 60_000 });

    cache.set("a", "one");
    cache.set("b", "beta");
    cache.set("a", "two"); // overwrite — a becomes most recently used
    cache.set("c", "gamma"); // evicts b

    expect(cache.get("a")).toBe("two");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe("gamma");
  });
});

describe("cacheKey", () => {
  test("is deterministic for identical inputs", () => {
    expect(cacheKey("brave", "typescript", { maxResults: 5 })).toBe(
      cacheKey("brave", "typescript", { maxResults: 5 }),
    );
  });

  test("differs by provider, query, and options", () => {
    const base = cacheKey("brave", "typescript", { maxResults: 5 });
    expect(base).not.toBe(cacheKey("openai", "typescript", { maxResults: 5 }));
    expect(base).not.toBe(cacheKey("brave", "javascript", { maxResults: 5 }));
    expect(base).not.toBe(cacheKey("brave", "typescript", { maxResults: 10 }));
  });

  test("ignores option key order", () => {
    expect(cacheKey("brave", "typescript", { maxResults: 5 })).toBe(
      cacheKey("brave", "typescript", { maxResults: 5 }),
    );
  });

  test("differs when options differ in value only", () => {
    expect(cacheKey("brave", "typescript", { maxResults: 5 })).not.toBe(
      cacheKey("brave", "typescript", { maxResults: 6 }),
    );
  });
});
