import type { ProviderName, SearchResult } from "./types.js";
import { stripHtml } from "./util.js";

/**
 * Render search results as normalized markdown ready for an LLM context:
 * a `## Web Search Results` section with numbered titled links and snippets,
 * followed by a `## Sources` footer.
 */
export function normalizeResults(
  query: string,
  provider: ProviderName,
  results: SearchResult[],
): string {
  const lines: string[] = [
    "## Web Search Results",
    "",
    `Query: "${query}" (via ${provider})`,
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
