/**
 * Core interfaces for the omnisearch multi-provider search system.
 *
 * Every provider (Brave, Anthropic, OpenAI, Moonshot) implements
 * {@link SearchProvider}; the router (see `router.ts`) composes providers
 * with caching, rate limiting, and fallback chains.
 */

/** All search providers available in v1.1. */
export type ProviderName =
  | "anthropic"
  | "openai"
  | "brave"
  | "moonshot"
  | "tavily"
  | "google"
  | "searxng"
  | "perplexity";

/** A single normalized search result. */
export interface SearchResult {
  /** Result title as shown by the provider. */
  title: string;
  /** Absolute URL of the result. */
  url: string;
  /** Plain-text snippet/summary with HTML stripped. */
  snippet: string;
}

/** Options controlling a single search invocation. */
export interface SearchOptions {
  /** Maximum number of results to request from the provider. */
  maxResults?: number;
}

/** A provider capable of executing web searches. */
export interface SearchProvider {
  /** Canonical provider name, matches the {@link ProviderName} union. */
  readonly name: ProviderName;
  /** Execute a web search and return normalized results. */
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

/** Full response returned by the search router. */
export interface SearchResponse {
  /** The original query. */
  query: string;
  /** The provider that actually produced the results. */
  provider: ProviderName;
  /** The provider that was asked for first, when a fallback occurred. */
  requestedProvider?: ProviderName;
  /** True when the primary provider failed and a fallback served the query. */
  fellBack: boolean;
  /** Raw structured results. */
  results: SearchResult[];
  /** Normalized markdown rendering of the results, ready for an LLM. */
  markdown: string;
  /** True when the response was served from cache. */
  cached: boolean;
  /** Wall-clock duration of the search in milliseconds (0 for cache hits). */
  elapsedMs: number;
}
