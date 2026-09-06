import { describe, expect, test } from "bun:test";
import { createSearxngProvider } from "./searxng.js";

function stubFetch(status: number, body: unknown, captured?: { url: string }): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    if (captured) captured.url = String(input instanceof Request ? input.url : input);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

describe("createSearxngProvider", () => {
  test("GETs the instance's /search endpoint with format=json and strips trailing slashes", async () => {
    const captured = { url: "" };
    const provider = createSearxngProvider({
      baseUrl: "https://searx.example.com/",
      fetchImpl: stubFetch(200, { results: [] }, captured),
    });

    await provider.search("latest typescript release");

    expect(captured.url).toBe("https://searx.example.com/search?q=latest+typescript+release&format=json");
  });

  test("slices results to maxResults (default 10) client-side", async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      title: `T${i}`,
      url: `https://example.com/${i}`,
      content: "c",
    }));
    const provider = createSearxngProvider({
      baseUrl: "https://searx.example.com",
      fetchImpl: stubFetch(200, { results: many }),
    });

    const all = await provider.search("q");
    expect(all).toHaveLength(10);

    const capped = await provider.search("q", { maxResults: 3 });
    expect(capped).toHaveLength(3);
  });

  test("maps results with HTML-stripped snippets", async () => {
    const provider = createSearxngProvider({
      baseUrl: "https://searx.example.com",
      fetchImpl: stubFetch(200, {
        results: [{ title: "TS 7", url: "https://example.com/ts7", content: "<i>Neat</i>" }],
      }),
    });

    expect(await provider.search("typescript")).toEqual([
      { title: "TS 7", url: "https://example.com/ts7", snippet: "Neat" },
    ]);
  });

  test("a 403 hints at enabling the JSON format", async () => {
    const provider = createSearxngProvider({
      baseUrl: "https://searx.example.com",
      fetchImpl: stubFetch(403, {}),
    });
    expect(provider.search("q")).rejects.toThrow(/403.*JSON format/s);
  });

  test("throws on other non-200 responses with the status code", () => {
    const provider = createSearxngProvider({
      baseUrl: "https://searx.example.com",
      fetchImpl: stubFetch(500, {}),
    });
    expect(provider.search("q")).rejects.toThrow(/500/);
  });

  test("throws a clear error when no base URL is available", () => {
    const prev = process.env.SEARXNG_BASE_URL;
    delete process.env.SEARXNG_BASE_URL;
    try {
      expect(() => createSearxngProvider({ fetchImpl: stubFetch(200, {}) })).toThrow(/SEARXNG_BASE_URL/);
    } finally {
      if (prev !== undefined) process.env.SEARXNG_BASE_URL = prev;
    }
  });
});
