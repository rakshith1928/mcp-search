import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveRouterConfig } from "./router/config.js";
import { createRouter, type Router, type RouterConfig } from "./router/index.js";
import {
  OMNISEARCH_TOOL_DESCRIPTION,
  OMNISEARCH_TOOL_NAME,
  omnisearchInputSchema,
} from "./tool-schema.js";

/**
 * Build the omnisearch MCP server: one `omnisearch` tool backed by the
 * search router. Pass `providers` for tests, or rely on the lazy registry +
 * environment in production.
 */
export function createOmnisearchServer(config: Partial<RouterConfig> = {}): {
  server: McpServer;
  router: Router;
} {
  const router = createRouter(resolveRouterConfig(config));
  const server = new McpServer({ name: "omnisearch", version: "0.2.0" });

  server.registerTool(
    OMNISEARCH_TOOL_NAME,
    {
      title: "Omnisearch",
      description: OMNISEARCH_TOOL_DESCRIPTION,
      inputSchema: omnisearchInputSchema,
    },
    async ({ query, maxResults, provider, parallel }) => {
      const response = await router.search(query, { maxResults, provider, parallel });
      return { content: [{ type: "text", text: response.markdown }] };
    },
  );

  return { server, router };
}

/** Connect the omnisearch MCP server over stdio (the default MCP transport). */
export async function startStdioServer(config: Partial<RouterConfig> = {}): Promise<void> {
  const { server } = createOmnisearchServer(config);
  await server.connect(new StdioServerTransport());
}
