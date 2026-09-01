# Phase 3: Core Features & Routing

## Context
Build the intermediate layers that make the plugin robust: result normalization, rate limiting, caching, and the central search router.

## Approach
1. **Result Normalizer (`packages/mcp-server/src/normalize.ts`)**
   - Implement `normalizeResults(query, provider, results) -> string`.
   - Convert `SearchResult[]` into markdown: `## Web Search Results`, numbered lists with stripped HTML snippets, and a `## Sources` footer.

2. **Rate Limiter (`packages/mcp-server/src/rate-limiter.ts`)**
   - Implement `RateLimiter` class using a token-bucket algorithm (`acquire()` blocks via Promise/setTimeout until tokens are available).
   - Set defaults (e.g., Brave 15/min) and support parsing `OMNISEARCH_RATE_LIMIT_<PROVIDER>` env vars.

3. **LRU Cache (`packages/mcp-server/src/cache.ts`)**
   - Implement an in-memory `Map`-based LRU cache with TTL.
   - Cache keys must hash provider, query, and options.

4. **Search Router (`packages/mcp-server/src/router.ts`)**
   - Combine the pieces: `createRouter(config)`.
   - Logic:
     1. Check Cache -> return hit.
     2. Wait on `RateLimiter.acquire()` for the selected provider.
     3. Call primary provider. If it throws, iterate through `fallback` array.
     4. (Optional) Support `parallel` execution with `Promise.allSettled()`.
     5. Call `normalizeResults()`.
     6. Save to cache and return `SearchResponse`.

## Verification
- Unit test `rate-limiter.ts` ensuring `acquire()` blocks appropriately when budget is exhausted.
- Unit test `cache.ts` ensuring old keys are evicted when max entries are reached.
- Unit test `router.ts` testing the fallback mechanism (mocking a primary failure and confirming the fallback is invoked).