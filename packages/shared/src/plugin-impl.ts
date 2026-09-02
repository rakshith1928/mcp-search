import {
  buildSearchChain,
  createRouter,
  OMNISEARCH_TOOL_DESCRIPTION,
  OMNISEARCH_TOOL_NAME,
  omnisearchInputSchema,
  type OmnisearchToolArgs,
  type ProviderName,
  type RouterConfig,
} from "@omnisearch/mcp-server";

export { OMNISEARCH_TOOL_NAME };

/** Options accepted from each platform's plugin config block. */
export interface OmnisearchPluginOptions {
  /** Primary search provider (default "brave"). */
  provider?: ProviderName;
  /** Ordered fallback providers used when the primary fails. */
  fallback?: ProviderName[];
  /** Cache TTL in milliseconds. */
  cacheTtlMs?: number;
  /** maxResults used when the caller omits it (default 10). */
  defaultMaxResults?: number;
  /** Full router config escape hatch (tests: inject fake providers). */
  routerConfig?: Partial<RouterConfig>;
}

/** The tool definition shape every platform's `tool()` helper accepts. */
export interface OmnisearchToolDefinition {
  description: string;
  args: typeof omnisearchInputSchema;
  execute(args: OmnisearchToolArgs, context: unknown): Promise<string>;
}

export type OmnisearchToolFn<TTool = unknown> = (
  definition: OmnisearchToolDefinition,
) => TTool;

export interface OmnisearchHooks<TTool> {
  tool: { [OMNISEARCH_TOOL_NAME]: TTool };
}

/**
 * Build the platform-agnostic plugin hooks: a single `omnisearch` tool whose
 * `execute` runs the search router. The platform wrapper injects its own
 * `tool()` helper (OpenCode's and Kilocode's are structurally identical), so
 * this module depends on neither SDK.
 */
export function createPluginHooks<TTool>(
  options: OmnisearchPluginOptions,
  toolFn: OmnisearchToolFn<TTool>,
): OmnisearchHooks<TTool> {
  const router = createRouter({
    primary: options.provider ?? "brave",
    fallback: options.fallback,
    cacheTtlMs: options.cacheTtlMs,
    ...options.routerConfig,
  });

  const definition: OmnisearchToolDefinition = {
    description: OMNISEARCH_TOOL_DESCRIPTION,
    args: omnisearchInputSchema,
    execute: async (args) => {
      const chain = buildSearchChain(args.provider, router.config.primary, options.fallback);
      const response = await router.search(
        args.query,
        { maxResults: args.maxResults ?? options.defaultMaxResults },
        chain,
      );
      return response.markdown;
    },
  };

  return { tool: { [OMNISEARCH_TOOL_NAME]: toolFn(definition) } };
}
