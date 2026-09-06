# ADR-0005: CI — GitHub Actions on ubuntu + windows

Date: 2026-09-02
Status: Accepted

## Context

The repo has no CI; nothing gates merges to main. The project is developed
on Windows and targets npx consumers on any OS.

## Decision

GitHub Actions workflow on push/PR to `main`: bun pinned to 1.x, jobs on
`ubuntu-latest` and `windows-latest`, each running `bun install
--frozen-lockfile`, `bun test`, `bun run typecheck`, `bun run build`.
No Node-matrix yet (the built bin's Node compatibility is probed manually;
add a matrix when consumers report issues).

## Consequences

- Merges are gated on both primary platforms.
- Frozen-lockfile CI catches dependency drift.
