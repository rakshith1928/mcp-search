import type { ProviderName, SearchOptions, SearchProvider, SearchResult } from "../types.js";
import type { RateLimiter } from "../rate-limiter.js";

export const MAX_RETRIES = 2;

/**
 * Transient failures get retried (ADR-0004): HTTP 5xx/429 (the standardized
 * provider message shape), network errors, and timeouts/aborts. Everything
 * else — auth, quota, config — is permanent and falls through immediately.
 */
export function isTransientSearchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message ?? "";
  if (/HTTP\s+(5\d\d|429)/.test(message)) return true;
  if (/aborted|timed?\s*out/i.test(message)) return true;
  if (/fetch failed/i.test(message)) return true;
  let cause: unknown = error.cause;
  while (cause instanceof Error) {
    if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|fetch failed/i.test(cause.message)) return true;
    cause = cause.cause;
  }
  return false;
}

function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = 500 * Math.pow(2, attempt - 1);
  return base + Math.floor(random() * 250);
}

/**
 * The state bundle the attempt loop and both search paths share. Created by
 * createRouter; threading it keeps the router/ modules free of closure state.
 */
export interface RouterContext {
  config: import("./index.js").RouterConfig;
  timeoutMs: number;
  sleepImpl(ms: number): Promise<void>;
  providerFor(name: ProviderName): Promise<SearchProvider>;
  limiterFor(name: ProviderName): Pick<RateLimiter, "acquire"> | undefined;
}

/**
 * The single-homed ADR-0004 loop: resolve the provider once, then per
 * attempt acquire a rate-limit token, build a fresh abort signal, and call
 * the provider — retrying transient failures with exponential backoff +
 * jitter. Cache writes stay with the calling path. Returns raw results.
 */
export async function attemptWithRetry(
  ctx: RouterContext,
  name: ProviderName,
  query: string,
  options: SearchOptions,
): Promise<SearchResult[]> {
  const provider = await ctx.providerFor(name);
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      await ctx.limiterFor(name)?.acquire();
      const signal = AbortSignal.timeout(ctx.timeoutMs);
      return await provider.search(query, { ...options, signal });
    } catch (error) {
      lastError = error;
      if (attempt <= MAX_RETRIES && isTransientSearchError(error)) {
        await ctx.sleepImpl(backoffMs(attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
