import type { ProviderName, SearchResponse } from "../types.js";
import { cacheKey, mergedCacheKey } from "../cache.js";
import { appendFailureNote, normalizeResults } from "../normalize.js";
import { AVAILABLE_PROVIDERS } from "../providers/index.js";
import { hasProviderConfig } from "../util.js";
import { DEFAULT_MAX_RESULTS } from "../providers/http-search.js";
import type { RouterConfig, RouterSearchOptions } from "./index.js";
import { attemptWithRetry, type RouterContext } from "./attempts.js";
import { buildResponse, type CacheValue } from "./response.js";

/**
 * Parallel participant resolution (v1.1 semantics): explicit config list
 * wins, otherwise every provider whose credential is present.
 */
export function resolveParticipants(config: RouterConfig): ProviderName[] {
  const explicit = config.parallelParticipants;
  if (explicit && explicit.length > 0) {
    // Dedupe first (first occurrence wins) so a repeated name fans out once,
    // then validate so a bad programmatic list fails loudly instead of
    // attempting an unknown provider.
    const unique: ProviderName[] = [];
    for (const name of explicit) {
      if (!unique.includes(name)) unique.push(name);
    }
    for (const name of unique) {
      if (!AVAILABLE_PROVIDERS.includes(name)) {
        throw new Error(
          `Invalid parallel participant '${name}'. Available: ${AVAILABLE_PROVIDERS.join(", ")}`,
        );
      }
    }
    return unique;
  }
  return AVAILABLE_PROVIDERS.filter(hasProviderConfig);
}

/** Rank-preserving round-robin merge with first-wins URL dedupe, capped. */
export function interleave(
  grouped: Array<{ name: ProviderName; results: SearchResponse["results"] }>,
  cap: number,
): SearchResponse["results"] {
  const merged: SearchResponse["results"] = [];
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

/** Effective attempt chain: a per-call provider override becomes the primary. */
export function chainFor(
  config: RouterConfig,
  providerOverride: ProviderName | undefined,
): { effectivePrimary: ProviderName; attemptChain: ProviderName[] } {
  const effectivePrimary = providerOverride ?? config.primary;
  const attemptChain = [
    effectivePrimary,
    ...(config.fallback ?? []).filter((name) => name !== effectivePrimary),
  ];
  return { effectivePrimary, attemptChain };
}

/** Single-provider path: cache → ordered chain (each attempt retried) → cache store. */
export async function searchSingle(
  ctx: RouterContext,
  cache: { get(key: string): CacheValue | undefined; set(key: string, value: CacheValue): void },
  query: string,
  options: RouterSearchOptions,
): Promise<SearchResponse> {
  const { effectivePrimary, attemptChain } = chainFor(ctx.config, options.provider);
  const providerOptions = { maxResults: options.maxResults };
  const key = cacheKey(effectivePrimary, query, providerOptions);

  const cached = cache.get(key);
  if (cached) return buildResponse(query, cached, true, 0);

  const startedAt = Date.now();
  const errors: string[] = [];

  for (const name of attemptChain) {
    try {
      const results = await attemptWithRetry(ctx, name, query, providerOptions);
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
      return buildResponse(query, value, false, Date.now() - startedAt);
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`All search providers failed — ${errors.join(" | ")}`);
}

/** Parallel path: fan-out per participant (each retried independently) → merge → cache store. */
export async function searchParallel(
  ctx: RouterContext,
  cache: { get(key: string): CacheValue | undefined; set(key: string, value: CacheValue): void },
  query: string,
  options: RouterSearchOptions,
  participants: ProviderName[],
): Promise<SearchResponse> {
  const providerOptions = { maxResults: options.maxResults };
  const key = mergedCacheKey(participants, query, providerOptions);

  const cached = cache.get(key);
  if (cached) return buildResponse(query, cached, true, 0);

  const startedAt = Date.now();
  const tasks = participants.map(async (name) => {
    const perKey = cacheKey(name, query, providerOptions);
    const perCached = cache.get(perKey);
    // Only reuse entries that genuinely belong to this provider: a single-mode
    // fallback caches the fallback provider's results under the requested
    // primary's key (fellBack=true), and reusing those here would misattribute
    // results and hide the primary's failure from failedProviders reporting.
    if (perCached && !perCached.fellBack && perCached.provider === name) {
      return perCached.results;
    }
    const results = await attemptWithRetry(ctx, name, query, providerOptions);
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

  const succeeded: Array<{ name: ProviderName; results: SearchResponse["results"] }> = [];
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

  const merged = interleave(succeeded, options.maxResults ?? DEFAULT_MAX_RESULTS);
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

  return buildResponse(query, value, false, Date.now() - startedAt);
}
