import type { ProviderName, SearchProvider } from "../types.js";
import type { SearxngProviderOptions } from "./searxng.js";

export { requireEnv } from "../util.js";

/** All providers available in v1.1. */
export const AVAILABLE_PROVIDERS: readonly ProviderName[] = [
  "brave",
  "anthropic",
  "openai",
  "moonshot",
  "tavily",
  "google",
  "searxng",
  "perplexity",
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
 * Partial because loaders exist only for implemented providers;
 * AVAILABLE_PROVIDERS is the advertised set.
 */
export const PROVIDER_LOADERS: Partial<Record<ProviderName, ProviderLoader>> = {
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
  tavily: {
    create: async (options) => (await import("./tavily.js")).createTavilyProvider(options),
  },
  google: {
    create: async (options) => (await import("./google.js")).createGoogleProvider(options),
  },
  searxng: {
    create: async (options) =>
      (await import("./searxng.js")).createSearxngProvider(options as SearxngProviderOptions),
  },
  perplexity: {
    create: async (options) => (await import("./perplexity.js")).createPerplexityProvider(options),
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
 * Resolve a provider by name. Credential/config validation happens inside
 * each factory at construction time — construction is load time in a lazy
 * registry, so a missing key fails fast here with the factory's clear error.
 *
 * @param name    provider to load; anything outside the advertised set is rejected
 * @param options forwarded to the provider factory; absent/empty options hit the cache
 * @param loaders overridable loader map (tests)
 */
export async function getProvider(
  name: ProviderName,
  options?: ProviderFactoryOptions,
  loaders: Partial<Record<ProviderName, ProviderLoader>> = PROVIDER_LOADERS,
): Promise<SearchProvider> {
  const loader = Object.prototype.hasOwnProperty.call(loaders, name) ? loaders[name] : undefined;
  if (!loader) {
    throw new Error(
      `Provider '${name}' is not available in this version. Available: ${AVAILABLE_PROVIDERS.join(", ")}`,
    );
  }

  if (usesCache(options)) {
    const cached = providerCache.get(name);
    if (cached) return cached;
  }

  const provider = await loader.create({ ...options });

  if (usesCache(options)) {
    providerCache.set(name, provider);
  }
  return provider;
}

/** Reset the provider cache (tests, or after config changes). */
export function clearProviderCache(): void {
  providerCache.clear();
}

