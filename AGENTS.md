# AGENTS.md — guidance for coding agents working in this repo

Omnisearch is a universal multi-provider web search system: an MCP server
(`@omnisearch/mcp-server`) plus thin native plugins for OpenCode and
Kilocode, built as a bun-workspace monorepo in TypeScript.

## Commands

Run everything from the repo root (bun 1.x):

```bash
bun install          # link workspaces (bun.lock is authoritative; CI uses --frozen-lockfile)
bun test             # whole-suite unit tests (bun:test, co-located *.test.ts)
bun run typecheck    # tsc --noEmit for all four packages
bun run build        # tsc emit for all four packages (dist/ is gitignored)
```

One-shot CLI during development: `bun run dev search "query" --provider brave`
(never hits the network in tests — provider suites inject fake `fetch`/clients).

## Module map (where changes go)

```
packages/mcp-server/src/
  providers/catalog.ts      # THE provider table: name, envKey, kind, rateLimit, load.
                            # Adding a provider = one row + its module. All views
                            # (union, env map, rate limits, zod enum) derive from it.
  providers/http-search.ts  # Adapter owning the fetch response contract (error shape,
                            # key= redaction, signal, maxResults slicing) for the four
                            # REST providers (brave/tavily/google/searxng).
  providers/sdk.ts          # SDK-loading seam (anthropic/openai loaders + install hints).
  providers/<name>.ts       # One file per provider: request builder + response parser.
  router/                   # The deep module: index.ts (createRouter + context),
                            # attempts.ts (retry/classifier), paths.ts (single + parallel),
                            # response.ts (SearchResponse builder), config.ts (env parsing).
  server.ts / cli.ts        # Thin surfaces: MCP stdio server; CLI arg parsing + I/O.
  tool-schema.ts            # The omnisearch tool's zod shape + MAX_TOOL_RESULTS.
  normalize.ts              # Markdown rendering + stripHtml + title escaping.
packages/shared/src/        # Platform-agnostic createPluginHooks(options, toolFn).
packages/{opencode,kilocode}-plugin/  # Thin wrappers injecting their platform's tool().
```

## Rules that are enforced by decision, not taste

See `docs/decisions/` (ADRs) — do not re-litigate them casually:

- **No new runtime dependencies** without an ADR (ADR-0002). Hand-roll; zod,
  the MCP SDK, and the OpenAI SDK are the existing exceptions.
- **Provider facts live only in `providers/catalog.ts`** (ADR-0008). Never
  restate a name/env/limit in another file — derive or import.
- **The retry loop exists once**, in `router/attempts.ts::attemptWithRetry`
  (ADR-0009). Transient = HTTP 5xx/429/network/timeout; the classifier
  depends on the adapter's standardized error shape — keep them in sync.
- **SearchResponse assembly exists once**, `router/response.ts::buildResponse`.
- **Titles are escaped in markdown, URLs are not** (ADR-0007).
- **Versions move together**: all five package.json files bump in the same
  commit, then `bun install` regenerates bun.lock (bun ignores version-only
  manifest edits otherwise).

## Conventions

- TypeScript NodeNext: relative imports carry `.js` extensions.
- Tests are behavior-based: inject fakes (`fetchImpl`, `client`, `sleepImpl`,
  `providers`, `limiters`) through factory options or `RouterConfig` — no
  network, no global mutation (env helpers accept an `env` parameter).
- TDD: write the failing test first; watch it fail; then implement.
- Commit style: imperative, scoped prefix (`feat:`, `fix:`, `refactor:`,
  `docs:`, `chore:`), body explains the why; phases/refactors land as one
  reviewed commit.
- Type-only imports use `import type` — this keeps the provider catalog
  cycle-free with `types.ts`.

## Domain vocabulary

`docs/glossary.md` defines the project's terms (provider catalog, router
context, attemptWithRetry, participants, via label, CacheValue provenance…).
Use those names in code and discussion.

## Publishing

Maintainer-only, in dependency order: see `docs/publish-checklist.md`.
