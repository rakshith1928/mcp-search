import type { ProviderName } from "./types.js";
import { ENV_BY_PROVIDER } from "./providers/catalog.js";

export { ENV_BY_PROVIDER };

/**
 * Read a required environment variable, throwing a clear error when unset.
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${key}. Export it before using this provider.`,
    );
  }
  return value;
}

/**
 * Resolve a provider's API key: an explicitly provided key wins, otherwise the
 * provider's environment variable is required.
 */
export function resolveApiKey(provider: ProviderName, explicit?: string): string {
  if (explicit) return explicit;
  return requireEnv(ENV_BY_PROVIDER[provider]);
}

/**
 * Load an optional SDK dependency, mapping any import failure to a clear
 * install hint (original error preserved as `cause`).
 */
export async function loadOptionalSdk<T>(importFn: () => Promise<T>, installHint: string): Promise<T> {
  try {
    return await importFn();
  } catch (cause) {
    throw new Error(installHint, { cause });
  }
}

/**
 * Non-throwing check used for parallel participant discovery: true iff the
 * provider's required env var is set (Google's cx is validated at load).
 */
export function hasProviderConfig(provider: ProviderName): boolean {
  return Boolean(process.env[ENV_BY_PROVIDER[provider]]);
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

/**
 * Strip HTML tags and entities from provider snippets, collapsing whitespace.
 */
export function stripHtml(input: string): string {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#?[a-zA-Z0-9]+);/g, (match, entity: string) => {
      const decoded = HTML_ENTITIES[entity];
      return decoded ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}
