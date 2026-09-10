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
 *
 * A book's theme (issue #4), when it names one, is embedded the same way: its CSS
 * -- including its own self-hosted `@font-face` rules -- lands verbatim in this
 * `<style>` block, appended last so its rules win the cascade over the plain
 * fallback above them. A themeless book keeps exactly the styling it had before
 * themes existed.
 */
export function renderBook(book: Book): string {
  const parsed = parseBook(book.source);
  const sectionsHtml = parsed.sections.map(renderSection).join("\n");

  return `<!doctype html>
<html lang="${parsed.lang}">
<head>
<meta charset="utf-8" />
<title>Grimoire Press</title>
<style>
  @page { size: ${parsed.size}; margin: 16mm; }
  /* Hyphenation is a document-language concern, not a theme one -- CONTEXT.md
     keeps the two separate ("the language attribute switches hyphenation").
     Scoped to "ru" because that is the one case verified through the real
     pagination/print engine (see the theme's own report); a theme's own
     font-family rules are the only thing that ever selects a typeface. */
  html[lang="ru"] { hyphens: auto; -webkit-hyphens: auto; }
  body { font-family: serif; line-height: 1.5; }
  section { column-gap: 8mm; }
  ${parsed.theme?.css ?? ""}
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
