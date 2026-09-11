import { Book } from "./book";
import { BookBlock, Page, PageOrientation, parseBook, Section, SectionContent } from "./parse-book";
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
 * A `@page <name>` rule is emitted beside it for whatever that page declares of its
 * own (ADR-0007). Every page declares at least one thing -- no running header -- so
 * every page now gets a rule; the breaks are not what it is for, since those come
 * from the used page name changing whether a rule is there or not.
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
  // One name per top-level block, so the body and the page rules below always
  // agree about which name belongs to which block.
  const named = parsed.blocks.map((block, index) => ({ block, pageName: `${PAGE_NAME_PREFIX}${index + 1}` }));
  const bodyHtml = named.map(({ block, pageName }) => renderBlock(block, pageName)).join("\n");
  const pageRules = named
    .map(({ block, pageName }) => renderPageRule(block, pageName, parsed.size))
    .filter((rule) => rule !== "")
    .join("\n  ");

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
  /* Running header mechanics (issues #5 and #18): string-set captures the
     nearest preceding structural heading's text into a page-scoped named
     string; @top-center above reads it back. The prose renderer marks only
     headings produced from Markdown, distinguishing the book's structure
     from raw HTML captions. Scoping those marks to section also keeps a
     Page's headings from changing the running string after that Page has
     left the flow (CONTEXT.md).

     This is what CONTEXT.md's Section is short of on its own -- a Section
     only declares column count, never a title -- so the running header
     follows the heading structure an author already writes instead of a
     second, parallel place to name a section. h1/h2 only: a referee's cheat
     sheet (the first payload, per issue #1's "Further Notes") runs one or
     two heading levels deep, and a running header that rewrote itself on
     every h3/h4 subheading would be noise, not a location aid. Nothing for
     an author to declare or get wrong here -- unlike every other attribute
     in this file, this is derived, not declared, so parse-book.ts gains no
     new vocabulary and no new MarkupError case for it. */
  section h1[data-grimoire-structural-heading],
  section h2[data-grimoire-structural-heading] { string-set: current-heading content(); }
  /* Hyphenation is a document-language concern, not a theme one -- CONTEXT.md
     keeps the two separate ("the language attribute switches hyphenation").
     Scoped to "ru" because that is the one case verified through the real
     pagination/print engine (see the theme's own report); a theme's own
     font-family rules are the only thing that ever selects a typeface. */
  html[lang="ru"] { hyphens: auto; -webkit-hyphens: auto; }
  body { font-family: serif; line-height: 1.5; }
  section { column-gap: 8mm; }
  ${parsed.theme?.css ?? ""}
  /* A named @page rule beats a theme's unnamed @page whatever the order, because
     naming the page is more specific -- position is not what protects these, and
     the file's usual last-wins reading does not apply to them. Kept last anyway,
     so a later theme cannot look like it is meant to override them.

     What position does not settle: a theme that declared a page size of its own
     would take the book's, while a turned page is still composed from the size
     the book declared, so the two would describe different sheets. No theme does
     today. Issue #28 carries it. */
  ${pageRules}
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
 * The page's own element carries the named page, and that is the whole of the
 * styling on the element itself -- whatever the page declares of its own goes in
 * the `@page <name>` rule above. Naming the page is what supplies the frame of
 * reference an author's coordinates resolve against: the content gets a sheet to
 * itself, so `top: 40mm` is 40mm down *that* page's area rather than 40mm down
 * whichever page the prose happened to reach.
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
  // `data-grimoire-page` is the renderer's own mark on the block, and the only thing
  // the pagination adapter counts pages by (issue #23). A class and a `data-line`
  // are both things an author's own HTML may carry (ADR-0006), and between them
  // they would let a book forge a report about itself; this attribute is written
  // nowhere else.
  return `<div class="page" data-grimoire-page data-line="${page.line}" style="page: ${pageName};">
${contentHtml}
</div>`;
}

/**
 * A page's running header, or rather the absence of it (CONTEXT.md's Page, issue
 * #21). The running header names where the reader is in the flow; a page has left
 * the flow, so on a page the header would name somewhere the reader is not -- the
 * chapter the author happened to be writing before the character sheet.
 *
 * `content: none` on the margin box, so the box is not generated at all rather than
 * generated empty: the emptiness is not something an author can style back into
 * meaning something. This is a default and not an attribute; there is no way to ask
 * for the header back on one page.
 *
 * `@bottom-center` is deliberately left alone next to it. A page number is an
 * address, not a location in the flow, and the address is still true -- so the page
 * keeps its number, and the counter runs through it because nothing here touches it.
 */
const NO_RUNNING_HEADER = "@top-center { content: none; }";

/**
 * What a named page declares of its own (ADR-0007), or the empty string for a
 * section, which declares nothing and takes the book's own `@page` rule. A list of
 * declarations rather than one string because a page has two things to say: which
 * way its sheet lies, when the author turned it, and that it carries no running
 * header, which every page says.
 */
function renderPageRule(block: BookBlock, pageName: string, bookSize: string): string {
  switch (block.kind) {
    case "section":
      return "";
    case "page": {
      const declarations: string[] = [];
      if (block.orientation !== undefined) declarations.push(`size: ${sheetTurned(bookSize, block.orientation)};`);
      declarations.push(NO_RUNNING_HEADER);
      return `@page ${pageName} { ${declarations.join(" ")} }`;
    }
  }
}

const ORIENTATIONS = new Set(["portrait", "landscape"]);
/** An absolute CSS length, which is all `@page size` accepts. */
const CSS_LENGTH = /^(\d*\.?\d+)(mm|cm|in|q|pt|pc|px)$/i;
const PX_PER_UNIT: Readonly<Record<string, number>> = {
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
  q: 96 / 101.6,
  pt: 96 / 72,
  pc: 16,
  px: 1,
};

function lengthInPx(token: string): number | undefined {
  const match = CSS_LENGTH.exec(token);
  if (match === null) return undefined;
  return Number(match[1]) * PX_PER_UNIT[match[2]!.toLowerCase()]!;
}

/**
 * The book's own sheet, turned the way this page asked for. A page never chooses a
 * size, only which way the book's sheet lies (CONTEXT.md's Page), so this composes
 * the two rather than letting a page declare a size of its own.
 *
 * Two shapes reach it, because `@page size` takes either a named page size with an
 * optional orientation keyword or one or two explicit lengths -- and the keyword
 * cannot be combined with lengths, so `90mm 160mm landscape` is not a size at all.
 * A named size therefore hands the turning to the engine's own keyword, while
 * explicit lengths are ordered here: the longer edge runs across the sheet for
 * landscape and down it for portrait, so a book already bound the wide way is not
 * turned back by a page that asks for the way it already lies. One length is a
 * square sheet, which is the same sheet however it is turned.
 *
 * An orientation the book itself declared is dropped first: it is the book saying
 * how its sheet lies, and this page has just said otherwise.
 */
function sheetTurned(bookSize: string, orientation: PageOrientation): string {
  const declared = bookSize
    .trim()
    .split(/\s+/)
    .filter((token) => token !== "" && !ORIENTATIONS.has(token.toLowerCase()));
  const lengths = declared.map(lengthInPx);

  if (declared.length === 1 && lengths[0] !== undefined) return declared[0]!;
  if (declared.length === 2 && lengths[0] !== undefined && lengths[1] !== undefined) {
    const [across, down] = lengths[0] >= lengths[1] ? [declared[0]!, declared[1]!] : [declared[1]!, declared[0]!];
    return orientation === "landscape" ? `${across} ${down}` : `${down} ${across}`;
  }
  return [...declared, orientation].join(" ");
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
