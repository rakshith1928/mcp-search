# @omnisearch/mcp-server

Universal multi-provider web search as an MCP server and CLI — Brave,
Anthropic, OpenAI, Moonshot, Tavily, Google, SearXNG, Perplexity — with
caching, per-provider rate limiting, retry, fallback chains, and parallel
fan-out.

```bash
# MCP server (stdio) — configure in any MCP client
npx -y @omnisearch/mcp-server

# One-shot CLI
npx -y @omnisearch/mcp-server search "latest typescript release" --provider brave
```

Set provider keys as environment variables (`BRAVE_API_KEY`,
`TAVILY_API_KEY`, …). Full docs, configuration, and cost guidance:
https://github.com/<your-org>/omni-search#readme
