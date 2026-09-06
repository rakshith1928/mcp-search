import type { SearchOptions, SearchProvider, SearchResult } from "../types.js";
import { resolveApiKey, stripHtml } from "../util.js";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_MAX_RESULTS = 10;
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
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = resolveApiKey("tavily", options.apiKey);

  return {
    name: "tavily",

    async search(query: string, searchOptions: SearchOptions = {}): Promise<SearchResult[]> {
      const maxResults = Math.min(
        Math.max(1, searchOptions.maxResults ?? DEFAULT_MAX_RESULTS),
        MAX_RESULTS,
      );

      const response = await fetchImpl(TAVILY_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, max_results: maxResults }),
        signal: searchOptions.signal,
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 200);
        throw new Error(
          `Tavily search failed: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`,
        );
      }

      const data = (await response.json()) as TavilyApiResponse;
      return (data.results ?? []).map((result) => ({
        title: result.title ?? "",
        url: result.url ?? "",
        snippet: stripHtml(result.content ?? ""),
      }));
    },
  };
}
