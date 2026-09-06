import type { ProviderName, SearchOptions, SearchProvider, SearchResult } from "../types.js";
import { stripHtml } from "../util.js";

export const DEFAULT_MAX_RESULTS = 10;

/**
 * Clamp a caller-supplied maxResults to a provider's server-side cap,
 * defaulting to 10. Used inside buildRequest for APIs that take a count
 * parameter; the adapter additionally slices mapped results client-side.
 */
export function clampMaxResults(value: number | undefined, cap: number): number {
  return Math.min(Math.max(1, value ?? DEFAULT_MAX_RESULTS), cap);
}

/** Map raw provider fields into a SearchResult, stripping HTML from the snippet. */
export function toResult(
  title: string | undefined,
  url: string | undefined,
  snippet: string | undefined,
): SearchResult {
  return { title: title ?? "", url: url ?? "", snippet: stripHtml(snippet ?? "") };
}

export interface HttpSearchProviderConfig {
  /** Provider name (matches the ProviderName union). */
  name: ProviderName;
  /** Display name for error messages (e.g. "Brave", "SearXNG"). */
  label: string;
  /** Build the HTTP request for one search call. */
  buildRequest(query: string, options: SearchOptions): { url: string; init?: RequestInit };
  /** Parse a successful JSON body into results (pre-slice). */
  parseResponse(data: unknown, options: SearchOptions): SearchResult[];
  /** Optional decoration appended after the status in the error message. */
  errorHint?(status: number, body: string): string;
  /** Injectable fetch (tests); global fetch otherwise. */
  fetchImpl?: typeof fetch;
}

function redactCredentials(detail: string): string {
  return detail.replace(/key=[^&\s"']+/g, "key=REDACTED");
}

/**
 * Shared adapter for fetch-based search providers (ADR-0010). Owns the
 * response contract the rest of the system depends on: the standardized
 * error shape `<Label> search failed: HTTP <status>[hint] — <detail>` that
 * `isTransientSearchError` regex-matches, universal `key=` redaction in
 * error bodies, abort-signal forwarding, and client-side maxResults
 * slicing. Providers supply a request builder and a response parser.
 */
export function createHttpSearchProvider(config: HttpSearchProviderConfig): SearchProvider {
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    name: config.name,

    async search(query: string, searchOptions: SearchOptions = {}): Promise<SearchResult[]> {
      const { url, init } = config.buildRequest(query, searchOptions);
      const response = await fetchImpl(url, { ...init, signal: searchOptions.signal });

      if (!response.ok) {
        const body = (await response.text()).slice(0, 200);
        const hint = config.errorHint ? config.errorHint(response.status, body) : "";
        const detail = redactCredentials(body);
        throw new Error(
          `${config.label} search failed: HTTP ${response.status}${hint}${detail ? ` — ${detail}` : ""}`,
        );
      }

      const data = (await response.json()) as unknown;
      return config
        .parseResponse(data, searchOptions)
        .slice(0, searchOptions.maxResults ?? DEFAULT_MAX_RESULTS);
    },
  };
}
