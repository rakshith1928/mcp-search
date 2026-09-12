import { describe, expect, test } from "bun:test";
import { routerConfigFromEnv } from "./config.js";
import { parseCliArgs, USAGE } from "../cli.js";

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
    expect(() => routerConfigFromEnv({ OMNISEARCH_PROVIDER: "exa" })).toThrow(/exa/);
  });

  test("throws with the variable name when a cache setting is not numeric", () => {
    expect(() => routerConfigFromEnv({ OMNISEARCH_CACHE_TTL_MS: "abc" })).toThrow(
      /OMNISEARCH_CACHE_TTL_MS[\s\S]*'abc'/,
    );
    expect(() => routerConfigFromEnv({ OMNISEARCH_CACHE_MAX_ENTRIES: "abc" })).toThrow(
      /OMNISEARCH_CACHE_MAX_ENTRIES[\s\S]*'abc'/,
    );
    expect(() => routerConfigFromEnv({ OMNISEARCH_CACHE_TTL_MS: "Infinity" })).toThrow(
      /OMNISEARCH_CACHE_TTL_MS/,
    );
  });

  test("throws when a cache setting is zero, negative, or fractional", () => {
    for (const bad of ["0", "-5", "1.5"]) {
      expect(() => routerConfigFromEnv({ OMNISEARCH_CACHE_TTL_MS: bad })).toThrow(
        /Expected a finite integer >= 1/,
      );
      expect(() => routerConfigFromEnv({ OMNISEARCH_CACHE_MAX_ENTRIES: bad })).toThrow(
        /Expected a finite integer >= 1/,
      );
    }
  });

  test("parses valid integer cache settings", () => {
    expect(
      routerConfigFromEnv({ OMNISEARCH_CACHE_TTL_MS: "250", OMNISEARCH_CACHE_MAX_ENTRIES: "25" }),
    ).toEqual({ primary: "brave", cacheTtlMs: 250, cacheMaxEntries: 25 });
  });
});


describe("parallel flag and participant config", () => {
  test("parses the --parallel boolean flag", () => {
    expect(parseCliArgs(["search", "q", "--parallel"])).toEqual({
      ok: true,
      mode: "search",
      query: "q",
      provider: undefined,
      max: undefined,
      parallel: true,
    });
    expect(parseCliArgs(["search", "q"])).toMatchObject({ ok: true, parallel: undefined });
  });

  test("the usage line mentions --parallel", () => {
    expect(USAGE).toContain("[--parallel]");
  });

  test("parses OMNISEARCH_PARALLEL into parallelParticipants", () => {
    expect(
      routerConfigFromEnv({
        OMNISEARCH_PARALLEL: "brave, tavily",
      }),
    ).toMatchObject({ parallelParticipants: ["brave", "tavily"] });
  });

  test("dedupes OMNISEARCH_PARALLEL entries keeping the first occurrence", () => {
    expect(routerConfigFromEnv({ OMNISEARCH_PARALLEL: "brave,brave" })).toMatchObject({
      parallelParticipants: ["brave"],
    });
    expect(routerConfigFromEnv({ OMNISEARCH_PARALLEL: "brave, tavily, brave" })).toMatchObject({
      parallelParticipants: ["brave", "tavily"],
    });
  });

  test("rejects unknown OMNISEARCH_PARALLEL entries", () => {
    expect(() => routerConfigFromEnv({ OMNISEARCH_PARALLEL: "brave, exa" })).toThrow(/exa/);
  });
});

describe("OMNISEARCH_TIMEOUT_MS", () => {
  test("parses the timeout and defaults to 30000", () => {
    expect(routerConfigFromEnv({})).toEqual({ primary: "brave" });
    expect(routerConfigFromEnv({ OMNISEARCH_TIMEOUT_MS: "5000" })).toEqual({
      primary: "brave",
      timeoutMs: 5000,
    });
    expect(() => routerConfigFromEnv({ OMNISEARCH_TIMEOUT_MS: "soon" })).toThrow(
      /OMNISEARCH_TIMEOUT_MS/,
    );
  });
});
