import type { SearchOptions, SearchProvider, SearchResult } from "../types.js";
import { resolveApiKey, stripHtml } from "../util.js";

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS = 20;

interface BraveApiResponse {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
    }>;
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
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = resolveApiKey("brave", options.apiKey);

  return {
    name: "brave",

    async search(query: string, searchOptions: SearchOptions = {}): Promise<SearchResult[]> {
      const count = Math.min(
        Math.max(1, searchOptions.maxResults ?? DEFAULT_MAX_RESULTS),
        MAX_RESULTS,
      );
      const params = new URLSearchParams({ q: query, count: String(count) });

      const response = await fetchImpl(`${BRAVE_ENDPOINT}?${params}`, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
        signal: searchOptions.signal,
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 200);
        throw new Error(
          `Brave search failed: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`,
        );
      }

      const data = (await response.json()) as BraveApiResponse;
      const raw = data.web?.results ?? [];

      return raw.map((result) => ({
        title: result.title ?? "",
        url: result.url ?? "",
        snippet: stripHtml(result.description ?? ""),
      }));
    },
  };
}
