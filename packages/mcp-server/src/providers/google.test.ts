import { describe, expect, test } from "bun:test";
import { createGoogleProvider } from "./google.js";

function stubFetch(status: number, body: unknown, captured?: { url: string }): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    if (captured) captured.url = String(input instanceof Request ? input.url : input);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

describe("createGoogleProvider", () => {
  test("GETs the custom search endpoint with key, cx, q, and num", async () => {
    const captured = { url: "" };
    const provider = createGoogleProvider({
      apiKey: "test-key",
      searchEngineId: "test-cx",
      fetchImpl: stubFetch(200, { items: [] }, captured),
    });

    await provider.search("latest typescript release", { maxResults: 5 });

    expect(captured.url.startsWith("https://www.googleapis.com/customsearch/v1?")).toBe(true);
    expect(captured.url).toContain("key=test-key");
    expect(captured.url).toContain("cx=test-cx");
    expect(captured.url).toContain("q=latest+typescript+release");
    expect(captured.url).toContain("num=5");
  });

  test("clamps num to Google's maximum of 10", async () => {
    const captured = { url: "" };
    const provider = createGoogleProvider({
      apiKey: "k",
      searchEngineId: "cx",
      fetchImpl: stubFetch(200, { items: [] }, captured),
    });

    await provider.search("q", { maxResults: 50 });
    expect(captured.url).toContain("num=10");
  });

  test("maps items into SearchResult objects with HTML-stripped snippets", async () => {
    const provider = createGoogleProvider({
      apiKey: "k",
      searchEngineId: "cx",
      fetchImpl: stubFetch(200, {
        items: [{ title: "TS 7", link: "https://example.com/ts7", snippet: "<b>Big</b> news" }],
      }),
    });

    expect(await provider.search("typescript")).toEqual([
      { title: "TS 7", url: "https://example.com/ts7", snippet: "Big news" },
    ]);
  });

  test("returns an empty array when items are absent", async () => {
    const provider = createGoogleProvider({
      apiKey: "k",
      searchEngineId: "cx",
      fetchImpl: stubFetch(200, {}),
    });
    expect(await provider.search("q")).toEqual([]);
  });

  test("throws on non-200 with the status code", () => {
    const provider = createGoogleProvider({
      apiKey: "k",
      searchEngineId: "cx",
      fetchImpl: stubFetch(403, { error: { message: "quota exceeded" } }),
    });
    expect(provider.search("q")).rejects.toThrow(/403/);
  });

  test("throws a clear error naming GOOGLE_SEARCH_ENGINE_ID when it is missing", () => {
    const prev = process.env.GOOGLE_SEARCH_ENGINE_ID;
    delete process.env.GOOGLE_SEARCH_ENGINE_ID;
    try {
      expect(() => createGoogleProvider({ apiKey: "k", fetchImpl: stubFetch(200, {}) })).toThrow(
        /GOOGLE_SEARCH_ENGINE_ID/,
      );
    } finally {
      if (prev !== undefined) process.env.GOOGLE_SEARCH_ENGINE_ID = prev;
    }
  });

  test("throws a clear error naming GOOGLE_API_KEY when it is missing", () => {
    const prevKey = process.env.GOOGLE_API_KEY;
    const prevCx = process.env.GOOGLE_SEARCH_ENGINE_ID;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_SEARCH_ENGINE_ID;
    try {
      expect(() => createGoogleProvider({ fetchImpl: stubFetch(200, {}) })).toThrow(/GOOGLE_API_KEY/);
    } finally {
      if (prevKey !== undefined) process.env.GOOGLE_API_KEY = prevKey;
      if (prevCx !== undefined) process.env.GOOGLE_SEARCH_ENGINE_ID = prevCx;
    }
  });
});
