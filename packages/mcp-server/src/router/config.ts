import { AVAILABLE_PROVIDERS } from "../providers/index.js";
import type { ProviderName } from "../types.js";
import type { RouterConfig } from "./index.js";

/** Parse a positive-integer env var, throwing a clear error naming the variable. */
export function positiveIntFromEnv(name: string, raw: string): number {
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
    const participants: ProviderName[] = [];
    for (const raw of parallelRaw.split(",")) {
      const name = raw.trim() as ProviderName;
      if (!name) continue;
      if (!participants.includes(name)) participants.push(name);
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

/**
 * Merge partial config over env-derived defaults: an explicit primary wins,
 * otherwise the environment applies. One merge idiom for both the MCP server
 * and the CLI (previously duplicated in server.ts and cli.ts).
 */
export function resolveRouterConfig(
  partial: Partial<RouterConfig> | undefined,
  env: Record<string, string | undefined> = process.env,
): RouterConfig {
  const base = partial?.primary ? { primary: partial.primary } : routerConfigFromEnv(env);
  return { ...base, ...partial };
}
