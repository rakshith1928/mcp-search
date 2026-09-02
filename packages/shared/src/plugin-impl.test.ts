import { describe, expect, test } from "bun:test";
import {
  createPluginHooks,
  OMNISEARCH_TOOL_NAME,
  type OmnisearchToolDefinition,
  type OmnisearchToolFn,
} from "./plugin-impl.js";
import type { SearchProvider } from "@omnisearch/mcp-server";

const fakeBrave: SearchProvider = {
  name: "brave",
  search: async (query, options) => {
    const all = [
      { title: "Brave hit", url: "https://example.com/brave", snippet: `About ${query}` },
      { title: "Brave two", url: "https://example.com/brave/2", snippet: "Snip" },
    ];
    return options?.maxResults ? all.slice(0, options.maxResults) : all;
  },
};

const fakeOpenai: SearchProvider = {
  name: "openai",
  search: async () => [{ title: "OpenAI hit", url: "https://example.com/openai", snippet: "Snip" }],
};

const failingBrave: SearchProvider = {
  name: "brave",
  search: async () => {
    throw new Error("HTTP 429");
  },
};

/** Mirrors the platform tool() helpers: records and returns the definition. */
function identityToolFn(): { calls: OmnisearchToolDefinition[]; fn: OmnisearchToolFn<OmnisearchToolDefinition> } {
  const calls: OmnisearchToolDefinition[] = [];
  return {
    calls,
    fn: (definition) => {
      calls.push(definition);
      return definition;
    },
  };
}

describe("createPluginHooks", () => {
  test("registers the omnisearch tool through the injected toolFn", () => {
    const { calls, fn } = identityToolFn();

    const hooks = createPluginHooks({ routerConfig: { providers: { brave: fakeBrave } } }, fn);

    expect(hooks.tool[OMNISEARCH_TOOL_NAME]).toBe(calls[0]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.description).toContain("web search");
    expect(calls[0]?.args).toBeDefined();
    expect(typeof calls[0]?.execute).toBe("function");
  });

  test("execute returns normalized markdown from the router", async () => {
    const { fn } = identityToolFn();
    const hooks = createPluginHooks({ routerConfig: { providers: { brave: fakeBrave } } }, fn);

    const markdown = await hooks.tool[OMNISEARCH_TOOL_NAME].execute(
      { query: "typescript" },
      { sessionID: "s1" },
    );

    expect(markdown).toContain("## Web Search Results");
    expect(markdown).toContain("via brave");
    expect(markdown).toContain("[Brave hit](https://example.com/brave)");
    expect(markdown).toContain("## Sources");
  });

  test("execute honors maxResults", async () => {
    const { fn } = identityToolFn();
    const hooks = createPluginHooks({ routerConfig: { providers: { brave: fakeBrave } } }, fn);

    const markdown = await hooks.tool[OMNISEARCH_TOOL_NAME].execute(
      { query: "typescript", maxResults: 1 },
      {},
    );

    expect(markdown).toContain("1. [Brave hit]");
    expect(markdown).not.toContain("2. [Brave two]");
  });

  test("execute honors the per-call provider override", async () => {
    const { fn } = identityToolFn();
    const hooks = createPluginHooks(
      { provider: "brave", routerConfig: { providers: { openai: fakeOpenai } } },
      fn,
    );

    const markdown = await hooks.tool[OMNISEARCH_TOOL_NAME].execute(
      { query: "typescript", provider: "openai" },
      {},
    );

    expect(markdown).toContain("via openai");
  });

  test("plugin options configure the primary provider", async () => {
    const { fn } = identityToolFn();
    const hooks = createPluginHooks(
      { provider: "openai", routerConfig: { providers: { openai: fakeOpenai } } },
      fn,
    );

    const markdown = await hooks.tool[OMNISEARCH_TOOL_NAME].execute({ query: "typescript" }, {});

    expect(markdown).toContain("via openai");
  });

  test("routerConfig.fallback serves the chain when no provider override is given", async () => {
    const { fn } = identityToolFn();
    const hooks = createPluginHooks(
      {
        provider: "brave",
        routerConfig: {
          fallback: ["openai"],
          providers: { brave: failingBrave, openai: fakeOpenai },
        },
      },
      fn,
    );

    const markdown = await hooks.tool[OMNISEARCH_TOOL_NAME].execute({ query: "typescript" }, {});

    expect(markdown).toContain("via openai");
  });

  test("routerConfig.fallback is honored for per-call provider overrides too", async () => {
    const { fn } = identityToolFn();
    const failingMoonshot: SearchProvider = {
      name: "moonshot",
      search: async () => {
        throw new Error("moonshot down");
      },
    };
    const hooks = createPluginHooks(
      {
        provider: "brave",
        routerConfig: {
          fallback: ["openai"],
          providers: {
            brave: fakeBrave,
            moonshot: failingMoonshot,
            openai: fakeOpenai,
          },
        },
      },
      fn,
    );

    const markdown = await hooks.tool[OMNISEARCH_TOOL_NAME].execute(
      { query: "typescript", provider: "moonshot" },
      {},
    );

    expect(markdown).toContain("via openai");
  });
});
