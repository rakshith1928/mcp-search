import type { ProviderName } from "./types.js";

/**
 * The environment variable each provider reads its API key from.
 */
export const ENV_BY_PROVIDER: Record<ProviderName, string> = {
  brave: "BRAVE_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  moonshot: "MOONSHOT_API_KEY",
  tavily: "TAVILY_API_KEY",
  google: "GOOGLE_API_KEY",
  searxng: "SEARXNG_BASE_URL",
  perplexity: "PERPLEXITY_API_KEY",
};

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
