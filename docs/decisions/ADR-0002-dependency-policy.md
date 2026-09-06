# ADR-0002: Dependency policy — strict zero-new-dependencies, exceptions by ADR

Date: 2026-09-02
Status: Accepted

## Context

Omnisearch has held a zero-new-dependencies line since v1: runtime deps are
only `@modelcontextprotocol/sdk`, `openai` (also used by Moonshot/Perplexity),
and `zod`; `@anthropic-ai/sdk` is optional. Hand-rolled helpers cover
everything else (FNV-1a hashing, HTML stripping, LRU cache, token bucket).
Some future features have a genuine dependency payoff — e.g. readable-text
extraction for a fetch tool, or sqlite for a persistent cache.

## Decision

**Default: no new runtime dependencies.** A dependency may be added for a
specific feature only with an ADR that justifies it (what it replaces, its
maintenance/security posture, bundle-size impact, and why hand-rolling is
wrong). The exception ADR is merged before the dependency lands.

## Consequences

- Small install footprint and audit surface, which matters for an
  npx-distributed agent tool.
- Each future dependency arrives with a recorded rationale instead of
  accumulating silently.
