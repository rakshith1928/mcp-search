import { describe, expect, test } from "bun:test";
import { parseCliArgs, routerConfigFromEnv, runSearch, USAGE } from "./cli.js";
import type { SearchProvider } from "./types.js";

describe("parseCliArgs", () => {
  test("defaults to MCP server mode with no args", () => {
    expect(parseCliArgs([])).toEqual({ ok: true, mode: "mcp" });
  });

  test("joins multi-word queries", () => {
    expect(parseCliArgs(["search", "latest", "typescript", "release"])).toEqual({
      ok: true,
      mode: "search",
      query: "latest typescript release",
      provider: undefined,
      max: undefined,
    });
  });

  test("parses --provider and --max flags", () => {
    expect(parseCliArgs(["search", "q", "--provider", "brave", "--max", "5"])).toEqual({
      ok: true,
      mode: "search",
      query: "q",
      provider: "brave",
      max: 5,
    });
  });

  test("rejects a search without a query, with usage guidance", () => {
    const parsed = parseCliArgs(["search"]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain("Usage");
  });

  test("rejects unknown commands and unknown flags", () => {
    expect(parseCliArgs(["bogus"]).ok).toBe(false);
    expect(parseCliArgs(["search", "q", "--bogus"]).ok).toBe(false);
    expect(parseCliArgs(["search", "q", "--max", "lots"]).ok).toBe(false);
  });
});

describe("routerConfigFromEnv", () => {
  test("defaults to brave with no fallback", () => {
    expect(routerConfigFromEnv({})).toEqual({ primary: "brave" });
  });

  test("reads OMNISEARCH_PROVIDER, OMNISEARCH_FALLBACK, and cache settings", () => {
    expect(
      routerConfigFromEnv({
        OMNISEARCH_PROVIDER: "openai",
        OMNISEARCH_FALLBACK: "brave,moonshot",
        OMNISEARCH_CACHE_TTL_MS: "1000",
        OMNISEARCH_CACHE_MAX_ENTRIES: "10",
      }),
    ).toEqual({
      primary: "openai",
      fallback: ["brave", "moonshot"],
      cacheTtlMs: 1000,
      cacheMaxEntries: 10,
    });
  });

  test("throws on an unknown provider name", () => {
    expect(() => routerConfigFromEnv({ OMNISEARCH_PROVIDER: "google" })).toThrow(/google/);
  });
});

describe("runSearch", () => {
  function fakeWriter() {
    const chunks: string[] = [];
    return { chunks, write: (data: string) => chunks.push(data) };
  }

  const braveFake: SearchProvider = {
    name: "brave",
    search: async () => [{ title: "T", url: "https://example.com", snippet: "S" }],
  };

  test("prints normalized markdown and returns 0", async () => {
    const stdout = fakeWriter();
    const code = await runSearch(["search", "typescript"], {
      stdout,
      routerConfig: { providers: { brave: braveFake } },
    });

    expect(code).toBe(0);
    expect(stdout.chunks.join("")).toContain("## Web Search Results");
    expect(stdout.chunks.join("")).toContain("[T](https://example.com)");
  });

  test("returns 1 and prints usage to stderr when args are invalid", async () => {
    const stderr = fakeWriter();
    const code = await runSearch(["search"], { stderr });

    expect(code).toBe(1);
    expect(stderr.chunks.join("")).toContain(USAGE);
  });

  test("returns 1 and reports the error when every provider fails", async () => {
    const stderr = fakeWriter();
    const failing: SearchProvider = {
      name: "brave",
      search: async () => {
        throw new Error("HTTP 500");
      },
    };
    const code = await runSearch(["search", "q"], {
      stderr,
      routerConfig: { providers: { brave: failing } },
    });

    expect(code).toBe(1);
    expect(stderr.chunks.join("")).toContain("HTTP 500");
  });
});
