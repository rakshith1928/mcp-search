import type { ProviderName, SearchResponse } from "../types.js";

/**
 * What the router caches per (effective primary | participant) key: enough to
 * rebuild a full SearchResponse on a hit. Parallel entries carry mode/
 * providers/failedProviders; single-mode entries leave them undefined.
 */
export interface CacheValue {
  provider: ProviderName;
  requestedProvider: ProviderName | undefined;
  fellBack: boolean;
  results: SearchResponse["results"];
  markdown: string;
  mode?: "single" | "parallel";
  providers?: ProviderName[];
  failedProviders?: ProviderName[];
}

/**
 * The one SearchResponse assembly site (ADR-0009): rebuilds a response from
 * a cache value, fresh or hit.
 */
export function buildResponse(
  query: string,
  value: CacheValue,
  cached: boolean,
  elapsedMs: number,
): SearchResponse {
  return {
    query,
    provider: value.provider,
    requestedProvider: value.requestedProvider,
    fellBack: value.fellBack,
    results: value.results,
    markdown: value.markdown,
    cached,
    elapsedMs,
    mode: value.mode,
    providers: value.providers,
    failedProviders: value.failedProviders,
  };
}
