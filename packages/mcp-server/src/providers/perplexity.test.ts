import { describe, expect, test } from "bun:test";
import { createPerplexityProvider, type PerplexityClientLike } from "./perplexity.js";

function fakeClient(response: unknown, captured?: Array<Record<string, unknown>>): PerplexityClientLike {
  return {
    chat: {
      completions: {
        create: (async (params: Record<string, unknown>) => {
          captured?.push(params);
          return response;
        }) as PerplexityClientLike["chat"]["completions"]["create"],
      },
    },
  };
}

describe("createPerplexityProvider", () => {
  test("requests the sonar model with the user query", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const provider = await createPerplexityProvider({
      apiKey: "test-key",
      client: fakeClient({ choices: [{ message: { search_results: [] } }] }, captured),
    });

    await provider.search("latest typescript release");

    expect(captured).toHaveLength(1);
    expect(captured[0]?.model).toBe("sonar");
    expect(captured[0]?.messages).toEqual([{ role: "user", content: "latest typescript release" }]);
  });

  test("extracts search_results as the first priority", async () => {
    const provider = await createPerplexityProvider({
      apiKey: "test-key",
      client: fakeClient({
        choices: [
          {
            message: {
              search_results: [
                { title: "Announcing TS 7", url: "https://example.com/ts7" },
                { title: "Roadmap", url: "https://example.com/roadmap" },
              ],
              citations: ["https://stale.example.com"],
            },
          },
        ],
      }),
    });

    expect(await provider.search("typescript")).toEqual([
      { title: "Announcing TS 7", url: "https://example.com/ts7", snippet: "" },
      { title: "Roadmap", url: "https://example.com/roadmap", snippet: "" },
    ]);
  });

  test("falls back to annotations[].url_citation when search_results is absent", async () => {
    const provider = await createPerplexityProvider({
      apiKey: "test-key",
      client: fakeClient({
        choices: [
          {
            message: {
              annotations: [{ url_citation: { title: "Cited", url: "https://example.com/cited" } }],
            },
          },
        ],
      }),
    });

    expect(await provider.search("typescript")).toEqual([
      { title: "Cited", url: "https://example.com/cited", snippet: "" },
    ]);
  });

  test("falls back to bare citation URLs last", async () => {
    const provider = await createPerplexityProvider({
      apiKey: "test-key",
      client: fakeClient({
        choices: [{ message: { citations: ["https://example.com/a", "https://example.com/b"] } }],
      }),
    });

    expect(await provider.search("typescript")).toEqual([
      { title: "https://example.com/a", url: "https://example.com/a", snippet: "" },
      { title: "https://example.com/b", url: "https://example.com/b", snippet: "" },
    ]);
  });

  test("slices results to maxResults", async () => {
    const provider = await createPerplexityProvider({
      apiKey: "test-key",
      client: fakeClient({
        choices: [
          {
            message: {
              search_results: [
                { title: "A", url: "https://example.com/a" },
                { title: "B", url: "https://example.com/b" },
              ],
            },
          },
        ],
      }),
    });

    expect(await provider.search("typescript", { maxResults: 1 })).toHaveLength(1);
  });

  test("maps a missing SDK to a clear install hint", () => {
    expect(
      createPerplexityProvider({
        apiKey: "test-key",
        importSdk: async () => {
          throw new Error("Cannot find package 'openai' imported from perplexity.ts");
        },
      }),
    ).rejects.toThrow(/npm install openai/);
  });

  test("constructs a real SDK client when none is injected", async () => {
    const provider = await createPerplexityProvider({ apiKey: "test-key" });
    expect(provider.name).toBe("perplexity");
  });
});
