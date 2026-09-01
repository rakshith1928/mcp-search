# Phase 2: Core Search Providers

## Context
Implement the four search providers (Brave, Anthropic, OpenAI, Moonshot) and the dynamic lazy-loading provider registry.

## Approach
1. **Implement Brave Provider (`packages/mcp-server/src/providers/brave.ts`)**
   - Implement `SearchProvider` using the pure REST API (`api.search.brave.com/res/v1/web/search`).
   - Use `fetch` (no SDKs). Ensure it throws on non-200 responses.
   - Map response into `SearchResult[]`.

2. **Implement Anthropic Provider (`packages/mcp-server/src/providers/anthropic.ts`)**
   - Use `@anthropic-ai/sdk`.
   - Call `client.messages.create` with model `claude-sonnet-4-20250514`.
   - Define `tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }]`.
   - Parse `content` blocks looking for `web_search_tool_result` to extract titles and URLs.

3. **Implement OpenAI Provider (`packages/mcp-server/src/providers/openai.ts`)**
   - Use `openai` SDK.
   - Call `client.responses.create` with model `gpt-4o`.
   - Use `tools: [{ type: "web_search" }]`.
   - Extract citations/annotations from the response.

4. **Implement Moonshot Provider (`packages/mcp-server/src/providers/moonshot.ts`)**
   - Use `openai` SDK with `baseURL: "https://api.moonshot.cn/v1"`.
   - Implement the multi-turn loop (up to 8 turns) handling the `$web_search` builtin function tool.
   - Set `thinking: { type: "disabled" }` on the request.
   - Extract citations from `message.annotations[].url_citation`.

5. **Implement Lazy Registry (`packages/mcp-server/src/providers/index.ts`)**
   - Map `ProviderName` to dynamic imports (`await import("./brave.js")`).
   - Implement `getProvider(name)` that caches instantiated providers.
   - Implement `requireEnv(key)` to validate API keys on load.

## Verification
- Create mock tests for `brave.ts` verifying the correct API URL and params are sent.
- Create tests for `index.ts` proving that an uninstalled optional SDK only throws when its specific provider is requested.