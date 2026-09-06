import type { SearchProvider } from "../types.js";
import type { RateLimitConfig } from "../rate-limiter.js";
import type { SearxngProviderOptions } from "./searxng.js";

/**
 * Options forwarded to a provider's loader. Providers that need more
 * (e.g. google's searchEngineId, searxng's baseUrl) read them from here.
 */
export interface ProviderLoadOptions {
  apiKey?: string;
  [key: string]: unknown;
}

/** Which mechanism a provider uses — inert metadata until doctor consumes it. */
export type ProviderKind = "fetch" | "llm";

/**
 * The provider catalog (ADR-0008): the single home of provider facts.
 *
 * One descriptor per provider — name, env var, mechanism kind, default rate
 * limit, and loader. Everything else that wants "one row per provider"
 * (the ProviderName union, AVAILABLE_PROVIDERS, ENV_BY_PROVIDER,
 * DEFAULT_RATE_LIMITS, the tool-schema enum) derives from this table, so
 * adding a provider is a one-row edit and the compiler rejects any provider
 * claim the table does not carry.
 */
export const PROVIDERS = [
  {
    name: "brave",
    envKey: "BRAVE_API_KEY",
    kind: "fetch",
    rateLimit: { limit: 15, windowMs: 60_000 },
    load: async (options?: ProviderLoadOptions): Promise<SearchProvider> =>
      (await import("./brave.js")).createBraveProvider(options),
  },
  {
    name: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    kind: "llm",
    rateLimit: { limit: 10, windowMs: 60_000 },
    load: async (options?: ProviderLoadOptions): Promise<SearchProvider> =>
      (await import("./anthropic.js")).createAnthropicProvider(options),
  },
  {
    name: "openai",
    envKey: "OPENAI_API_KEY",
    kind: "llm",
    rateLimit: { limit: 10, windowMs: 60_000 },
    load: async (options?: ProviderLoadOptions): Promise<SearchProvider> =>
      (await import("./openai.js")).createOpenAIProvider(options),
  },
  {
    name: "moonshot",
    envKey: "MOONSHOT_API_KEY",
    kind: "llm",
    rateLimit: { limit: 10, windowMs: 60_000 },
    load: async (options?: ProviderLoadOptions): Promise<SearchProvider> =>
      (await import("./moonshot.js")).createMoonshotProvider(options),
  },
  {
    name: "tavily",
    envKey: "TAVILY_API_KEY",
    kind: "fetch",
    rateLimit: { limit: 15, windowMs: 60_000 },
    load: async (options?: ProviderLoadOptions): Promise<SearchProvider> =>
      (await import("./tavily.js")).createTavilyProvider(options),
  },
  {
    name: "google",
    envKey: "GOOGLE_API_KEY",
    kind: "fetch",
    rateLimit: { limit: 10, windowMs: 60_000 },
    load: async (options?: ProviderLoadOptions): Promise<SearchProvider> =>
      (await import("./google.js")).createGoogleProvider(options),
  },
  {
    name: "searxng",
    envKey: "SEARXNG_BASE_URL",
    kind: "fetch",
    rateLimit: { limit: 60, windowMs: 60_000 },
    load: async (options?: ProviderLoadOptions): Promise<SearchProvider> =>
      (await import("./searxng.js")).createSearxngProvider(options as SearxngProviderOptions),
  },
  {
    name: "perplexity",
    envKey: "PERPLEXITY_API_KEY",
    kind: "llm",
    rateLimit: { limit: 10, windowMs: 60_000 },
    load: async (options?: ProviderLoadOptions): Promise<SearchProvider> =>
      (await import("./perplexity.js")).createPerplexityProvider(options),
  },
] as const;

/** Every provider name, derived from the catalog. */
export const PROVIDER_NAMES = PROVIDERS.map((p) => p.name) as [
  (typeof PROVIDERS)[number]["name"],
  ...(typeof PROVIDERS)[number]["name"][],
];

/** The ProviderName union IS the catalog — the table is the type's only home. */
export type ProviderName = (typeof PROVIDERS)[number]["name"];

/** Derived view: name → the provider's required env var (or config value). */
export const ENV_BY_PROVIDER = Object.fromEntries(
  PROVIDERS.map((p): [ProviderName, string] => [p.name, p.envKey]),
) as Record<ProviderName, string>;

/** Derived view: name → default rate limit. */
export const DEFAULT_RATE_LIMITS = Object.fromEntries(
  PROVIDERS.map((p): [ProviderName, RateLimitConfig] => [p.name, p.rateLimit]),
) as Record<ProviderName, RateLimitConfig>;
