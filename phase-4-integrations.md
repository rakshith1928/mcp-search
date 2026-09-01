# Phase 4: Integrations & Platform Wrappers

## Context
Wire the core system to the outside world: expose it as a standalone MCP server (with a CLI test mode), and wrap it as native plugins for OpenCode and Kilocode.

## Approach
1. **MCP Server Entry (`packages/mcp-server/src/server.ts` & `index.ts`)**
   - Use `@modelcontextprotocol/sdk` to create an `McpServer`.
   - Register the `omnisearch` tool with Zod schema (`query`, `maxResults`, `provider`, etc.).
   - In `index.ts`:
     - Parse CLI args. If `process.argv[2] === "search"`, run a one-shot query to stdout (CLI test mode).
     - Otherwise, connect the server via `StdioServerTransport`.

2. **Shared Native Plugin Logic (`packages/shared/src/plugin-impl.ts`)**
   - Export `createPluginHooks(options, toolFn)`.
   - Instantiate the router using `options` (provider, fallback, cache settings).
   - Return the `Hooks` object containing the `omnisearch` tool definition (using the injected `toolFn`).

3. **OpenCode Native Plugin (`packages/opencode-plugin/`)**
   - Create `src/index.ts`.
   - Import `tool` from `@opencode-ai/plugin`.
   - Call `createPluginHooks` and export the result as default.
   - Configure peer dependency `>=1.0.0`.

4. **Kilocode Native Plugin (`packages/kilocode-plugin/`)**
   - Create `src/index.ts`.
   - Import `tool` from `@kilocode/plugin`.
   - Call `createPluginHooks` and export the result as default.
   - Configure peer dependency `>=1.0.0`.

## Verification
- Run the CLI mode: `npx @omnisearch/mcp-server search "test" --provider brave` and verify stdout formatting.
- Pipe JSON-RPC to the MCP server: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | bun run src/index.ts` and verify the `omnisearch` tool is returned.