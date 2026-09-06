import { describe, expect, test } from "bun:test";
import { DEFAULT_RATE_LIMITS, PROVIDERS, PROVIDER_NAMES } from "./catalog.js";
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
    }
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
