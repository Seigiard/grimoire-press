import { Book } from "./book";
import { BookBlock, Page, parseBook, Section, SectionContent } from "./parse-book";
import { renderProse } from "./prose-renderer";

/**
 * A `Page` is rendered as a named CSS page (ADR-0007): `page: <name>` on the page's
 * own element, with the name taken from the page's position at the top level of the
 * book so that no two blocks ever share one. A break is forced wherever the used
 * page name changes, so the engine ends the preceding block, gives the page a sheet
 * to itself and starts the following block on a fresh sheet, with nothing declared
 * by the author. Sharing a name between two pages would quietly undo that and make
 * two pages one.
 *
 * No `@page <name>` rule is emitted alongside it: measured against the real engine,
 * the name on the element is the whole of what forces the breaks, and the named page
 * has nothing of its own to declare until it can be turned landscape (issue #22) or
 * have its running header suppressed (issue #21).
 */
const PAGE_NAME_PREFIX = "grimoire-page-";

/**
 * Turns a book's source into a standalone HTML document that a pagination engine can
 * lay out and the browser's print engine can print. Pure: no reference to the
 * browser, so a server can call the same function later (ADR-0001).
 *
 * Page size, columns, forced breaks and a page's own sheet are expressed as CSS
 * Paged Media -- `@page size`, `column-count`, `break-before`, and a named page
 * (issue #20, ADR-0007) -- laid out by Vivliostyle; nothing here computes layout
 * itself. Running headers and page numbers (issue #5) are the same kind of thing:
 * `@page` margin boxes fed by `string-set`/`content()` on a heading and by
 * `counter(page)`, resolved by Vivliostyle, never computed here.
 *
 * A book's theme (issue #4), when it names one, is embedded the same way: its CSS
 * -- including its own self-hosted `@font-face` rules -- lands verbatim in this
 * `<style>` block, appended last so its rules win the cascade over the plain
 * fallback above them. A themeless book keeps exactly the styling it had before
 * themes existed.
 */
export function renderBook(book: Book): string {
  const parsed = parseBook(book.source);
  const bodyHtml = parsed.blocks
    .map((block, index) => renderBlock(block, `${PAGE_NAME_PREFIX}${index + 1}`))
    .join("\n");

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
${bodyHtml}
</body>
</html>
`;
}

/** One top-level block's markup. Switching on `kind` here, in the one place that
 * turns a block into markup, is what makes `BookBlock` closed in practice: a third
 * kind leaves this function with a path that returns nothing, and the build fails
 * until that kind is rendered too. */
function renderBlock(block: BookBlock, pageName: string): string {
  switch (block.kind) {
    case "section":
      return renderSection(block);
    case "page":
      return renderPage(block, pageName);
  }
}

/**
 * The page's own element carries the named page, and that is the whole of its
 * styling. Naming the page is what supplies the frame of reference an author's
 * coordinates resolve against: the content gets a sheet to itself, so `top: 40mm`
 * is 40mm down *that* page's area rather than 40mm down whichever page the prose
 * happened to reach.
 *
 * Deliberately no `position: relative` on this element, though ADR-0007 records one.
 * Measured against the real engine: Vivliostyle already makes the page area the
 * containing block for absolutely positioned content, and interposing a wrapper of
 * our own takes that away, because the wrapper is as tall as its content rather than
 * as tall as the page. A box declared `bottom: 20mm` then lands 20mm below the top
 * of the sheet instead of 20mm above its foot, `top: 50%` resolves against a box of
 * no height, and a page opening with a heading drifts 5.67mm down as that heading's
 * margin collapses through it, so `top: 40mm` becomes 45.67mm. Without the wrapper
 * every one of those lands exactly where it was declared. Giving the wrapper the
 * page's own size would fix it and is precisely the sized canvas ADR-0007 measured
 * and rejected.
 */
function renderPage(page: Page, pageName: string): string {
  const contentHtml = page.content.map(renderSectionContent).join("\n");
  return `<div class="page" data-line="${page.line}" style="page: ${pageName};">
${contentHtml}
</div>`;
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
