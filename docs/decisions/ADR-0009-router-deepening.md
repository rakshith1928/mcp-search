# ADR-0009: The Router owns routing intent; one options interface

Date: 2026-09-02
Status: Accepted

## Context

Architecture review candidate 2 (2026-09-02): router.ts (363 lines) held
seven concerns in one closure, with the ADR-0004 retry loop duplicated
verbatim (single + parallel paths), SearchResponse assembled four times,
and chain-building leaked across the seam — three call sites repeated the
`buildSearchChain(override, primary, fallback)` dance before calling
`search(query, options, chain?, parallel?)`. The next features (per-call
participants, streaming, score merging) would each have landed twice.

## Decision

- The Router's interface becomes `search(query, options)` where options =
  `{ maxResults?, signal?, provider?, parallel?, participants? }`.
  `provider` is the per-call primary override; `participants` is an
  explicit parallel list (wins over `parallel: true`'s env scan); the
  tool schema's public `parallel: boolean` is unchanged.
- Chain-building is absorbed (private); `buildSearchChain` leaves the
  public surface (package unpublished, no external consumers).
- One `attemptWithRetry` single-homes the ADR-0004 loop (semantics
  verbatim); one response builder replaces the four assembly sites.
- The module splits into `router/`: index.ts (createRouter + shared
  RouterContext), attempts.ts (classifier, backoff, attemptWithRetry),
  paths.ts (single + parallel paths), response.ts (CacheValue + builder).
- Version 0.4.0 (public-surface change on an unpublished package; no
  behavior change — all behavioral tests survive with call-site updates).

## Consequences

- Streaming, score-aware merging, and per-call participants land in one
  place (paths/attempts), not two.
- Callers pass intent and stop touching routing mechanics.
- `import "./router.js"` sites update to `./router/index.js`.
