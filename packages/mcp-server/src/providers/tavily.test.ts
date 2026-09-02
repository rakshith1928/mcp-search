import { describe, expect, test } from "bun:test";
import { createTavilyProvider } from "./tavily.js";

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

function stubFetch(status: number, body: unknown, captured?: CapturedRequest): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (captured) {
      captured.url = String(input instanceof Request ? input.url : input);
      captured.headers = Object.fromEntries(
        Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
      );
      captured.body = init?.body ? JSON.parse(String(init.body)) : undefined;
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("createTavilyProvider", () => {
  test("POSTs to the Tavily search endpoint with bearer token, query, and max_results", async () => {
    const captured: CapturedRequest = { url: "", headers: {} };
    const provider = createTavilyProvider({
      apiKey: "test-key",
      fetchImpl: stubFetch(200, { results: [] }, captured),
    });

    await provider.search("latest typescript release", { maxResults: 5 });

    expect(captured.url).toBe("https://api.tavily.com/search");
    expect(captured.headers["authorization"]).toBe("Bearer test-key");
    expect(captured.headers["content-type"]).toBe("application/json");
    expect(captured.body).toEqual({ query: "latest typescript release", max_results: 5 });
  });

  test("defaults max_results to 10 and clamps to 20", async () => {
    const captured: CapturedRequest = { url: "", headers: {} };
    const provider = createTavilyProvider({
      apiKey: "test-key",
      fetchImpl: stubFetch(200, { results: [] }, captured),
    });

    await provider.search("q");
    expect(captured.body).toEqual({ query: "q", max_results: 10 });

    await provider.search("q", { maxResults: 99 });
    expect(captured.body).toEqual({ query: "q", max_results: 20 });
  });

  test("maps results into SearchResult objects with HTML-stripped snippets", async () => {
    const provider = createTavilyProvider({
      apiKey: "test-key",
      fetchImpl: stubFetch(200, {
        results: [
          { title: "TS 7", url: "https://example.com/ts7", content: "<b>The</b> release notes" },
        ],
      }),
    });

    expect(await provider.search("typescript")).toEqual([
      { title: "TS 7", url: "https://example.com/ts7", snippet: "The release notes" },
    ]);
  });

  test("throws on non-200 responses, including the status code", () => {
    const provider = createTavilyProvider({
      apiKey: "test-key",
      fetchImpl: stubFetch(429, { error: "rate limited" }),
    });
    expect(provider.search("typescript")).rejects.toThrow(/429/);
  });

  test("returns an empty array when results are absent", async () => {
    const provider = createTavilyProvider({
      apiKey: "test-key",
      fetchImpl: stubFetch(200, {}),
    });
    expect(await provider.search("nothing")).toEqual([]);
  });

  test("throws a clear error when no API key is available", () => {
    const prev = process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_API_KEY;
    try {
      expect(() => createTavilyProvider({ fetchImpl: stubFetch(200, {}) })).toThrow(/TAVILY_API_KEY/);
    } finally {
      if (prev !== undefined) process.env.TAVILY_API_KEY = prev;
    }
  });
});
