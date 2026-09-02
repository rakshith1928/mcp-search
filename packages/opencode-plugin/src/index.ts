import { tool, type Plugin } from "@opencode-ai/plugin";
import { createPluginHooks, type OmnisearchPluginOptions } from "@omnisearch/shared";

/**
 * Omnisearch plugin for OpenCode.
 *
 * Configure in opencode.json:
 *
 *     "plugin": [["omnisearch-opencode", { "provider": "brave" }]]
 *
 * API keys come from the environment (e.g. BRAVE_API_KEY).
 */
export const OmnisearchPlugin: Plugin = async (_input, options) =>
  createPluginHooks((options ?? {}) as OmnisearchPluginOptions, tool);

export default OmnisearchPlugin;
