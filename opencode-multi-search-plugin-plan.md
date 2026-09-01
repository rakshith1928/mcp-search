# Universal Multi-Provider Web Search — MCP Server + Native Plugin Wrappers

## Context

Build a universal multi-provider web search system that works across all major AI coding agents (OpenCode, Kilocode, Windsurf, Cursor). The core is an MCP server with 4 v1 providers (Brave, Anthropic Claude, OpenAI, MoonshotAI/Kimi) — each decoupled from the coding model so any LLM can search via any provider. Thin native plugin wrappers for OpenCode and Kilocode give zero-config UX. Differentiates from `opencode-websearch` on six axes: universal agent support (not OpenCode-only), not model-bound (any model can use any search provider), result caching with LRU+TTL, provider fallback chains, rate limiting per provider, and normalized structured output. Tavily, Google, SearXNG, and Perplexity deferred to v1.1.

## Feasibility (grounded in source code)

### OpenCode plugin system — confirmed working

OpenCode (`github.com/anomalyco/opencode`) exposes three extension mechanisms for web search:

1. **`Hooks.tool`** — Register custom tools the LLM can call. Defined in `packages/plugin/src/index.ts`. The tool registry merges builtin and custom arrays: `return [...s.builtin, ...s.custom]` (`packages/opencode/src/tool/registry.ts` line ~260). A custom tool with a different name (e.g. `"web-search"`) coexists with the builtin `websearch`. To disable the builtin: `"tools": { "websearch": false }` in `opencode.json`.

2. **`tool.execute.before` / `tool.execute.after`** — Intercept/modify args and results around any tool call. Cannot short-circuit (cannot prevent execution or return alternative result).

3. **MCP servers** — Configured in `opencode.json` under `"mcp"` key with `"type": "local"` (stdio subprocess) or `"type": "remote"` (SSE HTTP). MCP tools appear alongside builtin tools.

The existing community plugin `opencode-websearch` (`github.com/emilsvennesson/opencode-websearch`) proves the pattern works: it registers `Hooks.tool["web-search"]` using `tool()` from `@opencode-ai/plugin`, supports Anthropic/OpenAI/ChatGPT/Copilot/Moonshot providers.

### Kilocode plugin system — confirmed identical API

Kilocode (`github.com/Kilo-Org/kilocode`) is a fork of OpenCode. Its plugin SDK (`packages/plugin/src/tool.ts` and `packages/plugin/src/index.ts`) is **structurally identical** — same `Hooks` interface, same `tool()` helper, same `ToolContext`, same `Plugin` type signature. The only differences are import names (`@kilocode/plugin` vs `@opencode-ai/plugin`, `createKiloClient` vs `createOpencodeClient`). Kilocode also supports MCP servers and reads `.kilo/tool/` in addition to `.opencode/tool/`.

### MCP — universal cross-agent compatibility

MCP servers work in OpenCode, Kilocode, Windsurf, Cursor, and Claude Code via JSON-RPC 2.0 over stdio or SSE. Each agent has its own config location but the same protocol:
- **OpenCode**: `opencode.json` → `"mcp": { "server-name": { "type": "local", "command": [...] } }`
- **Kilocode**: `kilo.jsonc` or `cline_mcp_settings.json`
- **Windsurf**: `~/.codeium/windsurf/mcp_config.json` → `{ "mcpServers": { "name": { "command": "...", "args": [...], "env": {...} } } }`
- **Cursor**: `.cursor/mcp.json`
- **Claude Code**: `.mcp.json` or `claude mcp add`
### Gaps in opencode-websearch (concrete differentiation)

| Gap | Detail |
|---|---|
| **OpenCode-only** | Peer-depends on `@opencode-ai/plugin`. No Kilocode, Claude Code, Cursor support. |
| **Missing providers** | No Brave, Tavily, SearXNG, Perplexity, Google. |
| **Model-bound** | Only works via LLM providers with built-in search tools. Cannot search on models without native web search. |
| **No caching** | Repeated identical queries make full network calls. |
| **No fallback chains** | `pickModel()` selects one provider tier; if execution fails (429/500), no retry with another provider. |
| **No parallel search** | Single sequential query per invocation. |
| **No configurable parameters** | No domain restrictions, region, date ranges, or max results control. |
| **Zero test coverage** | No test framework, no test directory, no `test` script in package.json. |
| **ChatGPT titles missing** | ChatGPT SSE streams lack title fields; sources show raw URLs. |

## Execution Plan

The implementation is split into 5 sequential phases. Each phase has its own task list in a separate markdown file:

