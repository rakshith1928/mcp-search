import type { ProviderName, SearchOptions } from "./types.js";

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export interface LRUCacheOptions {
  maxEntries: number;
  ttlMs: number;
}

/**
 * In-memory LRU cache with per-entry TTL, backed by a Map whose insertion
 * order tracks recency: reads re-insert the key, eviction takes the oldest.
 */
export class LRUCache<V> {
  private readonly entries = new Map<string, CacheEntry<V>>();

  constructor(private readonly options: LRUCacheOptions) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.options.ttlMs });
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

/** FNV-1a 32-bit hash, rendered as hex — small, fast, dependency-free. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Stable cache key over provider, query, and options. Options are
 * canonicalized (sorted keys) so key order never changes the key.
 */
export function cacheKey(provider: ProviderName, query: string, options?: SearchOptions): string {
  const canonicalOptions = JSON.stringify(sortKeys(options ?? {}));
  return `${provider}:${fnv1a(`${query}\u0000${canonicalOptions}`)}`;
}

/**
 * Cache key for a merged parallel response: order-insensitive over the
 * participant list, sensitive to the set itself plus query and options.
 */
export function mergedCacheKey(
  participants: ProviderName[],
  query: string,
  options?: SearchOptions,
): string {
  const canonicalOptions = JSON.stringify(sortKeys(options ?? {}));
  const participantSet = [...participants].sort().join(",");
  return `parallel:${fnv1a(`${participantSet}\u0000${query}\u0000${canonicalOptions}`)}`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}
