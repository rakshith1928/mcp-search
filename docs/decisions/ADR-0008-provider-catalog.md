# ADR-0008: Provider facts live in one catalog

Date: 2026-09-02
Status: Accepted

## Context

"One row per provider" (name, env var, kind, default rate limit, loader) was
stated six times across five files (types.ts union, providers/index.ts
AVAILABLE_PROVIDERS + PROVIDER_LOADERS, util.ts ENV_BY_PROVIDER,
rate-limiter.ts DEFAULT_RATE_LIMITS, tool-schema.ts zod enum). Adding a
provider was a six-site edit with nothing enforcing sync. Found by the
architecture review (2026-09-02, candidate 1); passes the deletion test —
delete the descriptor and complexity scatters back to those six sites.

## Decision

A single **provider catalog** (`providers/catalog.ts`): one `as const`
descriptor per provider — `{ name, envKey, kind: "fetch" | "llm",
rateLimit, load }`. The ProviderName union is fully derived from the table
(`typeof PROVIDERS[number]["name"]`), so the compiler rejects any provider
claim the table does not carry. Loaders merge into the table
(PROVIDER_LOADERS disappears). AVAILABLE_PROVIDERS, ENV_BY_PROVIDER,
DEFAULT_RATE_LIMITS, and the tool-schema zod enum become derived views.
The catalog is public package surface (`api.ts`) — v1.3's `doctor`
consumes it.

## Consequences

- Adding a provider: one row (+ its provider module).
- Provider facts have one testable home; derivation-integrity tests pin
  the views to the table.
- `kind` is inert metadata until `doctor` consumes it in v1.3.
