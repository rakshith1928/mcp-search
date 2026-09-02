import type { ProviderName, SearchResult } from "./types.js";
import { stripHtml } from "./util.js";

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
    lines.push(`${n}. [${result.title}](${result.url})`);
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
 * Append the parallel-mode failure note. Returns the input unchanged when
 * nothing failed.
 */
export function appendFailureNote(markdown: string, failed: ProviderName[]): string {
  if (failed.length === 0) return markdown;
  return `${markdown}\n\nNote: ${failed.length} provider(s) failed: ${failed.join(", ")}`;
}
