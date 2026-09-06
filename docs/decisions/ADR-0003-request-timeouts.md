# ADR-0003: Global request timeout — 30s default via OMNISEARCH_TIMEOUT_MS

Date: 2026-09-02
Status: Accepted

## Context

No provider call has a timeout today. A hung upstream stalls a fallback
chain or a parallel fan-out indefinitely (fetch has no default timeout).
LLM-backed providers (anthropic, openai, moonshot, perplexity) can
legitimately take 10-20s; pure REST providers return in seconds.

## Decision

Every provider HTTP call (fetch paths and SDK paths) gets an
`AbortSignal`-based timeout with a **global default of 30 seconds**,
overridable via `OMNISEARCH_TIMEOUT_MS` (positive integer, validated like
the other numeric env vars). No per-provider knobs unless a real need
appears. A timed-out call is a retryable failure (see ADR-0004) and then a
normal chain fallback.

## Consequences

- Worst-case single-provider latency is bounded; worst-case full-chain
  latency becomes computable.
- LLM-backed searches fit comfortably inside the default; operators can
  raise it globally if needed.
