# Phase 5: Verification & End-to-End Testing

## Context
Ensure the complete system works correctly across all target agents (OpenCode, Kilocode, Windsurf, Cursor) before release.

## Approach
1. **End-to-End Testing Setup**
   - Ensure you have a valid `BRAVE_API_KEY` for cheap live testing.
   - Configure OpenCode (`opencode.json`): add `"plugin": [["omnisearch-opencode", { "provider": "brave" }]]`.
   - Configure Kilocode (`kilo.jsonc`): add `"plugin": [["omnisearch-kilocode", { "provider": "brave" }]]`.
   - Configure Windsurf (`mcp_config.json`): add `omnisearch` MCP server pointing to the built binary.

2. **Run E2E Scenarios**
   - Launch OpenCode and ask: *"Use omnisearch to find the latest TypeScript release"*.
     - Verify it calls the `omnisearch` tool.
     - Verify the output format includes the `## Sources` markdown.
   - Repeat the identical prompt in Kilocode and Windsurf.

3. **Verify Fallback Behavior Live**
   - Configure primary provider as `anthropic` and fallback as `brave`.
   - Purposely provide an invalid `ANTHROPIC_API_KEY`.
   - Run a query and verify the output metadata explicitly states it fell back to `brave`.

4. **Verify Lazy Loading**
   - Install the packages using `npm install --omit=optional`.
   - Ensure the `@anthropic-ai/sdk` is missing.
   - Run a query using the `brave` provider. It MUST succeed without throwing a missing module error.
   - Attempt to run a query using the `anthropic` provider. It MUST throw a clean error instructing the user to install the SDK.

## Verification
- All tests described above pass.
- The `dist` bundles inside `opencode-plugin` and `kilocode-plugin` do not inline the MCP server's dependencies unnecessarily.