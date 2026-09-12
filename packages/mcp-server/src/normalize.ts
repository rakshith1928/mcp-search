import type { ProviderName, SearchResult } from "./types.js";

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

/**
 * Strip HTML tags and entities from provider snippets, collapsing whitespace.
 */
export function stripHtml(input: string): string {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#?[a-zA-Z0-9]+);/g, (match, entity: string) => {
      const decoded = HTML_ENTITIES[entity];
      return decoded ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Render search results as normalized markdown ready for an LLM context:
 * a `## Web Search Results` section with numbered titled links and snippets,
 * followed by a `## Sources` footer. `via` overrides the provider label in
 * the header (used by parallel mode).
 */
export function normalizeResults(
  query: string,
  provider: ProviderName,
  results: SearchResult[],
  via?: string,
): string {
  const lines: string[] = [
    "## Web Search Results",
    "",
    `Query: "${query}" (via ${via ?? provider})`,
    "",
  ];

  if (results.length === 0) {
    lines.push(`No results found for "${query}".`, "", "## Sources", "", "None.");
    return lines.join("\n");
  }

  results.forEach((result, index) => {
    const n = index + 1;
    lines.push(`${n}. [${escapeMarkdownTitle(result.title)}](${result.url})`);
    const snippet = stripHtml(result.snippet);
    if (snippet) lines.push(`   ${snippet}`);
  });

  lines.push("", "## Sources", "");
  results.forEach((result, index) => {
    lines.push(`${index + 1}. ${result.url}`);
  });

  return lines.join("\n");
}

/**
 * Escape markdown-significant characters in provider-supplied titles so a
 * malformed title cannot break the response's link structure (ADR-0007).
 */
export function escapeMarkdownTitle(title: string): string {
  return title.replace(/[[\]()]/g, "\\$&");
}

/**
 * Append the parallel-mode failure note. Returns the input unchanged when
 * nothing failed.
 */
export function appendFailureNote(markdown: string, failed: ProviderName[]): string {
  if (failed.length === 0) return markdown;
  return `${markdown}\n\nNote: ${failed.length} provider(s) failed: ${failed.join(", ")}`;
}
