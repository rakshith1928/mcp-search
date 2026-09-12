import { z } from "zod";
import { PROVIDER_NAMES } from "./providers/catalog.js";
import type { ProviderName } from "./types.js";

export const OMNISEARCH_TOOL_NAME = "omnisearch";

export const OMNISEARCH_TOOL_DESCRIPTION =
  "Multi-provider web search (Brave, Anthropic, OpenAI, Moonshot) with caching, " +
  "rate limiting, and fallback chains. Returns normalized markdown with " +
  "numbered results and a Sources footer.";

/** Maximum results the tool may request — also the CLI --max cap. */
export const MAX_TOOL_RESULTS = 20;

/** Zod raw shape for the omnisearch tool, shared by the MCP server and plugins. */
export const omnisearchInputSchema = {
  query: z.string().describe("The web search query"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(MAX_TOOL_RESULTS)
    .optional()
    .describe("Maximum results to return (default 10)"),
  provider: z
    .enum(PROVIDER_NAMES)
    .optional()
    .describe("Override the primary provider for this search"),
  parallel: z
    .boolean()
    .optional()
    .describe("Fan out across all configured providers and merge results"),
};

export type OmnisearchToolArgs = {
  query: string;
  maxResults?: number;
  provider?: ProviderName;
  parallel?: boolean;
};
