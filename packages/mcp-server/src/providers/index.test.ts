import { describe, expect, test } from "bun:test";
import type { ProviderName, SearchProvider } from "../types.js";
import {
  AVAILABLE_PROVIDERS,
  clearProviderCache,
  getProvider,
  PROVIDER_LOADERS,
  type ProviderLoader,
} from "./index.js";

describe("getProvider", () => {
  test("lazy-loads and constructs the requested provider through its dynamic import", async () => {
    clearProviderCache();
    const provider = await getProvider("brave", { apiKey: "test-key" });
    expect(provider.name).toBe("brave");
  });

  test("caches default-constructed providers by name", async () => {
    clearProviderCache();
    const prev = process.env.BRAVE_API_KEY;
    process.env.BRAVE_API_KEY = "env-test-key";
    try {
      const first = await getProvider("brave");
      const second = await getProvider("brave");
      expect(first).toBe(second);
    } finally {
      clearProviderCache();
      if (prev === undefined) delete process.env.BRAVE_API_KEY;
      else process.env.BRAVE_API_KEY = prev;
    }
  });

  test("calls with explicit options bypass the cache", async () => {
    clearProviderCache();
    const a = await getProvider("brave", { apiKey: "key-a" });
    const b = await getProvider("brave", { apiKey: "key-b" });
    expect(a).not.toBe(b);
  });

  test("rejects providers outside the v1 set with the available list", async () => {
    clearProviderCache();
    const error = (await getProvider("exa" as ProviderName).catch((e) => e)) as Error;
    expect(error.message).toContain("not available in this version");
    for (const name of AVAILABLE_PROVIDERS) {
      expect(error.message).toContain(name);
    }
  });

  test("the unknown-provider error lists all eight providers", async () => {
    clearProviderCache();
    const error = (await getProvider("exa" as ProviderName).catch((e) => e)) as Error;
    for (const name of ["brave", "anthropic", "openai", "moonshot", "tavily", "google", "searxng", "perplexity"]) {
      expect(error.message).toContain(name);
    }
  });

  test("lazy-loads each v1.1 provider through its dynamic import", async () => {
    clearProviderCache();
    const tavily = await getProvider("tavily", { apiKey: "test-key" });
    expect(tavily.name).toBe("tavily");

    const google = await getProvider("google", { apiKey: "test-key", searchEngineId: "test-cx" });
    expect(google.name).toBe("google");

    const searxng = await getProvider("searxng", { baseUrl: "https://searx.example.com" });
    expect(searxng.name).toBe("searxng");

    const perplexity = await getProvider("perplexity", { apiKey: "test-key" });
    expect(perplexity.name).toBe("perplexity");
  });

  test("an uninstalled SDK only throws when its own provider is requested", async () => {
    clearProviderCache();
    const fakeBrave: SearchProvider = { name: "brave", search: async () => [] };
    const loaders: Partial<Record<ProviderName, ProviderLoader>> = {
      ...PROVIDER_LOADERS,
      brave: { create: async () => fakeBrave },
      anthropic: {
        create: async () => {
          throw new Error("Cannot find package '@anthropic-ai/sdk' imported from anthropic.ts");
        },
      },
    };

    const brave = await getProvider("brave", { apiKey: "test-key" }, loaders);
    expect(brave.name).toBe("brave");

    const error = (await getProvider("anthropic", { apiKey: "test-key" }, loaders).catch(
      (e) => e,
    )) as Error;
    expect(error.message).toContain("@anthropic-ai/sdk");
  });

  test("throws a clear error when the provider's API key is missing", async () => {
    clearProviderCache();
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const error = (await getProvider("openai").catch((e) => e)) as Error;
      expect(error.message).toContain("OPENAI_API_KEY");
    } finally {
      clearProviderCache();
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });
});
