import type { SearchProvider } from "../types.js";
import { requireEnv } from "../util.js";
import { createHttpSearchProvider, toResult } from "./http-search.js";

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
  const baseUrl = (options.baseUrl ?? requireEnv("SEARXNG_BASE_URL")).replace(/\/+$/, "");

  return createHttpSearchProvider({
    name: "searxng",
    label: "SearXNG",
    fetchImpl: options.fetchImpl,
    buildRequest: (query) => ({
      url: `${baseUrl}/search?${new URLSearchParams({ q: query, format: "json" })}`,
      init: { headers: { Accept: "application/json" } },
    }),
    parseResponse: (data) => {
      const { results } = data as SearxngApiResponse;
      return (results ?? []).map((result) => toResult(result.title, result.url, result.content));
    },
    errorHint: (status) =>
      status === 403
        ? ' (the instance must enable the JSON format: settings -> formats: ["html", "json"])'
        : "",
  });
}
