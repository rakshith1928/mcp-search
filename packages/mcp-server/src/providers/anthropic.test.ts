import { describe, expect, test } from "bun:test";
import { createAnthropicProvider, type AnthropicClientLike } from "./anthropic.js";

function fakeClient(response: unknown, captured?: Array<Record<string, unknown>>): AnthropicClientLike {
  return {
    messages: {
      create: (async (params: Record<string, unknown>) => {
        captured?.push(params);
        return response;
      }) as AnthropicClientLike["messages"]["create"],
    },
  };
}

const twoResults = {
  content: [
    { type: "text", text: "Here is what I found." },
    {
      type: "web_search_tool_result",
      tool_use_id: "srv_1",
      content: [
        { type: "web_search_result", title: "Result A", url: "https://a.example.com" },
        { type: "web_search_result", title: "Result B", url: "https://b.example.com" },
      ],
    },
  ],
};

describe("createAnthropicProvider", () => {
  test("requests the pinned model with the web_search server tool", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const provider = await createAnthropicProvider({
      apiKey: "test-key",
      client: fakeClient(twoResults, captured),
    });

    await provider.search("latest typescript release");

    expect(captured).toHaveLength(1);
    expect(captured[0]?.model).toBe("claude-sonnet-4-20250514");
    expect(captured[0]?.messages).toEqual([{ role: "user", content: "latest typescript release" }]);
    const tools = captured[0]?.tools as Array<Record<string, unknown>>;
    expect(tools?.[0]?.type).toBe("web_search_20250305");
    expect(tools?.[0]?.name).toBe("web_search");
    expect(tools?.[0]?.max_uses).toBe(8);
  });

  test("extracts titles and urls from web_search_tool_result blocks", async () => {
    const provider = await createAnthropicProvider({
      apiKey: "test-key",
      client: fakeClient(twoResults),
    });

    const results = await provider.search("typescript");

    expect(results).toEqual([
      { title: "Result A", url: "https://a.example.com", snippet: "" },
      { title: "Result B", url: "https://b.example.com", snippet: "" },
    ]);
  });

  test("slices results to maxResults", async () => {
    const provider = await createAnthropicProvider({
      apiKey: "test-key",
      client: fakeClient(twoResults),
    });

    const results = await provider.search("typescript", { maxResults: 1 });

    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://a.example.com");
  });

  test("returns no results when the search errored server-side", async () => {
    const provider = await createAnthropicProvider({
      apiKey: "test-key",
      client: fakeClient({
        content: [
          { type: "web_search_tool_result", tool_use_id: "srv_1", content: { type: "web_search_tool_result_error", error_code: "too_many_requests" } },
        ],
      }),
    });

    expect(await provider.search("typescript")).toEqual([]);
  });

  test("maps a missing SDK to a clear install hint", async () => {
    expect(
      createAnthropicProvider({
        apiKey: "test-key",
        importSdk: async () => {
          throw new Error("Cannot find package '@anthropic-ai/sdk' imported from anthropic.ts");
        },
      }),
    ).rejects.toThrow(/npm install @anthropic-ai\/sdk/);
  });

  test("constructs a real SDK client when none is injected", async () => {
    const provider = await createAnthropicProvider({ apiKey: "test-key" });
    expect(provider.name).toBe("anthropic");
  });
});
