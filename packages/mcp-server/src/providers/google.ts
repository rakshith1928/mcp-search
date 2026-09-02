import type { SearchOptions, SearchProvider, SearchResult } from "../types.js";
import { requireEnv, resolveApiKey, stripHtml } from "../util.js";

const GOOGLE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";
const DEFAULT_MAX_RESULTS = 10;
const GOOGLE_MAX_RESULTS = 10;

interface GoogleApiResponse {
  items?: Array<{ title?: string; link?: string; snippet?: string }>;
}

export interface GoogleProviderOptions {
  /** Google API key. Defaults to the GOOGLE_API_KEY environment variable. */
  apiKey?: string;
  /** Programmable Search Engine ID. Defaults to GOOGLE_SEARCH_ENGINE_ID. */
  searchEngineId?: string;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Google Programmable Search provider. Needs both an API key and a search
 * engine ID (cx); the registry validates the key, this factory validates the cx.
 */
export function createGoogleProvider(options: GoogleProviderOptions = {}): SearchProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = resolveApiKey("google", options.apiKey);
  const searchEngineId = options.searchEngineId ?? requireEnv("GOOGLE_SEARCH_ENGINE_ID");

  return {
    name: "google",

    async search(query: string, searchOptions: SearchOptions = {}): Promise<SearchResult[]> {
      const num = Math.min(
        Math.max(1, searchOptions.maxResults ?? DEFAULT_MAX_RESULTS),
        GOOGLE_MAX_RESULTS,
      );
      const params = new URLSearchParams({
        key: apiKey,
        cx: searchEngineId,
        q: query,
        num: String(num),
      });

      const response = await fetchImpl(`${GOOGLE_ENDPOINT}?${params}`, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        // Redact API keys before embedding response detail in the error.
        const detail = (await response.text())
          .slice(0, 200)
          .replace(/key=[^&\s"']+/g, "key=REDACTED");
        throw new Error(
          `Google search failed: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`,
        );
      }

      const data = (await response.json()) as GoogleApiResponse;
      return (data.items ?? []).map((item) => ({
        title: item.title ?? "",
        url: item.link ?? "",
        snippet: stripHtml(item.snippet ?? ""),
      }));
    },
  };
}
