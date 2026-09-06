# ADR-0007: Markdown escaping — titles only

Date: 2026-09-02
Status: Accepted

## Context

`normalizeResults` interpolates provider-supplied titles into
`[title](url)` links unescaped (parked review finding from v1.1). A title
containing `[`, `]`, `(`, or `)` breaks the link rendering; provider output
is also an untrusted-input (prompt-injection) surface.

## Decision

Escape the markdown-significant characters (`[`, `]`, `(`, `)`) in result
**titles** inside the normalizer. URLs stay as-is: providers return clean
hrefs, and the existing review found no URL-injection path. A scheme
allowlist for URLs was considered and deferred — revisit if a provider ever
echoes user-controlled URLs into its results.

## Consequences

- Malformed titles can no longer break the markdown structure of the whole
  response.
- The worst-case injection surface (link text) is neutralized; snippet text
  remains raw (it is quoted prose, not link syntax).
