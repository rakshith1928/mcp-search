import { tool, type Plugin } from "@kilocode/plugin";
import { createPluginHooks, type OmnisearchPluginOptions } from "@omnisearch/shared";

/**
 * Omnisearch plugin for Kilocode.
 *
 * Configure in kilo.jsonc:
 *
 *     "plugin": [["omnisearch-kilocode", { "provider": "brave" }]]
 *
 * API keys come from the environment (e.g. BRAVE_API_KEY).
 */
export const OmnisearchPlugin: Plugin = async (_input, options) =>
  createPluginHooks((options ?? {}) as OmnisearchPluginOptions, tool);

export default OmnisearchPlugin;
