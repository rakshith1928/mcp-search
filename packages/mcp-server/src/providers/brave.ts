import type { SearchProvider } from "../types.js";
import { resolveApiKey } from "./catalog.js";
import { clampMaxResults, createHttpSearchProvider, toResult } from "./http-search.js";

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const MAX_RESULTS = 20;

interface BraveApiResponse {
  web?: {
    results?: Array<{ title?: string; url?: string; description?: string }>;
  };
}

export interface BraveProviderOptions {
  /** Brave Search API key. Defaults to the BRAVE_API_KEY environment variable. */
  apiKey?: string;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Brave Search provider backed by the pure REST API — no SDK required.
 *
 * @see https://api-dashboard.search.brave.com/app/documentation/web-search/query
 */
export function createBraveProvider(options: BraveProviderOptions = {}): SearchProvider {
  const apiKey = resolveApiKey("brave", options.apiKey);

  return createHttpSearchProvider({
    name: "brave",
    label: "Brave",
    fetchImpl: options.fetchImpl,
    buildRequest: (query, searchOptions) => ({
      url: `${BRAVE_ENDPOINT}?${new URLSearchParams({
        q: query,
        count: String(clampMaxResults(searchOptions.maxResults, MAX_RESULTS)),
      })}`,
      init: {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
      },
    }),
    parseResponse: (data) => {
      const { web } = data as BraveApiResponse;
      return (web?.results ?? []).map((result) => toResult(result.title, result.url, result.description));
    },
  });
}
