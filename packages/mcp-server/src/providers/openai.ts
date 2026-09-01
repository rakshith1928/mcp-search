import type { SearchOptions, SearchProvider, SearchResult } from "../types.js";
import { loadOptionalSdk, resolveApiKey } from "../util.js";

const OPENAI_MODEL = "gpt-4o";

export const OPENAI_SDK_INSTALL_HINT = "OpenAI SDK not installed. Run: npm install openai";

/** A `url_citation` annotation attached to output text. */
interface OpenAIUrlCitation {
  type?: string;
  title?: string;
  url?: string;
}

export interface OpenAIResponsesResponse {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      annotations?: OpenAIUrlCitation[];
    }>;
  }>;
}

/** Minimal structural view of the OpenAI client used by the provider. */
export interface OpenAIClientLike {
  responses: {
    create(params: Record<string, unknown>): Promise<OpenAIResponsesResponse>;
  };
}

export interface OpenAIProviderOptions {
  /** OpenAI API key. Defaults to the OPENAI_API_KEY environment variable. */
  apiKey?: string;
  /** Pre-built client; used directly when provided (tests). */
  client?: OpenAIClientLike;
  /** Injectable SDK loader so a missing install can be simulated in tests. */
  importSdk?: () => Promise<OpenAISdkModule>;
}

interface OpenAISdkModule {
  default: new (options: { apiKey: string }) => OpenAIClientLike;
}

async function dynamicImportSdk(): Promise<OpenAISdkModule> {
  return (await import("openai")) as unknown as OpenAISdkModule;
}

function loadSdk(importSdk?: OpenAIProviderOptions["importSdk"]): Promise<OpenAISdkModule> {
  return loadOptionalSdk(importSdk ?? dynamicImportSdk, OPENAI_SDK_INSTALL_HINT);
}

/**
 * OpenAI provider: server-side web search via the Responses API
 * (`tools: [{ type: "web_search" }]`). Each search is a full LLM API call —
 * significantly costlier than pure search APIs like Brave.
 */
export async function createOpenAIProvider(
  options: OpenAIProviderOptions = {},
): Promise<SearchProvider> {
  const apiKey = resolveApiKey("openai", options.apiKey);
  const client =
    options.client ??
    new (await loadSdk(options.importSdk)).default({ apiKey });

  return {
    name: "openai",

    async search(query: string, searchOptions: SearchOptions = {}): Promise<SearchResult[]> {
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input: query,
        tools: [{ type: "web_search" }],
      });

      const results: SearchResult[] = [];
      for (const outputItem of response.output ?? []) {
        for (const contentPart of outputItem.content ?? []) {
          for (const annotation of contentPart.annotations ?? []) {
            if (!annotation?.url) continue;
            results.push({
              title: annotation.title ?? annotation.url,
              url: annotation.url,
              snippet: "",
            });
          }
        }
      }

      return searchOptions.maxResults ? results.slice(0, searchOptions.maxResults) : results;
    },
  };
}