1. **[Phase 1: Project Scaffold & Infrastructure](local://phase-1-infrastructure.md)**
   - Monorepo setup (Bun workspaces)
   - Core interfaces (`SearchResult`, `ProviderName`, etc.)
   - Shared plugin module scaffold

2. **[Phase 2: Core Search Providers](local://phase-2-providers.md)**
   - Brave, Anthropic, OpenAI, and Moonshot implementations
   - Lazy-loading provider registry

3. **[Phase 3: Core Features & Routing](local://phase-3-core-features.md)**
   - Token-bucket rate limiter
   - LRU cache with TTL
   - Result normalizer (HTML stripping, markdown formatting)
   - Central search router with fallback logic

4. **[Phase 4: Integrations & Platform Wrappers](local://phase-4-integrations.md)**
   - MCP Server entry point (stdio)
   - CLI test mode
   - OpenCode native plugin
   - Kilocode native plugin

5. **[Phase 5: Verification & End-to-End Testing](local://phase-5-testing.md)**
   - E2E testing in OpenCode, Kilocode, and Windsurf
   - Live fallback and lazy loading verification

## Critical files & anchors

| File | Symbol/Region | Why |
|---|---|---|
| `opencode-websearch/src/index.ts` | `pickModel()`, `loadResolutions()` | Reference for model-bound selection pattern we're deliberately avoiding |
| `opencode-websearch/src/providers/registry.ts` | `PROVIDER_TYPES_BY_ID` | Shows the model-bound detection we're replacing with direct API key detection |
| `@modelcontextprotocol/sdk/server/mcp.js` | `McpServer`, `server.tool()` | MCP server SDK entry point for tool registration |
| `anomalyco/opencode/packages/plugin/src/tool.ts` | `tool()`, `ToolDefinition` | The exact helper our OpenCode wrapper must use |
| `Kilo-Org/kilocode/packages/plugin/src/tool.ts` | `tool()`, `ToolDefinition` | Confirmed identical API — validates the dual-target approach |

## Verification

### CLI test mode (Step 2 — verify first)

```bash
cd C:/tmp/omnisearch/packages/mcp-server
BRAVE_API_KEY=<real-key> bun run src/index.ts search "latest typescript release" --provider brave
# Expected: normalized markdown output with numbered results, URLs, snippets, and Sources section
```

```bash
bun run src/index.ts search
# Expected: stderr "Usage: omnisearch search <query> [--provider <name>] [--max <n>]", exit code 1
```

### Unit tests (Step 5)

```bash
cd C:/tmp/omnisearch/packages/mcp-server
bun test
# Expected: all tests pass — providers, cache, rate-limiter, router, normalizer, CLI, integration
```

### Rate limiting verification

```bash
# Run 10 rapid searches — verify rate limiter delays after bucket empties
BRAVE_API_KEY=<key> OMNISEARCH_RATE_LIMIT_BRAVE=3/60 bun run src/index.ts search "test1" --provider brave
# First 3 return immediately, 4th blocks ~20 seconds before returning
```

### Fallback chain

```bash
# No BRAVE_API_KEY set, primary=brave, fallback=tavily
TAVILY_API_KEY=<key> OMNISEARCH_PROVIDER=brave OMNISEARCH_FALLBACK=tavily bun run src/index.ts search "test"
# Expected: output shows "via tavily" (brave failed, fell back to tavily)
```

### MCP server standalone

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | BRAVE_API_KEY=test bun run src/index.ts
# Expected: JSON-RPC response containing omnisearch tool with full schema
```

### OpenCode plugin

```bash
# In any project directory, add to opencode.json:
# "plugin": [["omnisearch-opencode", { "provider": "brave" }]]
# Set: BRAVE_API_KEY=<real-key>
opencode
# Ask: "Use omnisearch to find the latest TypeScript release"
# Expected: agent calls omnisearch, returns normalized markdown with titles/URLs/snippets
```

### Kilocode plugin

```bash
# Same as above but kilo.jsonc + kilo CLI
kilo
# Ask: "Use omnisearch to find the latest TypeScript release"
# Expected: agent calls omnisearch, returns normalized results
```

### Windsurf / Cursor (MCP server directly)

```jsonc
// .mcp.json
{
  "mcpServers": {
    "omnisearch": {
      "command": "npx",
      "args": ["-y", "@omnisearch/mcp-server"],
      "env": { "BRAVE_API_KEY": "...", "OMNISEARCH_PROVIDER": "brave" }
    }
  }
}
```

Then the agent sees `omnisearch` as an available MCP tool and can call it.

### Cache verification

```bash
# Run same query twice rapidly — second should show cached: true in metadata
BRAVE_API_KEY=<key> bun run src/index.ts search "typescript release" --provider brave
BRAVE_API_KEY=<key> bun run src/index.ts search "typescript release" --provider brave
# Expected: second call returns instantly. In test mode cache won't persist (separate processes),
# but the unit test verifies cache behavior within a process.
```

## Assumptions & contingencies

- **Package names**: `@omnisearch/mcp-server`, `omnisearch-opencode`, `omnisearch-kilocode`. If `omnisearch` is taken on npm, use `@<your-username>/omnisearch-*` scoped packages.
- **Shared code between wrappers**: The two `tool()` functions have identical type signatures (verified in OpenCode and Kilocode source). The shared module passes `tool` as a parameter. If Kilocode diverges the `ToolContext` type, the shared module takes a generic and each wrapper casts — low probability since Kilocode tracks OpenCode upstream.
- **MCP SDK version**: Use `@modelcontextprotocol/sdk@latest`. `McpServer` and `StdioServerTransport` are stable. If the SDK changes its API, only `server.ts` needs updating.
- **Anthropic/OpenAI cost**: Each search via these providers is a full LLM API call. Auto-detection priority puts Brave and Tavily first (pure search APIs, orders of magnitude cheaper). The README should document cost differences prominently.
- **v1.1 providers**: Google, SearXNG, and Perplexity are deferred. The `ProviderName` union type is extended by adding to the literal — no breaking change. Each new provider is one file implementing `SearchProvider` + one entry in `PROVIDER_LOADERS`. If a user requests a deferred provider before v1.1, the error message says `"Provider 'google' is not available in this version. Available: brave, tavily, anthropic, openai"`.
- **Optional SDK dependencies**: `@anthropic-ai/sdk` and `openai` are in `optionalDependencies`. If a user doesn't install them (e.g. `npm install --omit=optional`), the lazy loader throws a clear error: `"Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk"`. Brave and Tavily providers use only `fetch` and always work.

