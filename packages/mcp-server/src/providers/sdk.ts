/**
 * SDK-loading seam (ADR-0008 review follow-up): one home per SDK package for
 * the dynamic-import-with-install-hint policy. Providers construct their own
 * client instances; this module only loads modules.
 */

/** Base hint for the OpenAI-compatible SDKs (openai, moonshot, perplexity). */
export const OPENAI_SDK_INSTALL_HINT = "OpenAI SDK not installed. Run: npm install openai";

/** Hint for the Anthropic SDK. */
export const ANTHROPIC_SDK_INSTALL_HINT =
  "Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk";

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

/** Load the Anthropic SDK, mapping failure to its install hint. */
export function loadAnthropicSdk(importSdk?: () => Promise<unknown>): Promise<unknown> {
  return loadOptionalSdk(importSdk ?? (async () => import("@anthropic-ai/sdk")), ANTHROPIC_SDK_INSTALL_HINT);
}

/** Load the OpenAI SDK, mapping failure to an install hint (base by default). */
export function loadOpenAISdk(importSdk?: () => Promise<unknown>, hint: string = OPENAI_SDK_INSTALL_HINT): Promise<unknown> {
  return loadOptionalSdk(importSdk ?? (async () => import("openai")), hint);
}
