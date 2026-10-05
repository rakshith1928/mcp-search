# CLAUDE.md

Read and follow **[AGENTS.md](AGENTS.md)** — it is the single source of
guidance for this repository (commands, module map, ADR-backed rules,
conventions). Nothing here overrides it.

Quick orientation:

- Bun monorepo; run `bun install && bun test` from the root.
- Adding a provider starts in `packages/mcp-server/src/providers/catalog.ts`.
- Routing/retry/caching logic lives in `packages/mcp-server/src/router/`.
- Decisions are recorded as ADRs in `docs/decisions/`; terms in
  `docs/glossary.md`.
