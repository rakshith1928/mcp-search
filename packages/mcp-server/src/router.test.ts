import { describe, expect, test } from "bun:test";
import { createRouter, isTransientSearchError, type RouterConfig } from "./router.js";
import type { ProviderName, SearchProvider, SearchResult } from "./types.js";

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
        sleepImpl: async () => {},
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
          brave: failingProvider("brave", "HTTP 401"),
          openai: failingProvider("openai", "HTTP 401"),
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
        sleepImpl: async () => {},
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

    expect(received).toMatchObject({ maxResults: 7 });
    expect((received as { signal?: unknown }).signal).toBeInstanceOf(AbortSignal);
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

  test("a provider that fails to load does not acquire its rate limiter", async () => {
    const { clearProviderCache } = await import("./providers/index.js");
    const prev = process.env.BRAVE_API_KEY;
    delete process.env.BRAVE_API_KEY;
    clearProviderCache();
    let acquisitions = 0;
    try {
      const router = createRouter(
        config({
          limiters: {
            brave: {
              acquire: async () => {
                acquisitions += 1;
              },
            },
          },
        }),
      );

      await expect(router.search("typescript")).rejects.toThrow(/BRAVE_API_KEY/);
      expect(acquisitions).toBe(0);
    } finally {
      clearProviderCache();
      if (prev === undefined) delete process.env.BRAVE_API_KEY;
      else process.env.BRAVE_API_KEY = prev;
    }
  });

  test("does not attempt the primary twice when the fallback list includes it", async () => {
    let braveCalls = 0;
    const router = createRouter(
      config({
        primary: "brave",
        fallback: ["brave", "openai"],
        // permanent failure: isolates chain-dedupe from retry semantics
        providers: { brave: { name: "brave", search: async () => { braveCalls += 1; throw new Error("HTTP 401"); } }, openai: fakeProvider("openai") },
      }),
    );

    const response = await router.search("typescript");

    expect(response.provider).toBe("openai");
    expect(braveCalls).toBe(1);
  });
});

describe("createRouter chain override", () => {
  test("routes through the override chain instead of the default primary", async () => {
    const router = createRouter(
      config({ providers: { brave: fakeProvider("brave"), openai: fakeProvider("openai") } }),
    );

    const response = await router.search("typescript", {}, ["openai"]);

    expect(response.provider).toBe("openai");
    expect(response.fellBack).toBe(false);
  });

  test("falls back within the override chain", async () => {
    const router = createRouter(
      config({
        providers: {
          brave: fakeProvider("brave"),
          openai: failingProvider("openai", "down"),
        },
      }),
    );

    const response = await router.search("typescript", {}, ["openai", "brave"]);

    expect(response.provider).toBe("brave");
    expect(response.fellBack).toBe(true);
    expect(response.requestedProvider).toBe("openai");
  });

  test("cache keys distinguish provider overrides", async () => {
    let braveCalls = 0;
    let openaiCalls = 0;
    const brave: SearchProvider = {
      name: "brave",
      search: async () => {
        braveCalls += 1;
        return [{ title: "b", url: "https://b.example.com", snippet: "" }];
      },
    };
    const openai: SearchProvider = {
      name: "openai",
      search: async () => {
        openaiCalls += 1;
        return [{ title: "o", url: "https://o.example.com", snippet: "" }];
      },
    };
    const router = createRouter(config({ providers: { brave, openai } }));

    await router.search("q");
    await router.search("q", {}, ["openai"]);
    await router.search("q"); // brave result still cached

    expect(braveCalls).toBe(1);
    expect(openaiCalls).toBe(1);
  });
});

