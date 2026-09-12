import type { SearchProvider } from "../types.js";
import { requireEnv, resolveApiKey } from "./catalog.js";
import { clampMaxResults, createHttpSearchProvider, toResult } from "./http-search.js";

const GOOGLE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";
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
 * engine ID (cx); the factory validates both at construction.
 */
export function createGoogleProvider(options: GoogleProviderOptions = {}): SearchProvider {
  const apiKey = resolveApiKey("google", options.apiKey);
  const searchEngineId = options.searchEngineId ?? requireEnv("GOOGLE_SEARCH_ENGINE_ID");

  return createHttpSearchProvider({
    name: "google",
    label: "Google",
    fetchImpl: options.fetchImpl,
    buildRequest: (query, searchOptions) => ({
      url: `${GOOGLE_ENDPOINT}?${new URLSearchParams({
        key: apiKey,
        cx: searchEngineId,
        q: query,
        num: String(clampMaxResults(searchOptions.maxResults, GOOGLE_MAX_RESULTS)),
      })}`,
      init: { headers: { Accept: "application/json" } },
    }),
    parseResponse: (data) => {
      const { items } = data as GoogleApiResponse;
      return (items ?? []).map((item) => toResult(item.title, item.link, item.snippet));
    },
  });
}
