import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RATE_LIMITS,
  ENV_BY_PROVIDER,
  hasProviderConfig,
  PROVIDERS,
  PROVIDER_NAMES,
  resolveApiKey,
} from "./catalog.js";
import { AVAILABLE_PROVIDERS, PROVIDER_LOADERS } from "./index.js";

const EXPECTED_ORDER = [
  "brave",
  "anthropic",
  "openai",
  "moonshot",
  "tavily",
  "google",
  "searxng",
  "perplexity",
] as const;

describe("provider catalog", () => {
  test("carries one descriptor per provider, in the stable order", () => {
    expect(PROVIDERS.map((p) => p.name)).toEqual(EXPECTED_ORDER);
  });

  test("descriptors are complete: unique names, valid env keys, known kinds, sane limits, loaders", () => {
    const names = new Set<string>();
    for (const p of PROVIDERS) {
      expect(names.has(p.name)).toBe(false);
      names.add(p.name);
      expect(p.envKey).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(["fetch", "llm"]).toContain(p.kind);
      expect(p.rateLimit.limit).toBeGreaterThanOrEqual(1);
      expect(p.rateLimit.windowMs).toBeGreaterThanOrEqual(1_000);
      expect(typeof p.load).toBe("function");
    }
  });

  test("derived views stay pinned to the table", () => {
    expect(PROVIDER_NAMES).toEqual(EXPECTED_ORDER);
    expect(AVAILABLE_PROVIDERS).toEqual(EXPECTED_ORDER);
    for (const p of PROVIDERS) {
      expect(DEFAULT_RATE_LIMITS[p.name]).toEqual(p.rateLimit);
      expect(PROVIDER_LOADERS[p.name]).toBeDefined();
      expect(ENV_BY_PROVIDER[p.name]).toBe(p.envKey);
    }
  });

  test("the tool-schema zod enum derives from the catalog, not a hand-written list", async () => {
    const { omnisearchInputSchema } = await import("../tool-schema.js");
    const providerSchema = omnisearchInputSchema.provider as { parse(value: unknown): unknown };

    for (const name of EXPECTED_ORDER) {
      expect(providerSchema.parse(name)).toBe(name);
    }
    expect(() => providerSchema.parse("exa")).toThrow();
  });

  test("each loader constructs its provider through its dynamic import", async () => {
    const brave = await PROVIDERS.find((p) => p.name === "brave")!.load({ apiKey: "test-key" });
    expect(brave.name).toBe("brave");

    const searxng = await PROVIDERS.find((p) => p.name === "searxng")!.load({
      baseUrl: "https://searx.example.com",
    });
    expect(searxng.name).toBe("searxng");
  });
});

describe("resolveApiKey", () => {
  test("returns the explicit key when provided", () => {
    expect(resolveApiKey("brave", "explicit-key")).toBe("explicit-key");
  });

  test("falls back to the provider's env var", () => {
    expect(resolveApiKey("brave", undefined, { BRAVE_API_KEY: "env-key" })).toBe("env-key");
  });

  test("throws a clear error naming the env var when missing", () => {
    expect(() => resolveApiKey("brave", undefined, {})).toThrow(/BRAVE_API_KEY/);
  });

  test("maps every provider to its documented env var", () => {
    expect(ENV_BY_PROVIDER.brave).toBe("BRAVE_API_KEY");
    expect(ENV_BY_PROVIDER.anthropic).toBe("ANTHROPIC_API_KEY");
    expect(ENV_BY_PROVIDER.openai).toBe("OPENAI_API_KEY");
    expect(ENV_BY_PROVIDER.moonshot).toBe("MOONSHOT_API_KEY");
  });
});

describe("hasProviderConfig", () => {
  test("true iff the provider's env var is set in the injected env", () => {
    expect(hasProviderConfig("brave", {})).toBe(false);
    expect(hasProviderConfig("brave", { BRAVE_API_KEY: "x" })).toBe(true);
    expect(hasProviderConfig("google", { GOOGLE_API_KEY: "x" })).toBe(true);
  });
});
