import { describe, expect, test } from "bun:test";
import { createOpenAIProvider, type OpenAIClientLike } from "./openai.js";

function fakeClient(response: unknown, captured?: Array<Record<string, unknown>>): OpenAIClientLike {
  return {
    responses: {
      create: (async (params: Record<string, unknown>) => {
        captured?.push(params);
        return response;
      }) as OpenAIClientLike["responses"]["create"],
    },
  };
}

const twoCitations = {
  output: [
    { type: "web_search_call", id: "ws_1" },
    {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "The latest release is TypeScript 7.",
          annotations: [
            { type: "url_citation", title: "Announcing TypeScript 7", url: "https://example.com/ts7" },
            { type: "url_citation", title: "TS Roadmap", url: "https://example.com/roadmap" },
          ],
        },
      ],
    },
  ],
};

describe("createOpenAIProvider", () => {
  test("requests the Responses API with gpt-4o and the web_search tool", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const provider = await createOpenAIProvider({
      apiKey: "test-key",
      client: fakeClient(twoCitations, captured),
    });

    await provider.search("latest typescript release");

    expect(captured).toHaveLength(1);
    expect(captured[0]?.model).toBe("gpt-4o");
    expect(captured[0]?.input).toBe("latest typescript release");
    expect(captured[0]?.tools).toEqual([{ type: "web_search" }]);
  });

  test("extracts url_citation annotations into results", async () => {
    const provider = await createOpenAIProvider({
      apiKey: "test-key",
      client: fakeClient(twoCitations),
    });

    const results = await provider.search("typescript");

    expect(results).toEqual([
      { title: "Announcing TypeScript 7", url: "https://example.com/ts7", snippet: "" },
      { title: "TS Roadmap", url: "https://example.com/roadmap", snippet: "" },
    ]);
  });

  test("slices results to maxResults", async () => {
    const provider = await createOpenAIProvider({
      apiKey: "test-key",
      client: fakeClient(twoCitations),
    });

    const results = await provider.search("typescript", { maxResults: 1 });

    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://example.com/ts7");
  });

  test("returns an empty array when there are no citations", async () => {
    const provider = await createOpenAIProvider({
      apiKey: "test-key",
      client: fakeClient({ output: [] }),
    });

    expect(await provider.search("typescript")).toEqual([]);
  });

  test("maps a missing SDK to a clear install hint", () => {
    expect(
      createOpenAIProvider({
        apiKey: "test-key",
        importSdk: async () => {
          throw new Error("Cannot find package 'openai' imported from openai.ts");
        },
      }),
    ).rejects.toThrow(/npm install openai/);
  });

  test("constructs a real SDK client when none is injected", async () => {
    const provider = await createOpenAIProvider({ apiKey: "test-key" });
    expect(provider.name).toBe("openai");
  });
});
