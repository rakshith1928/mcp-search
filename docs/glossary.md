# Omnisearch Glossary

Living document — terms are added as decisions land (grill-with-docs).

| Term | Meaning |
|---|---|
| **Provider** | A `SearchProvider` implementation (one file) that executes web searches for one upstream service. 8 in v1.1: brave, anthropic, openai, moonshot, tavily, google, searxng, perplexity. |
| **Registry** | `providers/index.ts` — lazily dynamic-imports a provider's module the first time that provider is requested; caches default-constructed instances. `AVAILABLE_PROVIDERS` and the loader map are derived views over the catalog (loaders are total since ADR-0008). |
| **Router** | `createRouter(config)` — central search path: cache check → resolve provider → acquire rate-limit token → search, with ordered fallback chain; also owns parallel fan-out. |
| **Fallback chain** | `[primary, ...fallback]` tried in order on failure; each attempt caches under its own key, fallback results are marked `fellBack` with `requestedProvider` set. |
| **Parallel fan-out** | Opt-in `parallel` mode: `Promise.allSettled` over participant providers, each with its own limiter and cache key. |
| **Participants** | Providers attempted in parallel mode; resolved from `RouterConfig.parallelParticipants` (or `OMNISEARCH_PARALLEL`), else every provider whose env credential is set (`hasProviderConfig`). |
| **Round-robin merge** | Parallel result merge: rank-1 of each provider, then rank-2, etc., deduped by exact URL (first occurrence wins), capped at `maxResults`. |
| **Merged cache key** | `parallel:<fnv(sorted participants) + query + options>` — order-insensitive composite key for the merged response. |
| **Via label** | Header label in normalized markdown; parallel mode uses `parallel: <names>`. |
| **Failure note** | Trailing markdown line `Note: N provider(s) failed: <names>` appended by `appendFailureNote` in parallel mode. |
| **CacheValue provenance** | Cache entries record `provider`/`fellBack`; parallel per-participant reuse requires `!fellBack && provider === name` so fallback results are never credited to the requested primary. |
| **Token bucket** | Per-provider rate limiter with continuous refill (`RateLimiter`); defaults per provider, overridable via `OMNISEARCH_RATE_LIMIT_<PROVIDER>=<limit>/<windowSeconds>`. |
| **CLI test mode** | `omnisearch search "query" [...]` one-shot mode printing normalized markdown to stdout; no args = MCP stdio server. |
| **Provider catalog** | `providers/catalog.ts` — one `as const` descriptor per provider ({ name, envKey, kind, rateLimit, load }); the ProviderName union, registry views, env map, rate-limit defaults, and tool-schema enum all derive from it (ADR-0008). |
| **Normalizer** | `normalizeResults` — `SearchResult[]` → markdown (`## Web Search Results`, numbered titled links with stripped snippets, `## Sources` footer). |

## ADR index

- [ADR-0001](decisions/ADR-0001-v1.2-scope-reliability-first.md) — v1.2 scope: reliability first, npm polish, minor release
- [ADR-0002](decisions/ADR-0002-dependency-policy.md) — strict zero-new-dependencies, exceptions by ADR
- [ADR-0003](decisions/ADR-0003-request-timeouts.md) — global 30s request timeout via OMNISEARCH_TIMEOUT_MS
- [ADR-0004](decisions/ADR-0004-retry-with-backoff.md) — 2 in-provider retries on transient failures, exponential backoff + jitter
- [ADR-0005](decisions/ADR-0005-ci-github-actions.md) — CI: GitHub Actions, ubuntu + windows, bun 1.x
- [ADR-0006](decisions/ADR-0006-npm-publication.md) — npm publication: all four packages, maintainer runs bun publish
- [ADR-0007](decisions/ADR-0007-markdown-escaping.md) — markdown escaping: titles only, URLs as-is
- [ADR-0008](decisions/ADR-0008-provider-catalog.md) — provider facts live in one catalog
