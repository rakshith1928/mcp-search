/**
 * Public API surface of @omnisearch/mcp-server.
 *
 * The bin entry (`index.ts`) executes the server/CLI and must not be
 * imported; consumers import from the package root, which resolves here.
 */

export * from "./types.js";
export * from "./router.js";
export * from "./normalize.js";
export * from "./cache.js";
export * from "./tool-schema.js";
export {
  DEFAULT_RATE_LIMITS,
  RateLimiter,
  rateLimitEnvKey,
  rateLimitFromEnv,
  type RateLimitConfig,
} from "./rate-limiter.js";
export * from "./providers/index.js";
export { PROVIDERS, PROVIDER_NAMES, type ProviderKind, type ProviderLoadOptions } from "./providers/catalog.js";
export {
  ENV_BY_PROVIDER,
  loadOptionalSdk,
  requireEnv,
  resolveApiKey,
  stripHtml,
} from "./util.js";
