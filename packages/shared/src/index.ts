/**
 * Shared plugin logic consumed by the native OpenCode and Kilocode wrappers.
 *
 * The wrappers inject their platform's `tool()` helper (from
 * `@opencode-ai/plugin` or `@kilocode/plugin` — the two APIs are structurally
 * identical); this package builds the router and the `omnisearch` tool
 * definition without depending on either SDK.
 */

export * from "./plugin-impl.js";

export type {
  ProviderName,
  SearchOptions,
  SearchProvider,
  SearchResult,
  SearchResponse,
} from "@omnisearch/mcp-server";
