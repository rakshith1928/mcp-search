# ADR-0004: Retry transient failures — 2 in-provider retries, exponential backoff + jitter

Date: 2026-09-02
Status: Accepted

## Context

Any transient failure (5xx, 429, network error, timeout) currently
permanently costs the provider for that call: the chain moves on. A blip on
the primary degrades results even though a retry 500ms later would succeed.

## Decision

The router retries a provider's search **up to 2 times** (3 attempts total)
on **transient failures only**: HTTP 5xx, 429, network errors, and timeouts.
Permanent failures (other 4xx) fall through to the next chain entry
immediately. Backoff is exponential with jitter (~500ms, ~1s). Each retry
re-acquires a rate-limit token (no limiter bypass). Retry happens
**within the provider before** the fallback chain advances.

## Consequences

- Transient blips stop degrading results.
- Worst-case call latency grows: with timeouts (ADR-0003) a fully failing
  provider can consume ~3 x 30s + backoff before the chain moves on; the
  fallback order should still put the most reliable provider first.
- 429 responses interact with the token bucket: the limiter already spaces
  requests, so a 429 after acquiring a token signals upstream rate
  pressure, which backoff absorbs.
