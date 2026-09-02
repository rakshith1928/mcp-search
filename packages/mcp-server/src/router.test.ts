import { describe, expect, test } from "bun:test";
import { createRouter, type RouterConfig } from "./router.js";
import type { SearchProvider } from "./types.js";

function fakeProvider(name: SearchProvider["name"], resultCount = 2): SearchProvider {
  return {
    name,
    search: async () =>
      Array.from({ length: resultCount }, (_, i) => ({
        title: `${name} result ${i + 1}`,
        url: `https://example.com/${name}/${i + 1}`,
        snippet: `Snippet from ${name}`,
      })),
  };
}

function failingProvider(name: SearchProvider["name"], message: string): SearchProvider {
  return { name, search: async () => { throw new Error(message); } };
}

function config(overrides: Partial<RouterConfig>): RouterConfig {
  return { primary: "brave", ...overrides };
}

describe("createRouter", () => {
  test("returns normalized markdown with header, results, and sources", async () => {
    const router = createRouter(config({ providers: { brave: fakeProvider("brave") } }));

    const response = await router.search("typescript");

    expect(response.markdown).toContain("## Web Search Results");
    expect(response.markdown).toContain("[brave result 1](https://example.com/brave/1)");
    expect(response.markdown).toContain("## Sources");
    expect(response.cached).toBe(false);
    expect(response.provider).toBe("brave");
    expect(response.fellBack).toBe(false);
  });

  test("serves identical queries from cache without hitting the provider twice", async () => {
    let calls = 0;
    const provider: SearchProvider = {
      name: "brave",
      search: async () => {
        calls += 1;
        return [{ title: "T", url: "https://example.com", snippet: "S" }];
      },
    };
    const router = createRouter(config({ providers: { brave: provider } }));

    const first = await router.search("typescript");
    const second = await router.search("typescript");

    expect(calls).toBe(1);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.markdown).toBe(first.markdown);
    expect(second.results).toEqual(first.results);
  });

  test("falls back to the next provider when the primary fails", async () => {
    const router = createRouter(
      config({
        primary: "brave",
        fallback: ["moonshot"],
        providers: {
          brave: failingProvider("brave", "HTTP 429"),
          moonshot: fakeProvider("moonshot"),
        },
      }),
    );

    const response = await router.search("typescript");

    expect(response.fellBack).toBe(true);
    expect(response.requestedProvider).toBe("brave");
    expect(response.provider).toBe("moonshot");
    expect(response.results[0]?.title).toContain("moonshot result 1");
  });

  test("tries fallbacks in order", async () => {
    const router = createRouter(
      config({
        primary: "brave",
        fallback: ["openai", "moonshot"],
        providers: {
          brave: failingProvider("brave", "down"),
          openai: failingProvider("openai", "also down"),
          moonshot: fakeProvider("moonshot"),
        },
      }),
    );

    const response = await router.search("typescript");
    expect(response.provider).toBe("moonshot");
  });

  test("throws a combined error when every provider fails", async () => {
    const router = createRouter(
      config({
        primary: "brave",
        fallback: ["openai"],
        providers: {
          brave: failingProvider("brave", "HTTP 500"),
          openai: failingProvider("openai", "HTTP 401"),
        },
      }),
    );

    expect(router.search("typescript")).rejects.toThrow(/brave[\s\S]*500[\s\S]*openai[\s\S]*401/);
  });

  test("forwards maxResults to the provider", async () => {
    let received: unknown;
    const provider: SearchProvider = {
      name: "brave",
      search: async (_query, options) => {
        received = options;
        return [];
      },
    };
    const router = createRouter(config({ providers: { brave: provider } }));

    await router.search("typescript", { maxResults: 7 });

    expect(received).toEqual({ maxResults: 7 });
  });

  test("respects an injected rate limiter per attempt", async () => {
    const acquisitions: string[] = [];
    const limiter = {
      acquire: async () => {
        acquisitions.push("acquire");
      },
    };
    const provider = fakeProvider("brave");
    const router = createRouter(config({ providers: { brave: provider }, limiters: { brave: limiter } }));

    await router.search("typescript");

    expect(acquisitions).toEqual(["acquire"]);
  });

  test("cache hits do not acquire the rate limiter", async () => {
    let acquisitions = 0;
    const limiter = {
      acquire: async () => {
        acquisitions += 1;
      },
    };
    const router = createRouter(
      config({ providers: { brave: fakeProvider("brave") }, limiters: { brave: limiter } }),
    );

    await router.search("typescript");
    await router.search("typescript");

    expect(acquisitions).toBe(1);
  });

  test("each fallback attempt acquires its own provider's limiter", async () => {
    const acquisitions: string[] = [];
    const makeLimiter = (name: string) => ({
      acquire: async () => {
        acquisitions.push(name);
      },
    });
    const router = createRouter(
      config({
        primary: "brave",
        fallback: ["openai"],
        providers: {
          brave: failingProvider("brave", "down"),
          openai: fakeProvider("openai"),
        },
        limiters: { brave: makeLimiter("brave"), openai: makeLimiter("openai") },
      }),
    );

    await router.search("typescript");

    expect(acquisitions).toEqual(["brave", "openai"]);
  });
});
