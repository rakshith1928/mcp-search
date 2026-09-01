import { describe, expect, test } from "bun:test";
import { ENV_BY_PROVIDER, resolveApiKey, stripHtml } from "./util.js";

describe("stripHtml", () => {
  test("removes tags", () => {
    expect(stripHtml("<b>Bold</b> plain text")).toBe("Bold plain text");
  });

  test("decodes common HTML entities", () => {
    expect(stripHtml("a &amp; b &#39;c&#39; &quot;d&quot; &lt;e&gt; &nbsp;f")).toBe(
      "a & b 'c' \"d\" <e> f",
    );
  });

  test("collapses whitespace and trims", () => {
    expect(stripHtml("  a\n  b\tc  ")).toBe("a b c");
  });

  test("passes plain text through unchanged", () => {
    expect(stripHtml("no markup here")).toBe("no markup here");
  });
});

describe("resolveApiKey", () => {
  test("returns the explicit key when provided", () => {
    expect(resolveApiKey("brave", "explicit-key")).toBe("explicit-key");
  });

  test("falls back to the provider's env var", () => {
    const prev = process.env.BRAVE_API_KEY;
    process.env.BRAVE_API_KEY = "env-key";
    try {
      expect(resolveApiKey("brave")).toBe("env-key");
    } finally {
      if (prev === undefined) delete process.env.BRAVE_API_KEY;
      else process.env.BRAVE_API_KEY = prev;
    }
  });

  test("throws a clear error naming the env var when missing", () => {
    const prev = process.env.BRAVE_API_KEY;
    delete process.env.BRAVE_API_KEY;
    try {
      expect(() => resolveApiKey("brave")).toThrow(/BRAVE_API_KEY/);
    } finally {
      if (prev !== undefined) process.env.BRAVE_API_KEY = prev;
    }
  });

  test("maps every provider to its documented env var", () => {
    expect(ENV_BY_PROVIDER.brave).toBe("BRAVE_API_KEY");
    expect(ENV_BY_PROVIDER.anthropic).toBe("ANTHROPIC_API_KEY");
    expect(ENV_BY_PROVIDER.openai).toBe("OPENAI_API_KEY");
    expect(ENV_BY_PROVIDER.moonshot).toBe("MOONSHOT_API_KEY");
  });
});
