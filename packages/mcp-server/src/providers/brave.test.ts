import { describe, expect, test } from "bun:test";
import { createBraveProvider } from "./brave.js";

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
}

function stubFetch(
  status: number,
  body: unknown,
  captured?: CapturedRequest,
): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (captured) {
      captured.url = String(input instanceof Request ? input.url : input);
      captured.headers = Object.fromEntries(
        Object.entries((init?.headers as Record<string, string>) ?? {}).map(
          ([k, v]) => [k.toLowerCase(), v],
        ),
      );
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("createBraveProvider", () => {
  test("sends a GET to the Brave web search endpoint with query, count, and subscription token", async () => {
    const captured: CapturedRequest = { url: "", headers: {} };
    const provider = createBraveProvider({
      apiKey: "test-key",
      fetchImpl: stubFetch(200, { web: { results: [] } }, captured),
    });

    await provider.search("latest typescript release", { maxResults: 5 });

    expect(captured.url.startsWith("https://api.search.brave.com/res/v1/web/search?")).toBe(true);
    expect(captured.url).toContain("q=latest+typescript+release");
    expect(captured.url).toContain("count=5");
    expect(captured.headers["x-subscription-token"]).toBe("test-key");
    expect(captured.headers["accept"]).toBe("application/json");
  });

  test("defaults to 10 results when no maxResults is given", async () => {
    const captured: CapturedRequest = { url: "", headers: {} };
    const provider = createBraveProvider({
      apiKey: "test-key",
      fetchImpl: stubFetch(200, { web: { results: [] } }, captured),
    });

    await provider.search("anything");

    expect(captured.url).toContain("count=10");
  });

  test("maps web results into SearchResult objects", async () => {
    const provider = createBraveProvider({
      apiKey: "test-key",
      fetchImpl: stubFetch(200, {
        web: {
          results: [
            { title: "TypeScript 7", url: "https://example.com/ts7", description: "The release notes" },
            { title: "TS Blog", url: "https://example.com/blog", description: "Announcement" },
          ],
        },
      }),
    });

    const results = await provider.search("typescript");

    expect(results).toEqual([
      { title: "TypeScript 7", url: "https://example.com/ts7", snippet: "The release notes" },
      { title: "TS Blog", url: "https://example.com/blog", snippet: "Announcement" },
    ]);
  });

  test("strips HTML markup from snippets", async () => {
    const provider = createBraveProvider({
      apiKey: "test-key",
      fetchImpl: stubFetch(200, {
        web: {
          results: [
            { title: "T", url: "https://example.com", description: "<b>Bold</b> &amp; clean" },
          ],
        },
      }),
    });

    const [result] = await provider.search("typescript");
    expect(result?.snippet).toBe("Bold & clean");
  });

  test("throws on non-200 responses, including the status code", async () => {
    const provider = createBraveProvider({
      apiKey: "test-key",
      fetchImpl: stubFetch(429, { error: "rate limited" }),
    });

    expect(provider.search("typescript")).rejects.toThrow(/429/);
  });

  test("returns an empty array when the response has no web results", async () => {
    const provider = createBraveProvider({
      apiKey: "test-key",
      fetchImpl: stubFetch(200, {}),
    });

    expect(await provider.search("nothing found")).toEqual([]);
  });

  test("throws a clear error when no API key is available", () => {
    const prev = process.env.BRAVE_API_KEY;
    delete process.env.BRAVE_API_KEY;
    try {
      expect(() => createBraveProvider({ fetchImpl: stubFetch(200, {}) })).toThrow(/BRAVE_API_KEY/);
    } finally {
      if (prev !== undefined) process.env.BRAVE_API_KEY = prev;
    }
  });
});
