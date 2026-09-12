import type { SearchProvider } from "../types.js";
import { resolveApiKey } from "./catalog.js";
import { clampMaxResults, createHttpSearchProvider, toResult } from "./http-search.js";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const MAX_RESULTS = 20;

interface TavilyApiResponse {
  results?: Array<{ title?: string; url?: string; content?: string }>;
}

export interface TavilyProviderOptions {
  /** Tavily API key. Defaults to the TAVILY_API_KEY environment variable. */
  apiKey?: string;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Tavily provider backed by the pure REST API — no SDK required.
 */
export function createTavilyProvider(options: TavilyProviderOptions = {}): SearchProvider {
  const apiKey = resolveApiKey("tavily", options.apiKey);

  return createHttpSearchProvider({
    name: "tavily",
    label: "Tavily",
    fetchImpl: options.fetchImpl,
    buildRequest: (query, searchOptions) => ({
      url: TAVILY_ENDPOINT,
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          max_results: clampMaxResults(searchOptions.maxResults, MAX_RESULTS),
        }),
      },
    }),
    parseResponse: (data) => {
      const { results } = data as TavilyApiResponse;
      return (results ?? []).map((result) => toResult(result.title, result.url, result.content));
    },
  });
}
