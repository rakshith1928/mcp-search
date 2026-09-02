import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createOmnisearchServer } from "./server.js";
import type { SearchProvider } from "./types.js";

function fakeProvider(name: SearchProvider["name"]): SearchProvider {
  return {
    name,
    search: async (query) => [
      { title: `${name} hit`, url: `https://example.com/${name}`, snippet: `About ${query}` },
    ],
  };
}

async function connect(config: Parameters<typeof createOmnisearchServer>[0]) {
  const { server } = createOmnisearchServer(config);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

describe("createOmnisearchServer", () => {
  test("exposes the omnisearch tool with a query schema over MCP", async () => {
    const client = await connect({ providers: { brave: fakeProvider("brave") } });

    const { tools } = await client.listTools();
    const omnisearch = tools.find((t) => t.name === "omnisearch");

    expect(omnisearch).toBeDefined();
    expect(omnisearch?.description).toContain("web search");
    const properties = (omnisearch?.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(properties.query).toBeDefined();
    expect(properties.maxResults).toBeDefined();
    expect(properties.provider).toBeDefined();
  });

  test("serves a search and returns normalized markdown as text content", async () => {
    const client = await connect({ providers: { brave: fakeProvider("brave") } });

    const result = await client.callTool({ name: "omnisearch", arguments: { query: "typescript" } });
    const text = (result.content as Array<{ type: string; text?: string }>).find(
      (c) => c.type === "text",
    )?.text;

    expect(text).toContain("## Web Search Results");
    expect(text).toContain("[brave hit](https://example.com/brave)");
    expect(text).toContain("## Sources");
  });

  test("honors a per-call provider override", async () => {
    const client = await connect({ providers: { openai: fakeProvider("openai") } });

    const result = await client.callTool({
      name: "omnisearch",
      arguments: { query: "typescript", provider: "openai" },
    });
    const text = (result.content as Array<{ type: string; text?: string }>).find(
      (c) => c.type === "text",
    )?.text;

    expect(text).toContain("[openai hit](https://example.com/openai)");
  });
});
