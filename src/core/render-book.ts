import { Book } from "./book";
import { parseBook, Section, SectionContent } from "./parse-book";
import { renderProse } from "./prose-renderer";

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
  // column-fill: auto (rather than the initial "balance") fills a column fully
  // before spilling into the next, so where content lands follows the column order
  // an author reads and writes in, not a height-balancing heuristic that could
  // reshuffle it between columns as unrelated content earlier in the book changes.
  return `<section data-line="${section.line}" style="column-count: ${section.columns}; column-fill: auto;">
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
