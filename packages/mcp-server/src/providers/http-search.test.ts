import { describe, expect, test } from "bun:test";
import {
  clampMaxResults,
  createHttpSearchProvider,
  DEFAULT_MAX_RESULTS,
  toResult,
} from "./http-search.js";

interface CapturedInit {
  url: string;
  init: RequestInit | undefined;
}

function okFetch(body: unknown, captured?: CapturedInit): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (captured) {
      captured.url = String(input instanceof Request ? input.url : input);
      captured.init = init;
    }
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

function makeProvider(fetchImpl: typeof fetch, errorHint?: (status: number, body: string) => string) {
  return createHttpSearchProvider({
    name: "brave",
    label: "Brave",
    fetchImpl,
    errorHint,
    buildRequest: (query, options) => ({
      url: `https://example.com/search?q=${encodeURIComponent(query)}&count=${clampMaxResults(options.maxResults, 20)}`,
      init: { headers: { Accept: "application/json" } },
    }),
    parseResponse: (data) => {
      const { results } = data as { results?: Array<{ title?: string; url?: string; description?: string }> };
      return (results ?? []).map((r) => toResult(r.title, r.url, r.description));
    },
  });
}

describe("createHttpSearchProvider", () => {
  test("forwards the abort signal and request init to fetch", async () => {
    const captured: CapturedInit = { url: "", init: undefined };
    const provider = makeProvider(okFetch({ results: [] }, captured));

    const controller = new AbortController();
    await provider.search("q", { signal: controller.signal });

    expect(captured.init?.signal).toBe(controller.signal);
    expect(captured.init?.headers).toEqual({ Accept: "application/json" });
  });

  test("throws the standardized error shape on non-200, redacting key= params", () => {
    const provider = makeProvider((async () =>
      new Response('{"error":"bad","url":"https://x?key=secret123"}', { status: 401 })) as unknown as typeof fetch);

    expect(provider.search("q")).rejects.toThrow(
      /Brave search failed: HTTP 401 — .*key=REDACTED(?!.*secret123)/s,
    );
  });

  test("appends the provider's error hint between the status and the detail", () => {
    const provider = makeProvider(
      (async () => new Response("forbidden", { status: 403 })) as unknown as typeof fetch,
      (status) => (status === 403 ? " (enable JSON)" : ""),
    );

    expect(provider.search("q")).rejects.toThrow(/HTTP 403 \(enable JSON\) — forbidden/);
  });

  test("slices parsed results client-side to maxResults, default 10", async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ title: `T${i}`, url: `https://e.com/${i}` }));
    const provider = makeProvider(okFetch({ results: many }));

    expect(await provider.search("q")).toHaveLength(DEFAULT_MAX_RESULTS);
    expect(await provider.search("q", { maxResults: 3 })).toHaveLength(3);
  });

  test("maps raw fields through toResult with HTML stripping", async () => {
    const provider = makeProvider(
      okFetch({ results: [{ title: "T", url: "https://e.com", description: "<b>Bold</b>" }] }),
    );

    expect(await provider.search("q")).toEqual([
      { title: "T", url: "https://e.com", snippet: "Bold" },
    ]);
  });
});

describe("clampMaxResults", () => {
  test("defaults to 10 and clamps to the provider cap", () => {
    expect(clampMaxResults(undefined, 20)).toBe(10);
    expect(clampMaxResults(5, 20)).toBe(5);
    expect(clampMaxResults(99, 20)).toBe(20);
    expect(clampMaxResults(0, 20)).toBe(1);
  });
});
