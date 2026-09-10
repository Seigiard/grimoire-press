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
 * computes layout itself. Running headers and page numbers (issue #5) are the same
 * kind of thing: `@page` margin boxes fed by `string-set`/`content()` on a heading
 * and by `counter(page)`, resolved by Vivliostyle, never computed here.
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
  @page {
    size: ${parsed.size};
    margin: 16mm;
    /* Page-context properties (unlike body's) are what page margin boxes
       inherit from -- CSS Paged Media has no route from body to a margin
       box -- so the plain fallback typeface for a themeless book has to be
       declared here too, not just on body. A theme overrides this with its
       own @page block, appended below by the cascade-order convention this
       file already uses for every other themed rule (see the class docblock). */
    font-family: serif;
    font-size: 9pt;
    /* content(): the heading's own rendered text, not a copy an author
       maintains -- see the string-set rule below. counter(page): the page
       counter every CSS UA maintains implicitly; nothing here counts pages. */
    @top-center { content: string(current-heading); }
    @bottom-center { content: counter(page); }
  }
  /* Running header mechanics (issue #5): string-set captures the nearest
     preceding heading's text into a page-scoped named string; @top-center
     above reads it back. This is what CONTEXT.md's Section is short of on
     its own -- a Section only declares column count, never a title -- so
     the running header follows the heading structure an author already
     writes instead of a second, parallel place to name a section. h1/h2
     only: a referee's cheat sheet (the first payload, per issue #1's
     "Further Notes") runs one or two heading levels deep, and a running
     header that rewrote itself on every h3/h4 subheading would be noise,
     not a location aid. Nothing for an author to declare or get wrong here
     -- unlike every other attribute in this file, this is derived, not
     declared, so parse-book.ts gains no new vocabulary and no new
     MarkupError case for it. */
  h1, h2 { string-set: current-heading content(); }
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
