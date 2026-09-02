import { describe, expect, test } from "bun:test";
import { appendFailureNote, normalizeResults } from "./normalize.js";
import type { SearchResult } from "./types.js";

const twoResults: SearchResult[] = [
  { title: "Announcing TypeScript 7", url: "https://example.com/ts7", snippet: "The next major release." },
  { title: "TS Roadmap", url: "https://example.com/roadmap", snippet: "Plans for the future." },
];

describe("normalizeResults", () => {
  test("renders the Web Search Results header and the query", () => {
    const markdown = normalizeResults("latest typescript release", "brave", twoResults);

    expect(markdown).toContain("## Web Search Results");
    expect(markdown).toContain("latest typescript release");
  });

  test("renders numbered results with title, url, and snippet", () => {
    const markdown = normalizeResults("typescript", "brave", twoResults);

    expect(markdown).toContain("1. [Announcing TypeScript 7](https://example.com/ts7)");
    expect(markdown).toContain("The next major release.");
    expect(markdown).toContain("2. [TS Roadmap](https://example.com/roadmap)");
    expect(markdown).toContain("Plans for the future.");
  });

  test("strips HTML from snippets defensively", () => {
    const markdown = normalizeResults("typescript", "brave", [
      { title: "T", url: "https://example.com", snippet: "<b>Bold</b> &amp; clean" },
    ]);

    expect(markdown).toContain("Bold & clean");
    expect(markdown).not.toContain("<b>");
  });

  test("ends with a Sources footer listing every url", () => {
    const markdown = normalizeResults("typescript", "brave", twoResults);

    const sourcesIndex = markdown.indexOf("## Sources");
    expect(sourcesIndex).toBeGreaterThan(-1);
    const footer = markdown.slice(sourcesIndex);
    expect(footer).toContain("https://example.com/ts7");
    expect(footer).toContain("https://example.com/roadmap");
    expect(footer.indexOf("## Sources")).toBeLessThan(footer.indexOf("https://example.com/ts7"));
  });

  test("mentions the serving provider", () => {
    const markdown = normalizeResults("typescript", "moonshot", twoResults);
    expect(markdown).toContain("moonshot");
  });

  test("renders a friendly message when there are no results", () => {
    const markdown = normalizeResults("obscure query", "brave", []);

    expect(markdown).toContain("No results");
    expect(markdown).toContain("obscure query");
    expect(markdown).not.toContain("1. [");
  });
});

describe("via label override and failure note", () => {
  test("uses the via label when provided", () => {
    const markdown = normalizeResults("q", "brave", twoResults, "parallel: brave, openai");
    expect(markdown).toContain("(via parallel: brave, openai)");
    expect(markdown).not.toContain("(via brave)");
  });

  test("appendFailureNote adds one trailing note line listing failures", () => {
    const markdown = normalizeResults("q", "brave", twoResults);
    const noted = appendFailureNote(markdown, ["google", "tavily"]);
    expect(noted).toContain("Note: 2 provider(s) failed: google, tavily");
    expect(noted.startsWith(markdown)).toBe(true);
  });

  test("appendFailureNote returns markdown unchanged when nothing failed", () => {
    const markdown = normalizeResults("q", "brave", twoResults);
    expect(appendFailureNote(markdown, [])).toBe(markdown);
  });
});
