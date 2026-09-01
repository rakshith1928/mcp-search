/**
 * @omnisearch/mcp-server entry point.
 *
 * Phase 4 adds the MCP server transport and CLI test mode here; for now the
 * package exposes its public types so workspace consumers can type-check.
 */

export type {
  ProviderName,
  SearchOptions,
  SearchProvider,
  SearchResult,
  SearchResponse,
} from "./types.js";
