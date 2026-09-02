# Omnisearch

Universal multi-provider web search for AI coding agents. One MCP server plus
thin native plugin wrappers for **OpenCode** and **Kilocode** — decoupled from
the coding model, so **any LLM can search via any provider**.

v1 providers: **Brave**, **Anthropic (Claude)**, **OpenAI**, **Moonshot (Kimi)**.

## Why not model-bound search

Search via LLM providers (Anthropic/OpenAI/Moonshot) only works on models with
native web search. Omnisearch exposes search as a plain tool, so a coding agent
running on any model can use any provider — including pure search APIs that
don't involve an LLM at all.

### Cost warning

| Provider | Mechanism | Relative cost per search |
|---|---|---|
| **Brave** | Pure REST search API | **Cheapest** — free tier available, then ~$3–5/1k queries |
| **Anthropic** | Full LLM call with `web_search` tool | **Expensive** — a full Claude API call plus search fees |
| **OpenAI** | Full LLM call with Responses API `web_search` | **Expensive** — a full GPT-4o API call plus tool fees |
| **Moonshot** | Full LLM call with builtin `$web_search` | **Expensive** — a full Kimi API call |

**Put Brave first** in your chain and use LLM providers as fallbacks only.

## Differentiators vs. `opencode-websearch`

- Works across agents (OpenCode, Kilocode, and any MCP client — Windsurf,
  Cursor, Claude Code), not OpenCode-only
- Not model-bound: any model can search via any provider
- Result caching (in-memory LRU + TTL)
- Provider fallback chains
- Per-provider rate limiting (token bucket)
- Normalized structured markdown output with a Sources footer

Google, SearXNG, Perplexity, and Tavily are deferred to v1.1.

## Packages

| Package | Purpose |
|---|---|
| `@omnisearch/mcp-server` | MCP server + `omnisearch` CLI (core) |
| `@omnisearch/shared` | Platform-agnostic plugin logic |
| `omnisearch-opencode` | Native OpenCode plugin |
| `omnisearch-kilocode` | Native Kilocode plugin |

## Quick start (MCP server)

```jsonc
// OpenCode — opencode.json
{
  "mcp": {
    "omnisearch": {
      "type": "local",
      "command": ["npx", "-y", "@omnisearch/mcp-server"],
      "environment": { "BRAVE_API_KEY": "<your-key>" }
    }
  }
}
```

```jsonc
// Windsurf — ~/.codeium/windsurf/mcp_config.json  (same shape for Cursor's .cursor/mcp.json and Claude Code's .mcp.json)
{
  "mcpServers": {
    "omnisearch": {
      "command": "npx",
      "args": ["-y", "@omnisearch/mcp-server"],
      "env": { "BRAVE_API_KEY": "<your-key>", "OMNISEARCH_PROVIDER": "brave" }
    }
  }
}
```

Then ask your agent: *"Use omnisearch to find the latest TypeScript release"*.

## Native plugins

```jsonc
// OpenCode — opencode.json
{ "plugin": [["omnisearch-opencode", { "provider": "brave" }]] }

// Kilocode — kilo.jsonc
{ "plugin": [["omnisearch-kilocode", { "provider": "brave" }]] }
```

## CLI test mode

```bash
omnisearch search "latest typescript release" --provider brave --max 5
# prints normalized markdown: numbered results + ## Sources
```

## Configuration (environment)

| Variable | Meaning | Default |
|---|---|---|
| `BRAVE_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `MOONSHOT_API_KEY` | Provider API keys (validated on provider load) | — |
| `OMNISEARCH_PROVIDER` | Primary provider | `brave` |
| `OMNISEARCH_FALLBACK` | Comma-separated fallback chain | — |
| `OMNISEARCH_RATE_LIMIT_<PROVIDER>` | `<limit>/<windowSeconds>`, e.g. `15/60` | brave `15/60`, LLM providers `10/60` |
| `OMNISEARCH_CACHE_TTL_MS` | Result cache TTL | `300000` |
| `OMNISEARCH_CACHE_MAX_ENTRIES` | Result cache capacity | `500` |

The `@anthropic-ai/sdk` is an optional dependency: Brave (and Moonshot/OpenAI,
via the bundled `openai` SDK) work with `npm install --omit=optional`; the
Anthropic provider then fails with a clear install hint.

## Development

```bash
bun install          # link workspaces
bun test             # run all tests
bun run build        # tsc builds for all packages
bun run typecheck    # tsc --noEmit for both active packages
```

Monorepo layout (bun workspaces):

```
packages/
  mcp-server/        # core: providers, router, cache, rate limiter, MCP + CLI
  shared/            # createPluginHooks — platform-agnostic plugin logic
  opencode-plugin/   # @opencode-ai/plugin wrapper
  kilocode-plugin/   # @kilocode/plugin wrapper
```
