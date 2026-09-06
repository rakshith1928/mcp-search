# Publish checklist (maintainer)

Prerequisites:

- npm account + an `@omnisearch` org with public packages enabled.
- Logged in: `npm whoami`.

Order matters (workspace deps): shared → mcp-server → opencode-plugin → kilocode-plugin.

```bash
cd packages/shared          && bun publish --access public
cd packages/mcp-server      && bun publish --access public
cd packages/opencode-plugin && bun publish
cd packages/kilocode-plugin && bun publish
```

Notes:

- `bun publish` (not npm publish) — workspace:* protocol rewriting.
- Scoped packages need `--access public`.
- After publishing, verify: `npx -y @omnisearch/mcp-server search "test" --provider brave`
  (with BRAVE_API_KEY set).
- Version bumps: all five package.json files move together each release
  (shared release cadence), then `bun install` to sync bun.lock.
- Update the `<your-org>` placeholder in the per-package READMEs with the
  real repo URL before the first publish.
