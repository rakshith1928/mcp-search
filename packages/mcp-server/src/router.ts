import type {
  ProviderName,
  SearchOptions,
  SearchProvider,
  SearchResponse,
  SearchResult,
} from "./types.js";
import { cacheKey, LRUCache } from "./cache.js";
import { normalizeResults } from "./normalize.js";
import {
  DEFAULT_RATE_LIMITS,
  RateLimiter,
  rateLimitFromEnv,
  type RateLimitConfig,
} from "./rate-limiter.js";
import { getProvider } from "./providers/index.js";

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
}

const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_CACHE_MAX_ENTRIES = 500;

interface CacheValue {
  provider: ProviderName;
  requestedProvider: ProviderName | undefined;
  fellBack: boolean;
  results: SearchResult[];
  markdown: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Central search router: cache check → per-provider rate limiting → primary
 * provider with ordered fallback chain → normalized markdown → cache store.
 */
export function createRouter(config: RouterConfig) {
  const cache = new LRUCache<CacheValue>({
    maxEntries: config.cacheMaxEntries ?? DEFAULT_CACHE_MAX_ENTRIES,
    ttlMs: config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
  });

  const providerCache = new Map<ProviderName, SearchProvider>();
  const limiters = new Map<ProviderName, Pick<RateLimiter, "acquire">>();

  async function providerFor(name: ProviderName): Promise<SearchProvider> {
    const injected = config.providers?.[name];
    if (injected) return injected;
    let provider = providerCache.get(name);
    if (!provider) {
      provider = await getProvider(name);
      providerCache.set(name, provider);
    }
    return provider;
  }

  function limiterFor(name: ProviderName): Pick<RateLimiter, "acquire"> | undefined {
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
  }

  async function search(
    query: string,
    options: SearchOptions = {},
    chain?: ProviderName[],
  ): Promise<SearchResponse> {
    const effectivePrimary = chain?.[0] ?? config.primary;
    const key = cacheKey(effectivePrimary, query, options);

    const cached = cache.get(key);
    if (cached) {
      return {
        query,
        provider: cached.provider,
        requestedProvider: cached.requestedProvider,
        fellBack: cached.fellBack,
        results: cached.results,
        markdown: cached.markdown,
        cached: true,
        elapsedMs: 0,
      };
    }

    const attemptChain = chain ?? [config.primary, ...(config.fallback ?? [])];
    const startedAt = Date.now();
    const errors: string[] = [];

    for (const name of attemptChain) {
      await limiterFor(name)?.acquire();
      try {
        const provider = await providerFor(name);
        const results = await provider.search(query, options);
        const markdown = normalizeResults(query, name, results);
        const fellBack = name !== effectivePrimary;
        const value: CacheValue = {
          provider: name,
          requestedProvider: fellBack ? effectivePrimary : undefined,
          fellBack,
          results,
          markdown,
        };
        cache.set(key, value);
        return {
          query,
          provider: value.provider,
          requestedProvider: value.requestedProvider,
          fellBack: value.fellBack,
          results,
          markdown,
          cached: false,
          elapsedMs: Date.now() - startedAt,
        };
      } catch (error) {
        errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`All search providers failed — ${errors.join(" | ")}`);
  }

  return { search, config };
}

export type Router = ReturnType<typeof createRouter>;
