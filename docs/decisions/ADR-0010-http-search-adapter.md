# ADR-0010: One HTTP-search-provider adapter

Date: 2026-09-02
Status: Accepted

## Context

Architecture review candidate 3 (2026-09-02): the four fetch-based providers
(brave, tavily, google, searxng) verbatim-repeat the response contract —
`!ok → slice(200) → standardized throw`, result mapping with HTML
stripping, signal forwarding, fetchImpl resolution — and each restated its
own DEFAULT_MAX_RESULTS. The error-message shape is a cross-module
contract: the router's `isTransientSearchError` regex-matches it. Two real
variations exist (google's key redaction, searxng's 403 hint) and two
inconsistencies (server-side vs client-side maxResults clamping).

## Decision

`providers/http-search.ts` exports `createHttpSearchProvider({ name,
buildRequest, parseResponse, errorHint? })`:

- The adapter owns the contract: fetchImpl resolution, abort-signal
  forwarding, `!ok → redact `key=` → slice(200) → standardized throw`
  (universal credential redaction; `errorHint` decorates per provider),
  client-side maxResults slicing (default 10, single-homed), and a
  `clampMaxResults(value, cap)` helper for providers that clamp
  server-side.
- Providers become request builders + response parsers plus their
  credential validation. Provider files, factory names, and behavior are
  unchanged (the 4 provider test suites pass unmodified).

Pure internal refactor → patch version (0.4.1). Hand-rolled per
ADR-0002 (no new dependencies).

## Consequences

- The classifier contract is asserted in one place.
- DuckDuckGo (v1.3) becomes a builder+parser; `omnisearch_fetch` inherits
  the timeout/error/redaction conventions.
