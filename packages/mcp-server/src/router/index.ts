import type { ProviderName, SearchProvider, SearchResponse } from "../types.js";
import { LRUCache } from "../cache.js";
import {
  DEFAULT_RATE_LIMITS,
  RateLimiter,
  rateLimitFromEnv,
  type RateLimitConfig,
} from "../rate-limiter.js";
import { getProvider } from "../providers/index.js";
import type { RouterContext } from "./attempts.js";
import type { CacheValue } from "./response.js";
import { resolveParticipants, searchParallel, searchSingle } from "./paths.js";

export { isTransientSearchError } from "./attempts.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_CACHE_MAX_ENTRIES = 500;

export interface RouterConfig {
  /** Provider asked for first. */
  primary: ProviderName;
  /** Providers tried in order when the primary fails. */
  fallback?: ProviderName[];
  /** Cache TTL in milliseconds (default 5 minutes). */
  cacheTtlMs?: number;
  /** Cache capacity (default 500 entries). */
  cacheMaxEntries?: number;
  /** Rate limit overrides per provider; omit to use env vars, then defaults. */
  rateLimits?: Partial<Record<ProviderName, RateLimitConfig>>;
  /** Provider instances (tests); the lazy registry serves the rest. */
  providers?: Partial<Record<ProviderName, SearchProvider>>;
  /** Limiter instances (tests); built from config/env/defaults otherwise. */
  limiters?: Partial<Record<ProviderName, Pick<RateLimiter, "acquire">>>;
  /** Parallel participants; overrides the env presence scan when set. */
  parallelParticipants?: ProviderName[];
  /** Per-attempt request timeout in ms (default 30000). */
  timeoutMs?: number;
  /** Injectable sleep for backoff (tests); real setTimeout otherwise. */
  sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Per-call routing intent (ADR-0009). The Router owns chain-building and
 * dispatch mechanics — callers pass what they want, not how to get it.
 */
export interface RouterSearchOptions {
  /** Maximum results to return (capped by providers). */
  maxResults?: number;
  /** Per-call primary override; the configured fallback chain follows it. */
  provider?: ProviderName;
  /** Fan out across the auto-resolved participants (env scan / config list). */
  parallel?: boolean;
  /** Explicit parallel participant list; wins over `parallel`. */
  participants?: ProviderName[];
}

export interface Router {
  search(query: string, options?: RouterSearchOptions): Promise<SearchResponse>;
  config: RouterConfig;
}

/**
 * Central search router (ADR-0009): assembles the shared context and
 * dispatches to the single or parallel path. Cache → resolve provider →
 * per-attempt rate-limit token + fresh abort signal → search, with ordered
 * fallback chains, per-participant cache entries, and a merged-cache entry
 * for parallel responses.
 */
export function createRouter(config: RouterConfig): Router {
  const cache = new LRUCache<CacheValue>({
    maxEntries: config.cacheMaxEntries ?? DEFAULT_CACHE_MAX_ENTRIES,
    ttlMs: config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
  });

  const providerCache = new Map<ProviderName, SearchProvider>();
  const limiters = new Map<ProviderName, Pick<RateLimiter, "acquire">>();
  const sleepImpl =
    config.sleepImpl ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const ctx: RouterContext = {
    config,
    timeoutMs,
    sleepImpl,
    async providerFor(name: ProviderName): Promise<SearchProvider> {
      const injected = config.providers?.[name];
      if (injected) return injected;
      let provider = providerCache.get(name);
      if (!provider) {
        provider = await getProvider(name);
        providerCache.set(name, provider);
      }
      return provider;
    },
    limiterFor(name: ProviderName): Pick<RateLimiter, "acquire"> | undefined {
      const injected = config.limiters?.[name];
      if (injected) return injected;
      let limiter = limiters.get(name);
      if (!limiter) {
        const rateConfig =
          config.rateLimits?.[name] ?? rateLimitFromEnv(name) ?? DEFAULT_RATE_LIMITS[name];
        limiter = new RateLimiter(rateConfig);
        limiters.set(name, limiter);
      }
      return limiter;
    },
  };

  async function search(
    query: string,
    options: RouterSearchOptions = {},
  ): Promise<SearchResponse> {
    const participants = options.participants ?? (options.parallel ? resolveParticipants(config) : []);
    if (participants.length === 0) {
      return searchSingle(ctx, cache, query, options);
    }
    return searchParallel(ctx, cache, query, options, participants);
  }

  return { search, config };
}