describe("createRouter parallel mode", () => {
  function fakeProvider(name: SearchProvider["name"], results: SearchResult[]): SearchProvider {
    return { name, search: async () => results };
  }

  const b1: SearchResult = { title: "b1", url: "https://b.example.com/1", snippet: "" };
  const b2: SearchResult = { title: "b2", url: "https://b.example.com/2", snippet: "" };
  const o1: SearchResult = { title: "o1", url: "https://o.example.com/1", snippet: "" };
  const o2: SearchResult = { title: "o2", url: "https://o.example.com/2", snippet: "" };

  test("fans out to every participant and merges round-robin", async () => {
    const router = createRouter({
      primary: "brave",
      parallelParticipants: ["brave", "openai"],
      providers: { brave: fakeProvider("brave", [b1, b2]), openai: fakeProvider("openai", [o1, o2]) },
    });

    const response = await router.search("q", {}, undefined, true);

    expect(response.mode).toBe("parallel");
    expect(response.providers).toEqual(["brave", "openai"]);
    expect(response.failedProviders).toEqual([]);
    expect(response.provider).toBe("brave");
    expect(response.results).toEqual([b1, o1, b2, o2]);
    expect(response.markdown).toContain("(via parallel: brave, openai)");
  });

  test("dedupes by URL keeping the first occurrence", async () => {
    const dupe: SearchResult = { title: "dupe", url: "https://b.example.com/1", snippet: "" };
    const router = createRouter({
      primary: "brave",
      parallelParticipants: ["brave", "openai"],
      providers: { brave: fakeProvider("brave", [b1]), openai: fakeProvider("openai", [dupe, o2]) },
    });

    const response = await router.search("q", {}, undefined, true);

    expect(response.results).toEqual([b1, o2]);
  });

  test("caps merged results at maxResults", async () => {
    const router = createRouter({
      primary: "brave",
      parallelParticipants: ["brave", "openai"],
      providers: {
        brave: fakeProvider("brave", [b1, b2, { title: "b3", url: "https://b.example.com/3", snippet: "" }]),
        openai: fakeProvider("openai", [o1, o2, { title: "o3", url: "https://o.example.com/3", snippet: "" }]),
      },
    });

    const response = await router.search("q", { maxResults: 3 }, undefined, true);

    expect(response.results).toEqual([b1, o1, b2]);
  });

  test("reports failed participants and keeps successful results", async () => {
    const router = createRouter({
      primary: "brave",
      parallelParticipants: ["brave", "openai"],
      providers: { brave: failingProvider("brave", "down"), openai: fakeProvider("openai", [o1]) },
    });

    const response = await router.search("q", {}, undefined, true);

    expect(response.failedProviders).toEqual(["brave"]);
    expect(response.providers).toEqual(["brave", "openai"]);
    expect(response.results).toEqual([o1]);
    expect(response.markdown).toContain("Note: 1 provider(s) failed: brave");
  });

  test("throws the combined error when every participant fails", async () => {
    const router = createRouter({
      primary: "brave",
      parallelParticipants: ["brave", "openai"],
      providers: { brave: failingProvider("brave", "down"), openai: failingProvider("openai", "also down") },
    });

    expect(router.search("q", {}, undefined, true)).rejects.toThrow(/All search providers failed/);
  });

  test("caches per participant and the merged response", async () => {
    let braveCalls = 0;
    let openaiCalls = 0;
    const counting = (name: SearchProvider["name"], counter: () => void): SearchProvider => ({
      name,
      search: async () => {
        counter();
        return name === "brave" ? [b1] : [o1];
      },
    });
    const router = createRouter({
      primary: "brave",
      parallelParticipants: ["brave", "openai"],
      providers: {
        brave: counting("brave", () => {
          braveCalls += 1;
        }),
        openai: counting("openai", () => {
          openaiCalls += 1;
        }),
      },
    });

    await router.search("q", {}, undefined, true);
    await router.search("q", {}, undefined, true);
    await router.search("q");

    expect(braveCalls).toBe(1);
    expect(openaiCalls).toBe(1);
  });

  test("does not reuse a single-mode fallback entry cached under the requested provider", async () => {
    let braveCalls = 0;
    let openaiCalls = 0;
    const brave: SearchProvider = {
      name: "brave",
      search: async () => {
        braveCalls += 1;
        throw new Error("HTTP 401"); // permanent: isolates cache provenance from retry semantics
      },
    };
    const openai: SearchProvider = {
      name: "openai",
      search: async () => {
        openaiCalls += 1;
        return [o1];
      },
    };
    const router = createRouter(
      config({
        primary: "brave",
        fallback: ["openai"],
        parallelParticipants: ["brave", "openai"],
        providers: { brave, openai },
      }),
    );

    const single = await router.search("q");
    expect(single.provider).toBe("openai");
    expect(single.fellBack).toBe(true);

    const parallel = await router.search("q", {}, undefined, true);

    expect(parallel.mode).toBe("parallel");
    expect(parallel.failedProviders).toEqual(["brave"]);
    expect(parallel.results).toEqual([o1]);
    expect(parallel.markdown).toContain("Note: 1 provider(s) failed: brave");
    expect(braveCalls).toBe(2); // attempted again in parallel mode; poisoned entry not reused
    expect(openaiCalls).toBe(2); // re-served parallel mode; its results stay attributed to openai
  });

  test("config parallelParticipants take priority over the env presence scan", async () => {
    const prev = process.env.BRAVE_API_KEY;
    process.env.BRAVE_API_KEY = "env-key";
    try {
      let braveCalls = 0;
      let openaiCalls = 0;
      const router = createRouter({
        primary: "brave",
        parallelParticipants: ["openai"],
        providers: {
          brave: {
            name: "brave",
            search: async () => {
              braveCalls += 1;
              return [b1];
            },
          },
          openai: {
            name: "openai",
            search: async () => {
              openaiCalls += 1;
              return [o1];
            },
          },
        },
      });

      const response = await router.search("q", {}, undefined, true);

      expect(response.providers).toEqual(["openai"]);
      expect(openaiCalls).toBe(1);
      expect(braveCalls).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.BRAVE_API_KEY;
      else process.env.BRAVE_API_KEY = prev;
    }
  });

  test("without explicit participants, scans env presence", async () => {
    const prevBrave = process.env.BRAVE_API_KEY;
    const prevOpenai = process.env.OPENAI_API_KEY;
    delete process.env.BRAVE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "env-key";
    try {
      const router = createRouter({
        primary: "brave",
        providers: { openai: fakeProvider("openai", [o1]) },
      });

      const response = await router.search("q", {}, undefined, true);

      expect(response.providers).toEqual(["openai"]);
      expect(response.results).toEqual([o1]);
    } finally {
      if (prevBrave !== undefined) process.env.BRAVE_API_KEY = prevBrave;
      else delete process.env.BRAVE_API_KEY;
      if (prevOpenai !== undefined) process.env.OPENAI_API_KEY = prevOpenai;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  test("falls back to single search when no participants resolve", async () => {
    const prevBrave = process.env.BRAVE_API_KEY;
    const prevOpenai = process.env.OPENAI_API_KEY;
    delete process.env.BRAVE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const router = createRouter({
        primary: "brave",
        providers: { brave: fakeProvider("brave", [b1]) },
      });

      const response = await router.search("q", {}, undefined, true);

      expect(response.mode).toBeUndefined();
      expect(response.provider).toBe("brave");
      expect(response.results).toEqual([b1]);
    } finally {
      if (prevBrave !== undefined) process.env.BRAVE_API_KEY = prevBrave;
      else delete process.env.BRAVE_API_KEY;
      if (prevOpenai !== undefined) process.env.OPENAI_API_KEY = prevOpenai;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  test("dedupes explicit parallelParticipants so a repeated provider fans out once", async () => {
    let braveCalls = 0;
    const brave: SearchProvider = {
      name: "brave",
      search: async () => {
        braveCalls += 1;
        return [b1];
      },
    };
    const router = createRouter(
      config({ parallelParticipants: ["brave", "brave"], providers: { brave } }),
    );

    const response = await router.search("q", {}, undefined, true);

    expect(response.providers).toEqual(["brave"]);
    expect(braveCalls).toBe(1);
    expect(response.results).toEqual([b1]);
  });

  test("rejects unknown explicit parallelParticipants naming the available set", async () => {
    const router = createRouter(
      config({
        parallelParticipants: ["brave", "exa" as ProviderName],
        providers: { brave: fakeProvider("brave", [b1]) },
      }),
    );

    expect(router.search("q", {}, undefined, true)).rejects.toThrow(
      /Invalid parallel participant 'exa'[\s\S]*Available:/,
    );
  });

  test("acquires each participant's limiter exactly once per parallel search", async () => {
    const acquisitions: string[] = [];
    const makeLimiter = (name: string) => ({
      acquire: async () => {
        acquisitions.push(name);
      },
    });
    const router = createRouter(
      config({
        parallelParticipants: ["brave", "openai"],
        providers: { brave: fakeProvider("brave", [b1]), openai: fakeProvider("openai", [o1]) },
        limiters: { brave: makeLimiter("brave"), openai: makeLimiter("openai") },
      }),
    );

    const response = await router.search("q", {}, undefined, true);

    expect(response.failedProviders).toEqual([]);
    expect([...acquisitions].sort()).toEqual(["brave", "openai"]);
  });
});

describe("timeout propagation", () => {
  test("passes a fresh AbortSignal to the provider on every attempt", async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const provider: SearchProvider = {
      name: "brave",
      search: async (_query, options) => {
        signals.push(options?.signal);
        return [{ title: "T", url: "https://example.com", snippet: "" }];
      },
    };
    const router = createRouter({ primary: "brave", timeoutMs: 1234, providers: { brave: provider } });

    await router.search("q");

    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    await router.search("q2", {}, undefined, true);
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
  });

  test("parallel mode forwards the signal too", async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const provider: SearchProvider = {
      name: "brave",
      search: async (_query, options) => {
        signals.push(options?.signal);
        return [{ title: "T", url: "https://example.com", snippet: "" }];
      },
    };
    const router = createRouter({
      primary: "brave",
      timeoutMs: 1234,
      parallelParticipants: ["brave"],
      providers: { brave: provider },
    });

    await router.search("q", {}, undefined, true);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });
});

describe("isTransientSearchError", () => {
  test("classifies HTTP 5xx and 429 as transient", () => {
    expect(isTransientSearchError(new Error("Brave search failed: HTTP 500 — oops"))).toBe(true);
    expect(isTransientSearchError(new Error("Tavily search failed: HTTP 503"))).toBe(true);
    expect(isTransientSearchError(new Error("Google search failed: HTTP 429"))).toBe(true);
  });

  test("classifies network and timeout failures as transient", () => {
    expect(isTransientSearchError(new TypeError("fetch failed"))).toBe(true);
    const nested = new Error("search failed", { cause: new Error("ECONNRESET") });
    expect(isTransientSearchError(nested)).toBe(true);
    expect(
      isTransientSearchError(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    ).toBe(true);
    expect(isTransientSearchError(new Error("request aborted"))).toBe(true);
  });

  test("classifies permanent errors as non-transient", () => {
    expect(isTransientSearchError(new Error("Brave search failed: HTTP 401 — bad key"))).toBe(false);
    expect(isTransientSearchError(new Error("Google search failed: HTTP 403 — quota"))).toBe(false);
    expect(isTransientSearchError(new Error("Missing required environment variable BRAVE_API_KEY."))).toBe(false);
    expect(isTransientSearchError("not an error")).toBe(false);
  });
});

describe("retry with backoff", () => {
  function sleepRecorder() {
    const sleeps: number[] = [];
    const impl = async (ms: number) => {
      sleeps.push(ms);
    };
    return { sleeps, impl };
  }

  test("retries a transient failure and succeeds within 3 attempts", async () => {
    let attempts = 0;
    const provider: SearchProvider = {
      name: "brave",
      search: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("Brave search failed: HTTP 503");
        return [{ title: "T", url: "https://example.com", snippet: "" }];
      },
    };
    const limiter = { acquire: async () => {} };
    const { sleeps, impl } = sleepRecorder();
    const router = createRouter({
      primary: "brave",
      providers: { brave: provider },
      limiters: { brave: limiter },
      sleepImpl: impl,
    });

    const response = await router.search("q");

    expect(attempts).toBe(3);
    expect(response.results).toHaveLength(1);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(500);
    expect(sleeps[0]).toBeLessThanOrEqual(750);
    expect(sleeps[1]).toBeGreaterThanOrEqual(1000);
    expect(sleeps[1]).toBeLessThanOrEqual(1250);
  });

  test("does not retry permanent failures", async () => {
    let attempts = 0;
    const provider: SearchProvider = {
      name: "brave",
      search: async () => {
        attempts += 1;
        throw new Error("Brave search failed: HTTP 401 — bad key");
      },
    };
    const { sleeps, impl } = sleepRecorder();
    const router = createRouter({
      primary: "brave",
      providers: { brave: provider },
      sleepImpl: impl,
    });

    await expect(router.search("q")).rejects.toThrow(/401/);
    expect(attempts).toBe(1);
    expect(sleeps).toEqual([]);
  });

  test("gives up after 3 attempts and reports the last error", async () => {
    let attempts = 0;
    const provider: SearchProvider = {
      name: "brave",
      search: async () => {
        attempts += 1;
        throw new Error("Brave search failed: HTTP 500");
      },
    };
    const { sleeps, impl } = sleepRecorder();
    const router = createRouter({
      primary: "brave",
      providers: { brave: provider },
      sleepImpl: impl,
    });

    await expect(router.search("q")).rejects.toThrow(/500/);
    expect(attempts).toBe(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[0]).toBeLessThanOrEqual(750);
    expect(sleeps[1]).toBeGreaterThanOrEqual(1000);
    expect(sleeps[1]).toBeLessThanOrEqual(1250);
  });

  test("retries acquire an extra rate-limit token per attempt", async () => {
    let attempts = 0;
    const provider: SearchProvider = {
      name: "brave",
      search: async () => {
        attempts += 1;
        if (attempts < 2) throw new Error("Brave search failed: HTTP 500");
        return [];
      },
    };
    let acquisitions = 0;
    const limiter = {
      acquire: async () => {
        acquisitions += 1;
      },
    };
    const router = createRouter({
      primary: "brave",
      providers: { brave: provider },
      limiters: { brave: limiter },
      sleepImpl: async () => {},
    });

    await router.search("q");

    expect(attempts).toBe(2);
    expect(acquisitions).toBe(2);
  });

  test("parallel participants retry independently", async () => {
    let braveAttempts = 0;
    const router = createRouter({
      primary: "brave",
      parallelParticipants: ["brave", "openai"],
      providers: {
        brave: {
          name: "brave",
          search: async () => {
            braveAttempts += 1;
            if (braveAttempts < 2) throw new Error("Brave search failed: HTTP 500");
            return [{ title: "b1", url: "https://b.example.com", snippet: "" }];
          },
        },
        openai: {
          name: "openai",
          search: async () => [{ title: "o1", url: "https://o.example.com", snippet: "" }],
        },
      },
      sleepImpl: async () => {},
    });

    const response = await router.search("q", {}, undefined, true);

    expect(braveAttempts).toBe(2);
    expect(response.failedProviders).toEqual([]);
    expect(response.results).toHaveLength(2);
  });
});
