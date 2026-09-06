import type { SearchOptions, SearchProvider, SearchResult } from "../types.js";
import { requireEnv, stripHtml } from "../util.js";

const DEFAULT_MAX_RESULTS = 10;

interface SearxngApiResponse {
  results?: Array<{ title?: string; url?: string; content?: string }>;
}

export interface SearxngProviderOptions {
  /** SearXNG instance base URL. Defaults to SEARXNG_BASE_URL. */
  baseUrl?: string;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * SearXNG provider for self-hosted instances. The instance must have the
 * JSON format enabled (settings: formats: ["html", "json"]).
 */
export function createSearxngProvider(options: SearxngProviderOptions = {}): SearchProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? requireEnv("SEARXNG_BASE_URL")).replace(/\/+$/, "");

  return {
    name: "searxng",

    async search(query: string, searchOptions: SearchOptions = {}): Promise<SearchResult[]> {
      const params = new URLSearchParams({ q: query, format: "json" });

      const response = await fetchImpl(`${baseUrl}/search?${params}`, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 200);
        const hint =
          response.status === 403
            ? " (the instance must enable the JSON format: settings -> formats: [\"html\", \"json\"])"
            : "";
        throw new Error(
          `SearXNG search failed: HTTP ${response.status}${hint}${detail ? ` — ${detail}` : ""}`,
        );
      }

      const data = (await response.json()) as SearxngApiResponse;
      const mapped = (data.results ?? []).map((result) => ({
        title: result.title ?? "",
        url: result.url ?? "",
        snippet: stripHtml(result.content ?? ""),
      }));
      return mapped.slice(0, searchOptions.maxResults ?? DEFAULT_MAX_RESULTS);
    },
  };
}
