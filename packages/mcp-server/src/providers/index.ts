import type { ProviderName, SearchProvider } from "../types.js";
import { PROVIDERS, type ProviderLoadOptions } from "./catalog.js";

export { requireEnv } from "../util.js";

/**
 * The advertised provider set, derived from the catalog (ADR-0008).
 */
export const AVAILABLE_PROVIDERS: readonly ProviderName[] = PROVIDERS.map((p) => p.name);

/** A lazily-loaded provider constructor. */
export interface ProviderLoader {
  create(options?: ProviderLoadOptions): Promise<SearchProvider>;
}

/** Options forwarded to a provider loader. */
export interface ProviderFactoryOptions extends ProviderLoadOptions {}

/**
 * Loaders derived from the catalog — one per descriptor. The map is total:
 * every catalog row carries a loader.
 */
export const PROVIDER_LOADERS: Record<ProviderName, ProviderLoader> = Object.fromEntries(
  PROVIDERS.map((p): [ProviderName, ProviderLoader] => [p.name, { create: p.load }]),
) as Record<ProviderName, ProviderLoader>;

// Provider cache: default-constructed providers are cached by name so
// repeated getProvider calls reuse one instance. Calls carrying explicit
// options always construct a fresh provider.
const providerCache = new Map<ProviderName, SearchProvider>();

function usesCache(options?: ProviderFactoryOptions): boolean {
  return options === undefined || Object.keys(options).length === 0;
}

/**
 * Resolve a provider by name. Credential/config validation happens inside
 * each factory at construction time — construction is load time in a lazy
 * registry, so a missing key fails fast here with the factory's clear error.
 *
 * @param name    provider to load; anything outside the catalog is rejected
 * @param options forwarded to the provider loader; absent/empty options hit the cache
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
