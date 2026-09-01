import type { SearchOptions, SearchProvider, SearchResult } from "../types.js";
import { loadOptionalSdk, resolveApiKey } from "../util.js";

const MOONSHOT_BASE_URL = "https://api.moonshot.cn/v1";
const MOONSHOT_MODEL = "kimi-k2-0711-preview";
const MAX_TOOL_ROUNDS = 8;

export const OPENAI_SDK_INSTALL_HINT =
  "OpenAI SDK not installed. Run: npm install openai (required for the Moonshot provider)";

export interface MoonshotToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

export interface MoonshotMessage {
  role?: string;
  content?: string | null;
  tool_calls?: MoonshotToolCall[];
  annotations?: Array<{ url_citation?: { title?: string; url?: string } }>;
}

export interface MoonshotChatResponse {
  choices?: Array<{ finish_reason?: string; message?: MoonshotMessage }>;
}

/** Minimal structural view of the OpenAI-compatible Moonshot client. */
export interface MoonshotClientLike {
  chat: {
    completions: {
      create(params: Record<string, unknown>): Promise<MoonshotChatResponse>;
    };
  };
}

export interface MoonshotProviderOptions {
  /** Moonshot API key. Defaults to the MOONSHOT_API_KEY environment variable. */
  apiKey?: string;
  /** Pre-built client; used directly when provided (tests). */
  client?: MoonshotClientLike;
  /** Injectable SDK loader so a missing install can be simulated in tests. */
  importSdk?: () => Promise<OpenAISdkModule>;
}

interface OpenAISdkModule {
  default: new (options: { apiKey: string; baseURL: string }) => MoonshotClientLike;
}

async function dynamicImportSdk(): Promise<OpenAISdkModule> {
  return (await import("openai")) as unknown as OpenAISdkModule;
}

function loadSdk(importSdk?: MoonshotProviderOptions["importSdk"]): Promise<OpenAISdkModule> {
  return loadOptionalSdk(importSdk ?? dynamicImportSdk, OPENAI_SDK_INSTALL_HINT);
}

/**
 * Acknowledge a `$web_search` builtin tool_call. Moonshot executes the search
 * server-side; the protocol expects the client to reply to the tool_call with
 * a builtin tool-response frame. The exact frame format is isolated here so it
 * can be adjusted without touching the loop.
 */
function builtinToolResponse(toolCall: MoonshotToolCall): string {
  return `<|tool_response_begin|>${toolCall.function?.arguments ?? "{}"}<|tool_response_end|>`;
}

function extractCitations(message: MoonshotMessage | undefined, maxResults?: number): SearchResult[] {
  const results: SearchResult[] = [];
  for (const annotation of message?.annotations ?? []) {
    const citation = annotation?.url_citation;
    if (!citation?.url) continue;
    results.push({ title: citation.title ?? citation.url, url: citation.url, snippet: "" });
  }
  return maxResults ? results.slice(0, maxResults) : results;
}

/**
 * Moonshot (Kimi) provider: OpenAI-compatible endpoint with the server-side
 * `$web_search` builtin function. Drives the tool_call loop for up to 8 rounds
 * until a final answer with `annotations[].url_citation` citations arrives.
 */
export async function createMoonshotProvider(
  options: MoonshotProviderOptions = {},
): Promise<SearchProvider> {
  const apiKey = resolveApiKey("moonshot", options.apiKey);
  const client =
    options.client ??
    new (await loadSdk(options.importSdk)).default({ apiKey, baseURL: MOONSHOT_BASE_URL });

  return {
    name: "moonshot",

    async search(query: string, searchOptions: SearchOptions = {}): Promise<SearchResult[]> {
      const messages: Array<Record<string, unknown>> = [{ role: "user", content: query }];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await client.chat.completions.create({
          model: MOONSHOT_MODEL,
          messages,
          tools: [{ type: "builtin_function", function: { name: "$web_search" } }],
          thinking: { type: "disabled" },
        });

        const choice = response.choices?.[0];
        const message = choice?.message;

        if (choice?.finish_reason !== "tool_calls" || !message?.tool_calls?.length) {
          return extractCitations(message, searchOptions.maxResults);
        }

        messages.push({
          role: "assistant",
          content: message.content ?? "",
          tool_calls: message.tool_calls,
        });
        for (const toolCall of message.tool_calls) {
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: builtinToolResponse(toolCall) });
        }
      }

      throw new Error(`Moonshot search exceeded ${MAX_TOOL_ROUNDS} tool rounds without a final answer`);
    },
  };
}
