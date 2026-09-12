import type { SearchOptions, SearchProvider, SearchResult } from "../types.js";
import { resolveApiKey } from "./catalog.js";
import { loadOpenAISdk, OPENAI_SDK_INSTALL_HINT } from "./sdk.js";

const PERPLEXITY_BASE_URL = "https://api.perplexity.ai";
const PERPLEXITY_MODEL = "sonar";

export interface PerplexityMessage {
  content?: string | null;
  search_results?: Array<{ title?: string; url?: string }>;
  annotations?: Array<{ url_citation?: { title?: string; url?: string } }>;
  citations?: unknown;
}

export interface PerplexityChatResponse {
  choices?: Array<{ message?: PerplexityMessage }>;
}

/** Minimal structural view of the OpenAI-compatible Perplexity client. */
export interface PerplexityClientLike {
  chat: {
    completions: {
      create(
        params: Record<string, unknown>,
        options?: { signal?: AbortSignal },
      ): Promise<PerplexityChatResponse>;
    };
  };
}

export interface PerplexityProviderOptions {
  /** Perplexity API key. Defaults to the PERPLEXITY_API_KEY environment variable. */
  apiKey?: string;
  /** Pre-built client; used directly when provided (tests). */
  client?: PerplexityClientLike;
  /** Injectable SDK loader so a missing install can be simulated in tests. */
  importSdk?: () => Promise<PerplexitySdkModule>;
}

interface PerplexitySdkModule {
  default: new (options: { apiKey: string; baseURL: string }) => PerplexityClientLike;
}

/** Citations priority: search_results → annotations[].url_citation → bare citation URLs. */
function extractResults(message: PerplexityMessage | undefined, maxResults?: number): SearchResult[] {
  const results: SearchResult[] = [];
  for (const item of message?.search_results ?? []) {
    if (!item?.url) continue;
    results.push({ title: item.title ?? item.url, url: item.url, snippet: "" });
  }
  if (results.length === 0) {
    for (const annotation of message?.annotations ?? []) {
      const citation = annotation?.url_citation;
      if (!citation?.url) continue;
      results.push({ title: citation.title ?? citation.url, url: citation.url, snippet: "" });
    }
  }
  if (results.length === 0 && Array.isArray(message?.citations)) {
    for (const citation of message.citations) {
      if (typeof citation === "string") {
        results.push({ title: citation, url: citation, snippet: "" });
      }
    }
  }
  return maxResults ? results.slice(0, maxResults) : results;
}

/**
 * Perplexity provider: OpenAI-compatible endpoint that searches automatically
 * (no tool loop). LLM-backed — costed like the other LLM providers.
 */
export async function createPerplexityProvider(
  options: PerplexityProviderOptions = {},
): Promise<SearchProvider> {
  const apiKey = resolveApiKey("perplexity", options.apiKey);
  const perplexityHint = `${OPENAI_SDK_INSTALL_HINT} (required for the Perplexity provider)`;
  const client =
    options.client ??
    new ((await loadOpenAISdk(options.importSdk, perplexityHint)) as PerplexitySdkModule).default({
      apiKey,
      baseURL: PERPLEXITY_BASE_URL,
    });

  return {
    name: "perplexity",

    async search(query: string, searchOptions: SearchOptions = {}): Promise<SearchResult[]> {
      const response = await client.chat.completions.create(
        {
          model: PERPLEXITY_MODEL,
          messages: [{ role: "user", content: query }],
        },
        { signal: searchOptions.signal },
      );
      return extractResults(response.choices?.[0]?.message, searchOptions.maxResults);
    },
  };
}
