#!/usr/bin/env node
/**
 * omnisearch CLI entry point.
 *
 * - `omnisearch search <query> [--provider <name>] [--max <n>]` — one-shot
 *   search printing normalized markdown to stdout (CLI test mode).
 * - `omnisearch` (no args) — start the MCP server on stdio.
 */

import { runSearch, USAGE } from "./cli.js";
import { startStdioServer } from "./server.js";

const args = process.argv.slice(2);

if (args[0] === "search") {
  process.exitCode = await runSearch(args);
} else if (args.length === 0) {
  await startStdioServer();
} else {
  process.stderr.write(`Unknown command: ${args[0]}\n${USAGE}\n`);
  process.exitCode = 1;
}
