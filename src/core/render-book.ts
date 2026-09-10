import { marked, type Token } from "marked";

import { Book } from "./book";
import { parseBook, Section, SectionContent } from "./parse-book";

/**
 * Turns a book's source into a standalone HTML document that a pagination engine can
 * lay out and the browser's print engine can print. Pure: no reference to the
 * browser, so a server can call the same function later (ADR-0001).
 *
 * Page size, columns, and forced breaks are expressed as CSS Paged Media -- `@page
 * size`, `column-count`, `break-before` -- laid out by Vivliostyle; nothing here
 * computes layout itself.
 */
export function renderBook(book: Book): string {
  const parsed = parseBook(book.source);
  const sectionsHtml = parsed.sections.map(renderSection).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Grimoire Press</title>
<style>
  @page { size: ${parsed.size}; margin: 16mm; }
  body { font-family: serif; line-height: 1.5; }
  section { column-gap: 8mm; }
</style>
</head>
<body>
${sectionsHtml}
</body>
</html>
`;
}

function renderSection(section: Section): string {
  const contentHtml = section.content.map(renderSectionContent).join("\n");
  return `<section data-line="${section.line}" style="column-count: ${section.columns};">
${contentHtml}
</section>`;
}

function renderSectionContent(item: SectionContent): string {
  if (item.kind === "page-break") {
    return `<div class="page-break" data-line="${item.line}" style="break-before: page;"></div>`;
  }
  if (item.kind === "column-break") {
    return `<div class="column-break" data-line="${item.line}" style="break-before: column;"></div>`;
  }
  return renderProse(item.source, item.line);
}

/**
 * Renders one prose run block by block through marked's own tokenizer, rather than
 * `marked.parse` in a single call, so each block-level element (paragraph, heading,
 * list, ...) can carry the source line it started on -- what a later ticket needs to
 * scroll the preview to the editor's cursor without regenerating this markup.
 *
 * Reference-style link definitions elsewhere in the same run will not resolve across
 * block boundaries this way; this book's prose has not needed them, and the fix
 * (parsing the whole run once, then re-slicing the rendered HTML by token) is more
 * machinery than that's worth today.
 */
function renderProse(source: string, startLine: number): string {
  const tokens = marked.lexer(source);
  const parts: string[] = [];
  let line = startLine;

  for (const token of tokens) {
    const html = marked.parser([token]).trim();
    if (html !== "") parts.push(withDataLine(html, line));
    line += countNewlines((token as Token).raw);
  }

  return parts.join("\n");
}

function countNewlines(text: string): number {
  let count = 0;
  for (const ch of text) if (ch === "\n") count++;
  return count;
}

/** Tags a rendered block's outermost element with the source line it came from. */
function withDataLine(html: string, line: number): string {
  return html.replace(/^<([a-zA-Z][a-zA-Z0-9-]*)/, `<$1 data-line="${line}"`);
}
