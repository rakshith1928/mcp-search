# ADR-0006: npm publication — all four packages, maintainer-run publish

Date: 2026-09-02
Status: Accepted

## Context

The README advertises `npx @omnisearch/mcp-server`, but nothing is
published. The controller has no npm credentials. Scoped packages
(@omnisearch/*) need public access flags; `workspace:*` deps require
`bun publish`.

## Decision

All four packages publish: `@omnisearch/mcp-server`, `@omnisearch/shared`,
`omnisearch-opencode`, `omnisearch-kilocode` (the plugins depend on shared,
so it must be public). The controller prepares everything — package
metadata/files hygiene, per-package READMEs, publish checklist,
`bun publish --dry-run` validation — and the **maintainer runs the final
`bun publish` per package** in dependency order (shared -> mcp-server ->
plugins).

## Consequences

- Publishing is a credential-only step, repeatable per release.
- Semver discipline starts now: every release bumps all workspace versions
  together (they share release cadence).
