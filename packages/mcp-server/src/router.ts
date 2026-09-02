import type {
  ProviderName,
  SearchOptions,
  SearchProvider,
  SearchResponse,
  SearchResult,
} from "./types.js";
import { cacheKey, mergedCacheKey, LRUCache } from "./cache.js";
import { appendFailureNote, normalizeResults } from "./normalize.js";
import {
  DEFAULT_RATE_LIMITS,
  RateLimiter,
  rateLimitFromEnv,
  type RateLimitConfig,
} from "./rate-limiter.js";
import { AVAILABLE_PROVIDERS, getProvider } from "./providers/index.js";
import { hasProviderConfig } from "./util.js";

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
}

const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_CACHE_MAX_ENTRIES = 500;

interface CacheValue {
  provider: ProviderName;
  requestedProvider: ProviderName | undefined;
  fellBack: boolean;
  results: SearchResult[];
  markdown: string;
  mode?: "single" | "parallel";
  providers?: ProviderName[];
  failedProviders?: ProviderName[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Central search router: cache check → primary provider with ordered fallback
 * chain (each attempt: resolve provider → acquire rate-limit token → search)
 * → normalized markdown → cache store.
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

  function resolveParticipants(): ProviderName[] {
    const explicit = config.parallelParticipants;
    if (explicit && explicit.length > 0) return explicit;
    return AVAILABLE_PROVIDERS.filter(hasProviderConfig);
  }

  function interleave(
    grouped: Array<{ name: ProviderName; results: SearchResult[] }>,
    cap: number,
  ): SearchResult[] {
    const merged: SearchResult[] = [];
    const seen = new Set<string>();
    const depth = Math.max(0, ...grouped.map((g) => g.results.length));
    for (let rank = 0; rank < depth && merged.length < cap; rank++) {
      for (const group of grouped) {
        if (merged.length >= cap) break;
        const result = group.results[rank];
        if (!result || seen.has(result.url)) continue;
        seen.add(result.url);
        merged.push(result);
      }
    }
    return merged;
  }

  async function searchParallel(query: string, options: SearchOptions): Promise<SearchResponse> {
    const participants = resolveParticipants();
    if (participants.length === 0) {
      return search(query, options);
    }

    const key = mergedCacheKey(participants, query, options);
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
        mode: "parallel",
        providers: cached.providers,
        failedProviders: cached.failedProviders,
      };
    }

    const startedAt = Date.now();
    const tasks = participants.map(async (name) => {
      const perKey = cacheKey(name, query, options);
      const perCached = cache.get(perKey);
      if (perCached) return perCached.results;
      const provider = await providerFor(name);
      await limiterFor(name)?.acquire();
      const results = await provider.search(query, options);
      cache.set(perKey, {
        provider: name,
        requestedProvider: undefined,
        fellBack: false,
        results,
        markdown: normalizeResults(query, name, results),
      });
      return results;
    });
    const settled = await Promise.allSettled(tasks);

    const succeeded: Array<{ name: ProviderName; results: SearchResult[] }> = [];
    const failed: ProviderName[] = [];
    settled.forEach((outcome, index) => {
      const name = participants[index] as ProviderName;
      if (outcome.status === "fulfilled") {
        succeeded.push({ name, results: outcome.value });
      } else {
        failed.push(name);
      }
    });

    if (succeeded.length === 0) {
      const errors = settled.map((outcome, index) => {
        const name = participants[index] as ProviderName;
        const message =
          outcome.status === "rejected"
            ? outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason)
            : "unexpected fulfillment";
        return `${name}: ${message}`;
      });
      throw new Error(`All search providers failed — ${errors.join(" | ")}`);
    }

    const merged = interleave(succeeded, options.maxResults ?? 10);
    const succeededNames = succeeded.map((entry) => entry.name);
    let markdown = normalizeResults(
      query,
      succeededNames[0] as ProviderName,
      merged,
      `parallel: ${succeededNames.join(", ")}`,
    );
    markdown = appendFailureNote(markdown, failed);

    const value: CacheValue = {
      provider: participants[0] as ProviderName,
      requestedProvider: undefined,
      fellBack: false,
      results: merged,
      markdown,
      mode: "parallel",
      providers: participants,
      failedProviders: failed,
    };
    cache.set(key, value);

    return {
      query,
      provider: value.provider,
      requestedProvider: value.requestedProvider,
      fellBack: value.fellBack,
      results: merged,
      markdown,
      cached: false,
      elapsedMs: Date.now() - startedAt,
      mode: "parallel",
      providers: participants,
      failedProviders: failed,
    };
  }

  async function search(
    query: string,
    options: SearchOptions = {},
    chain?: ProviderName[],
    parallel?: boolean,
  ): Promise<SearchResponse> {
    if (parallel) return searchParallel(query, options);
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

    const attemptChain =
      chain ?? [config.primary, ...(config.fallback ?? []).filter((name) => name !== config.primary)];
    const startedAt = Date.now();
    const errors: string[] = [];

    for (const name of attemptChain) {
      try {
        // Resolve the provider before consuming a rate-limit token so that a
        // provider which fails to load (e.g. missing API key) does not burn a
        // token, and limiter construction errors join the combined error.
        const provider = await providerFor(name);
        await limiterFor(name)?.acquire();
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
