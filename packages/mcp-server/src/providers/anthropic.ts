import type { SearchOptions, SearchProvider, SearchResult } from "../types.js";
import { loadOptionalSdk, resolveApiKey } from "../util.js";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const MAX_USES = 8;

export const ANTHROPIC_SDK_INSTALL_HINT =
  "Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk";

/** A `web_search_tool_result` content block carries found pages or an error. */
interface AnthropicContentBlock {
  type?: string;
  content?: unknown;
}

export interface AnthropicMessageResponse {
  content?: AnthropicContentBlock[];
}

/** Minimal structural view of the Anthropic client used by the provider. */
export interface AnthropicClientLike {
  messages: {
    create(params: Record<string, unknown>): Promise<AnthropicMessageResponse>;
  };
}

export interface AnthropicProviderOptions {
  /** Anthropic API key. Defaults to the ANTHROPIC_API_KEY environment variable. */
  apiKey?: string;
  /** Pre-built client; used directly when provided (tests). */
  client?: AnthropicClientLike;
  /** Injectable SDK loader so a missing install can be simulated in tests. */
  importSdk?: () => Promise<AnthropicSdkModule>;
}

interface AnthropicSdkModule {
  default: new (options: { apiKey: string }) => AnthropicClientLike;
}

async function dynamicImportSdk(): Promise<AnthropicSdkModule> {
  return (await import("@anthropic-ai/sdk")) as unknown as AnthropicSdkModule;
}

function loadSdk(importSdk?: AnthropicProviderOptions["importSdk"]): Promise<AnthropicSdkModule> {
  return loadOptionalSdk(importSdk ?? dynamicImportSdk, ANTHROPIC_SDK_INSTALL_HINT);
}

function isWebSearchResultArray(content: unknown): content is Array<{ url?: string; title?: string }> {
  return Array.isArray(content);
}

/**
 * Anthropic provider: server-side web search via the `web_search_20250305`
 * tool on `claude-sonnet-4-20250514`. Each search is a full LLM API call —
 * significantly costlier than pure search APIs like Brave.
 */
export async function createAnthropicProvider(
  options: AnthropicProviderOptions = {},
): Promise<SearchProvider> {
  const apiKey = resolveApiKey("anthropic", options.apiKey);
  const client =
    options.client ??
    new (await loadSdk(options.importSdk)).default({ apiKey });

  return {
    name: "anthropic",

    async search(query: string, searchOptions: SearchOptions = {}): Promise<SearchResult[]> {
      const response = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_USES }],
        messages: [{ role: "user", content: query }],
      });

      const results: SearchResult[] = [];
      for (const block of response.content ?? []) {
        if (block.type !== "web_search_tool_result") continue;
        if (!isWebSearchResultArray(block.content)) continue;
        for (const item of block.content) {
          if (!item?.url) continue;
          results.push({ title: item.title ?? item.url, url: item.url, snippet: "" });
        }
      }

      return searchOptions.maxResults ? results.slice(0, searchOptions.maxResults) : results;
    },
  };
}
