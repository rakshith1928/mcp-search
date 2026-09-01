import { describe, expect, test } from "bun:test";
import { createMoonshotProvider, type MoonshotClientLike } from "./moonshot.js";

interface Call {
  params: Record<string, unknown>;
}

function fakeClient(
  responses: Array<Record<string, unknown>>,
  captured?: Array<Call>,
): MoonshotClientLike {
  let call = 0;
  return {
    chat: {
      completions: {
        create: (async (params: Record<string, unknown>) => {
          captured?.push({ params });
          const response = responses[Math.min(call, responses.length - 1)];
          call += 1;
          return response;
        }) as MoonshotClientLike["chat"]["completions"]["create"],
      },
    },
  };
}

const toolCallRound = {
  choices: [
    {
      finish_reason: "tool_calls",
      message: {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "call_1", function: { name: "$web_search", arguments: '{"search_query":"typescript"}' } },
        ],
      },
    },
  ],
};

const finalAnswer = {
  choices: [
    {
      finish_reason: "stop",
      message: {
        role: "assistant",
        content: "The latest release is TypeScript 7.",
        annotations: [
          { url_citation: { title: "Announcing TypeScript 7", url: "https://example.com/ts7" } },
          { url_citation: { title: "Kimi docs", url: "https://example.com/kimi" } },
        ],
      },
    },
  ],
};

describe("createMoonshotProvider", () => {
  test("requests the builtin $web_search tool with thinking disabled", async () => {
    const captured: Array<Call> = [];
    const provider = await createMoonshotProvider({
      apiKey: "test-key",
      client: fakeClient([finalAnswer], captured),
    });

    await provider.search("latest typescript release");

    expect(captured).toHaveLength(1);
    expect(captured[0]?.params.model).toBe("kimi-k2-0711-preview");
    const tools = captured[0]?.params.tools as Array<Record<string, unknown>>;
    expect(tools?.[0]?.type).toBe("builtin_function");
    expect((tools?.[0]?.function as Record<string, unknown>)?.name).toBe("$web_search");
    expect(captured[0]?.params.thinking).toEqual({ type: "disabled" });
  });

  test("loops tool_calls rounds until a final answer arrives", async () => {
    const captured: Array<Call> = [];
    const provider = await createMoonshotProvider({
      apiKey: "test-key",
      client: fakeClient([toolCallRound, finalAnswer], captured),
    });

    const results = await provider.search("typescript");

    expect(captured).toHaveLength(2);
    const history = captured[1]?.params.messages as Array<{ role: string }>;
    expect(history.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
    expect(results).toEqual([
      { title: "Announcing TypeScript 7", url: "https://example.com/ts7", snippet: "" },
      { title: "Kimi docs", url: "https://example.com/kimi", snippet: "" },
    ]);
  });

  test("gives up after 8 tool rounds without a final answer", async () => {
    const provider = await createMoonshotProvider({
      apiKey: "test-key",
      client: fakeClient(Array(20).fill(toolCallRound)),
    });

    expect(provider.search("typescript")).rejects.toThrow(/8 tool rounds/);
  });

  test("slices results to maxResults", async () => {
    const provider = await createMoonshotProvider({
      apiKey: "test-key",
      client: fakeClient([finalAnswer]),
    });

    const results = await provider.search("typescript", { maxResults: 1 });
    expect(results).toHaveLength(1);
  });

  test("constructs a real SDK client when none is injected", async () => {
    const provider = await createMoonshotProvider({ apiKey: "test-key" });
    expect(provider.name).toBe("moonshot");
  });
});
