import { AVAILABLE_PROVIDERS } from "./providers/index.js";
import { MAX_TOOL_RESULTS } from "./tool-schema.js";
import { resolveRouterConfig } from "./router/config.js";
import { createRouter, type RouterConfig } from "./router/index.js";
import type { ProviderName } from "./types.js";

export const USAGE = "Usage: omnisearch search <query> [--provider <name>] [--max <n>] [--parallel]";

export type ParsedCliArgs =
  | { ok: true; mode: "mcp" }
  | { ok: true; mode: "search"; query: string; provider?: ProviderName; max?: number; parallel?: boolean }
  | { ok: false; error: string };

/**
 * Parse CLI arguments. No arguments selects MCP server mode; `search`
 * followed by a query (plus optional flags) selects one-shot CLI mode.
 */
export function parseCliArgs(argv: string[]): ParsedCliArgs {
  if (argv.length === 0) return { ok: true, mode: "mcp" };
  if (argv[0] !== "search") {
    return { ok: false, error: `Unknown command: ${argv[0]}. ${USAGE}` };
  }

  const words: string[] = [];
  let provider: ProviderName | undefined;
  let max: number | undefined;
  let parallel: boolean | undefined;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--provider") {
      const value = argv[++i];
      if (!value || !AVAILABLE_PROVIDERS.includes(value as ProviderName)) {
        return {
          ok: false,
          error: `--provider requires one of: ${AVAILABLE_PROVIDERS.join(", ")}. ${USAGE}`,
        };
      }
      provider = value as ProviderName;
    } else if (arg === "--max") {
      const value = argv[++i];
      const parsed = Number(value);
      if (!value || !Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TOOL_RESULTS) {
        return {
          ok: false,
          error: `--max requires an integer between 1 and ${MAX_TOOL_RESULTS}. ${USAGE}`,
        };
      }
      max = parsed;
    } else if (arg === "--parallel") {
      parallel = true;
    } else if (arg.startsWith("--")) {
      return { ok: false, error: `Unknown flag: ${arg}. ${USAGE}` };
    } else {
      words.push(arg);
    }
  }

  if (words.length === 0) {
    return { ok: false, error: `Missing search query. ${USAGE}` };
  }
  return { ok: true, mode: "search", query: words.join(" "), provider, max, parallel };
}

export interface RunSearchIo {
  env?: Record<string, string | undefined>;
  stdout?: { write(data: string): unknown };
  stderr?: { write(data: string): unknown };
  /** Router config override (tests); merged over env config otherwise. */
  routerConfig?: Partial<RouterConfig>;
}

/**
 * One-shot CLI search: parse args, run the query, print normalized markdown
 * to stdout. Returns the process exit code.
 */
export async function runSearch(argv: string[], io: RunSearchIo = {}): Promise<number> {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;

  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    stderr.write(`${parsed.error}\n`);
    return 1;
  }
  if (parsed.mode !== "search") {
    stderr.write(`${USAGE}\n`);
    return 1;
  }

  let config: RouterConfig;
  try {
    config = resolveRouterConfig(io.routerConfig, io.env ?? process.env);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const router = createRouter(config);
  try {
    const response = await router.search(parsed.query, {
      maxResults: parsed.max,
      provider: parsed.provider,
      parallel: parsed.parallel,
    });
    stdout.write(`${response.markdown}\n`);
    return 0;
  } catch (error) {
    stderr.write(`Search failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
