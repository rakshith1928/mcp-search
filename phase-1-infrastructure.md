# Phase 1: Project Scaffold & Infrastructure

## Context
Set up the workspace and shared infrastructure for the `omnisearch` monorepo. This provides the foundation for the MCP server, shared plugin logic, and the native wrappers for OpenCode and Kilocode.

## Approach
1. **Initialize the Monorepo**
   - Create the directory structure:
     - `packages/mcp-server/src`
     - `packages/shared/src`
     - `packages/opencode-plugin/src`
     - `packages/kilocode-plugin/src`
   - Create root `package.json` with `"private": true` and `"workspaces": ["packages/*"]`.
   - Create root `tsconfig.base.json` with base TypeScript settings (`"module": "NodeNext"`, `"target": "ESNext"`, `"moduleResolution": "NodeNext"`).

2. **Setup `mcp-server` Package**
   - Create `packages/mcp-server/package.json`.
   - Add dependencies: `@modelcontextprotocol/sdk`, `zod`.
   - Add `openai` as a dependency and `@anthropic-ai/sdk` as an `optionalDependency`.
   - Add `"bin": { "omnisearch": "./dist/index.js" }`.

3. **Setup Core Interfaces**
   - Create `packages/mcp-server/src/types.ts`.
   - Define `SearchResult`, `SearchResponse`, `SearchProvider`, `SearchOptions`.
   - Define `ProviderName = "anthropic" | "openai" | "brave" | "moonshot"`.

4. **Setup `shared` Package**
   - Create `packages/shared/package.json`.
   - This package holds the native plugin logic (`createPluginHooks`) and depends on `@omnisearch/mcp-server` to instantiate the router locally.
   - Do NOT add `@opencode-ai/plugin` or `@kilocode/plugin` here (they will be injected by the wrappers).

## Verification
- Run `bun install` in the root directory and ensure workspaces link correctly without errors.
- Run `bun x tsc --noEmit` to verify basic TypeScript configuration.