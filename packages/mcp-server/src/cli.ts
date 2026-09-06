import { AVAILABLE_PROVIDERS } from "./providers/index.js";
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
      const maxCap = 20;
      if (!value || !Number.isInteger(parsed) || parsed < 1 || parsed > maxCap) {
        return {
          ok: false,
          error: `--max requires an integer between 1 and ${maxCap}. ${USAGE}`,
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

/** Parse a positive-integer env var, throwing a clear error naming the variable. */
function positiveIntFromEnv(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid ${name}: '${raw}'. Expected a finite integer >= 1.`);
  }
  return value;
}

/** Build router config from OMNISEARCH_* environment variables. */
export function routerConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): RouterConfig {
  const primary = (env.OMNISEARCH_PROVIDER || "brave") as ProviderName;
  if (!AVAILABLE_PROVIDERS.includes(primary)) {
    throw new Error(
      `Invalid OMNISEARCH_PROVIDER '${primary}'. Available: ${AVAILABLE_PROVIDERS.join(", ")}`,
    );
  }

  const config: RouterConfig = { primary };

  const fallbackRaw = env.OMNISEARCH_FALLBACK;
  if (fallbackRaw) {
    const fallback = fallbackRaw
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean) as ProviderName[];
    for (const name of fallback) {
      if (!AVAILABLE_PROVIDERS.includes(name)) {
        throw new Error(
          `Invalid OMNISEARCH_FALLBACK entry '${name}'. Available: ${AVAILABLE_PROVIDERS.join(", ")}`,
        );
      }
    }
    config.fallback = fallback;
  }

  const parallelRaw = env.OMNISEARCH_PARALLEL;
  if (parallelRaw) {
    // Dedupe (first occurrence wins) so "brave,brave" fans out to brave once.
    const participants: ProviderName[] = [];
    for (const raw of parallelRaw.split(",")) {
      const name = raw.trim();
      if (!name) continue;
      const provider = name as ProviderName;
      if (!participants.includes(provider)) participants.push(provider);
    }
    for (const name of participants) {
      if (!AVAILABLE_PROVIDERS.includes(name)) {
        throw new Error(
          `Invalid OMNISEARCH_PARALLEL entry '${name}'. Available: ${AVAILABLE_PROVIDERS.join(", ")}`,
        );
      }
    }
    config.parallelParticipants = participants;
  }

  if (env.OMNISEARCH_TIMEOUT_MS) {
    config.timeoutMs = positiveIntFromEnv("OMNISEARCH_TIMEOUT_MS", env.OMNISEARCH_TIMEOUT_MS);
  }
  if (env.OMNISEARCH_CACHE_TTL_MS) {
    config.cacheTtlMs = positiveIntFromEnv("OMNISEARCH_CACHE_TTL_MS", env.OMNISEARCH_CACHE_TTL_MS);
  }
  if (env.OMNISEARCH_CACHE_MAX_ENTRIES) {
    config.cacheMaxEntries = positiveIntFromEnv(
      "OMNISEARCH_CACHE_MAX_ENTRIES",
      env.OMNISEARCH_CACHE_MAX_ENTRIES,
    );
  }

  return config;
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
    const base = io.routerConfig?.primary ? { primary: io.routerConfig.primary } : routerConfigFromEnv(io.env ?? process.env);
    config = { ...base, ...io.routerConfig };
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
