import type { ProviderName, SearchProvider } from "../types.js";
import { resolveApiKey } from "../util.js";

/** All providers available in v1. */
export const AVAILABLE_PROVIDERS: readonly ProviderName[] = [
  "brave",
  "anthropic",
  "openai",
  "moonshot",
];

/** Options forwarded to a provider factory. */
export interface ProviderFactoryOptions {
  apiKey?: string;
  [key: string]: unknown;
}

/** A lazily-loaded provider constructor. */
export interface ProviderLoader {
  create(options?: ProviderFactoryOptions): Promise<SearchProvider>;
}

/**
 * Dynamic-import loaders: each provider module (and its optional SDK
 * dependencies) is only imported when its provider is first requested.
 */
export const PROVIDER_LOADERS: Record<ProviderName, ProviderLoader> = {
  brave: {
    create: async (options) => (await import("./brave.js")).createBraveProvider(options),
  },
  anthropic: {
    create: async (options) => (await import("./anthropic.js")).createAnthropicProvider(options),
  },
  openai: {
    create: async (options) => (await import("./openai.js")).createOpenAIProvider(options),
  },
  moonshot: {
    create: async (options) => (await import("./moonshot.js")).createMoonshotProvider(options),
  },
};

// Default-constructed providers are cached by name so repeated getProvider
// calls reuse one instance. Calls carrying explicit options always construct
// a fresh provider.
const providerCache = new Map<ProviderName, SearchProvider>();

function usesCache(options?: ProviderFactoryOptions): boolean {
  return options === undefined || Object.keys(options).length === 0;
}

/**
 * Resolve a provider by name, validating its API key on load.
 *
 * @param name    provider to load; anything outside the v1 set is rejected
 * @param options forwarded to the provider factory; absent/empty options hit the cache
 * @param loaders overridable loader map (tests)
 */
export async function getProvider(
  name: ProviderName,
  options?: ProviderFactoryOptions,
  loaders: Record<ProviderName, ProviderLoader> = PROVIDER_LOADERS,
): Promise<SearchProvider> {
  if (!Object.prototype.hasOwnProperty.call(loaders, name)) {
    throw new Error(
      `Provider '${name}' is not available in this version. Available: ${AVAILABLE_PROVIDERS.join(", ")}`,
    );
  }

  if (usesCache(options)) {
    const cached = providerCache.get(name);
    if (cached) return cached;
  }

  const apiKey = resolveApiKey(name, options?.apiKey);
  const provider = await loaders[name].create({ ...options, apiKey });

  if (usesCache(options)) {
    providerCache.set(name, provider);
  }
  return provider;
}

/** Reset the provider cache (tests, or after config changes). */
export function clearProviderCache(): void {
  providerCache.clear();
}

export { requireEnv } from "../util.js";
