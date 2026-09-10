import { DEFAULT_PAGE_SIZE } from "./book";
import { MarkupError, UnknownTagError } from "./markup-error";
import { describeTag, fencedCodeLines, matchTagLine, TagLine, unrecognizedTagName } from "./markup-tags";
import { getTheme } from "./themes/registry";
import type { Theme } from "./themes/theme";

/** A book with no theme, or with a theme this registry does not carry
 * "default-ru", renders in this language -- see `themes/theme.ts` for why
 * a book cannot yet declare its own. */
const FALLBACK_LANG = "en";

/** A run of Markdown prose, and the 1-based source line it starts on. */
export interface ProseBlock {
  readonly kind: "prose";
  readonly source: string;
  readonly line: number;
}

/** A forced page break, and the 1-based source line it was declared on. */
export interface PageBreak {
  readonly kind: "page-break";
  readonly line: number;
}

/** A forced column break, and the 1-based source line it was declared on. */
export interface ColumnBreak {
  readonly kind: "column-break";
  readonly line: number;
}

export type SectionContent = ProseBlock | PageBreak | ColumnBreak;

/** A run of pages sharing one column count (CONTEXT.md's Section). */
export interface Section {
  readonly kind: "section";
  readonly columns: number;
  readonly line: number;
  readonly content: readonly SectionContent[];
}

/**
 * Exactly one physical page the author composes rather than the engine fills
 * (CONTEXT.md's Page): a character sheet, a reference card, a table meant to sit
 * alone. It sits beside a section rather than inside one, because a section is the
 * flow a page opts out of, so it carries no column count and no break of either
 * kind: both are ways of steering a flow this block has left. `render-book.ts`
 * gives it a named CSS page (ADR-0007), which is what makes the engine end the
 * block before it and start the block after it on a fresh page with nothing
 * declared by the author.
 */
export interface Page {
  readonly kind: "page";
  readonly line: number;
  readonly content: readonly SectionContent[];
}

/**
 * One entry at the top level of a book. Closed discriminated union in the style
 * ADR-0004 records: a third kind added here fails the build at every site that
 * switches on `kind` until that site handles it, rather than being silently
 * dropped from the rendered book.
 */
export type BookBlock = Section | Page;

export interface ParsedBook {
  readonly size: string;
  /** `undefined` when the book names no theme -- render-book.ts then falls
   * back to its own plain styling, unchanged from before this theme existed. */
  readonly theme: Theme | undefined;
  /** Always resolved: the theme's own `lang` when one is selected, `en`
   * otherwise. Drives `render-book.ts`'s `<html lang>` and, through it,
   * which `hyphens: auto` rule applies. */
  readonly lang: string;
  /** Sections and pages in the order the author wrote them -- a page is a
   * peer of a section at the top level, not something nested inside one. */
  readonly blocks: readonly BookBlock[];
}

const VALID_SIZE = /^[A-Za-z0-9.\s]+$/;

/** The source, split into lines, plus which of those lines are fenced code and so
 * can never carry a tag -- threaded through every scanning function below instead
 * of recomputed per call. */
interface Doc {
  readonly lines: readonly string[];
  readonly fenced: ReadonlySet<number>;
}

/**
 * The tag at line `i`, or `undefined` for prose -- fenced code is never a tag.
 * Throws `UnknownTagError` for a line shaped like a tag whose name isn't one of
 * ours, so every scan below that calls this also catches an author's typo, without
 * each of them separately having to check for it.
 */
function tagAt(doc: Doc, i: number): TagLine | undefined {
  if (doc.fenced.has(i)) return undefined;
  const line = doc.lines[i]!;
  const tag = matchTagLine(line);
  if (tag !== undefined) return tag;
  const unknown = unrecognizedTagName(line);
  if (unknown !== undefined) throw new UnknownTagError(unknown, i + 1);
  return undefined;
}

/**
 * Turns a book's source into its structure: a page size and the sections and pages
 * that make it up. A `<Book>` wrapper is optional -- plain Markdown with no tags at
 * all is a complete, valid book, sized by `DEFAULT_PAGE_SIZE` and laid out as one
 * single-column section, which keeps issue #2's bare-prose books working unchanged.
 * A `<Section>` wrapper is likewise optional inside `<Book>`: content with no
 * explicit section is treated the same way, as one implicit single-column section.
 *
 * Throws `MarkupError` on malformed markup (an unclosed or nested tag, a break or
 * prose line outside a `<Section>`, a break or column count on a `<Page>`, an
 * invalid attribute). Reporting that to an author is issue #6's preview error
 * surface; this only needs to fail clearly.
 */
export function parseBook(source: string): ParsedBook {
  const lines = source.split("\n");
  const doc: Doc = { lines, fenced: fencedCodeLines(lines) };

  let bookOpenIndex = -1;
  let bookOpen: Extract<TagLine, { kind: "book-open" }> | undefined;
  for (let i = 0; i < lines.length; i++) {
    const tag = tagAt(doc, i);
    if (tag?.kind === "book-open") {
      bookOpenIndex = i;
      bookOpen = tag;
      break;
    }
  }

  if (bookOpen === undefined) {
    return {
      size: DEFAULT_PAGE_SIZE,
      theme: undefined,
      lang: FALLBACK_LANG,
      blocks: parseBookBody(doc, 0, lines.length),
    };
  }

  assertOnlyBlank(doc, 0, bookOpenIndex, "before <Book>");

  const bookCloseIndex = findMatchingClose(doc, bookOpenIndex + 1, lines.length, "book-open", "book-close", "Book");
  assertOnlyBlank(doc, bookCloseIndex + 1, lines.length, "after </Book>");

  const theme = resolveTheme(bookOpen.theme, bookOpenIndex);

  return {
    size: resolveSize(bookOpen.size, bookOpenIndex),
    theme,
    lang: theme?.lang ?? FALLBACK_LANG,
    blocks: parseBookBody(doc, bookOpenIndex + 1, bookCloseIndex),
  };
}

/** `undefined` when `<Book>` names no theme at all -- a plain `<Book size="A5">`
 * (or bare prose with no `<Book>` wrapper) is still a complete, valid book,
 * rendered in render-book.ts's own fallback styling. A named theme this
 * registry does not carry is an author's mistake, not a silent fallback. */
function resolveTheme(theme: string | undefined, tagLine: number): Theme | undefined {
  if (theme === undefined) return undefined;
  const resolved = getTheme(theme);
  if (resolved === undefined) {
    throw new MarkupError(`<Book theme="${theme}"> on line ${tagLine + 1} names an unknown theme`, tagLine + 1);
  }
  return resolved;
}

function resolveSize(size: string | undefined, tagLine: number): string {
  if (size === undefined) return DEFAULT_PAGE_SIZE;
  if (!VALID_SIZE.test(size)) {
    throw new MarkupError(`<Book size="${size}"> on line ${tagLine + 1} has an invalid size attribute`, tagLine + 1);
  }
  return size;
}

/**
 * Content with no `<Section>` and no `<Page>` tag anywhere in it becomes one implicit
 * single-column section; content with at least one of either is parsed strictly, since
 * mixing the two within one scope would leave prose with no declared column count.
 */
function parseBookBody(doc: Doc, from: number, to: number): BookBlock[] {
  let hasBlock = false;
  for (let i = from; i < to; i++) {
    const kind = tagAt(doc, i)?.kind;
    if (kind === "section-open" || kind === "page-open") {
      hasBlock = true;
      break;
    }
  }
  if (!hasBlock) {
    return [{ kind: "section", columns: 1, line: from + 1, content: parseBlockContent(doc, from, to, "Section") }];
  }
  return parseTopLevel(doc, from, to);
}

/** The top level of a book: sections and pages, in the order the author wrote
 * them, with nothing but blank lines allowed between them. */
function parseTopLevel(doc: Doc, from: number, to: number): BookBlock[] {
  const blocks: BookBlock[] = [];
  let i = from;

  while (i < to) {
    const tag = tagAt(doc, i);
    if (tag === undefined) {
      if (doc.lines[i]!.trim() === "") {
        i++;
        continue;
      }
      throw new MarkupError(`line ${i + 1} has content outside any <Section> or <Page>`, i + 1);
    }
    if (tag.kind === "section-open") {
      const closeIndex = findMatchingClose(doc, i + 1, to, "section-open", "section-close", "Section");
      blocks.push({
        kind: "section",
        columns: resolveColumns(tag.columns, i),
        line: i + 1,
        content: parseBlockContent(doc, i + 1, closeIndex, "Section"),
      });
      i = closeIndex + 1;
      continue;
    }
    if (tag.kind === "page-open") {
      assertNoColumnCount(tag.columns, i);
      const closeIndex = findMatchingClose(doc, i + 1, to, "page-open", "page-close", "Page");
      blocks.push({
        kind: "page",
        line: i + 1,
        content: parseBlockContent(doc, i + 1, closeIndex, "Page"),
      });
      i = closeIndex + 1;
      continue;
    }
    throw new MarkupError(
      `unexpected <${describeTag(tag.kind)}> on line ${i + 1}: content here must be inside a <Section> or a <Page>`,
      i + 1,
    );
  }

  return blocks;
}

/**
 * A page has no column count, at any value: a column count says how a flow is laid
 * out, and a page is the one construct that exists to leave the flow (CONTEXT.md's
 * Page). Rejected by name rather than ignored, so an author who reached for it is
 * told why a page does not have it instead of watching the attribute do nothing.
 * Only `columns` is refused here -- an attribute a page really does take is read
 * elsewhere from the same tag and is no business of this check.
 */
function assertNoColumnCount(columns: string | undefined, tagLine: number): void {
  if (columns === undefined) return;
  throw new MarkupError(
    `<Page columns="${columns}"> on line ${tagLine + 1} declares a column count, but a page has no columns`,
    tagLine + 1,
  );
}

function resolveColumns(columns: string | undefined, tagLine: number): number {
  if (columns === undefined) return 1;
  const parsed = Number.parseInt(columns, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || String(parsed) !== columns.trim()) {
    throw new MarkupError(
      `<Section columns="${columns}"> on line ${tagLine + 1} has an invalid columns attribute`,
      tagLine + 1,
    );
  }
  return parsed;
}

/**
 * Why neither kind of break means anything inside a page, phrased as the answer to
 * the question the author was actually asking. A break is not merely "unexpected"
 * there the way a stray `</Book>` is: an author who wrote one wanted something a
 * page already is, or something a page does not have, and saying which is what
 * stops them looking for a fault that is not there.
 */
const BREAK_INSIDE_PAGE: Record<PageBreak["kind"] | ColumnBreak["kind"], string> = {
  "page-break": "a page is already one page",
  "column-break": "a page has no columns to break",
};

/** `container` names the enclosing tag only so an unexpected tag inside it is
 * reported against the block the author actually opened. */
function parseBlockContent(doc: Doc, from: number, to: number, container: "Section" | "Page"): SectionContent[] {
  const content: SectionContent[] = [];
  let buffer: string[] = [];
  let bufferStart: number | null = null;

  const flush = (): void => {
    if (bufferStart !== null) {
      const text = buffer.join("\n");
      if (text.trim() !== "") {
        content.push({ kind: "prose", source: text, line: bufferStart });
      }
      buffer = [];
      bufferStart = null;
    }
  };

  for (let i = from; i < to; i++) {
    const line = doc.lines[i]!;
    const tag = tagAt(doc, i);

    if (tag?.kind === "page-break" || tag?.kind === "column-break") {
      if (container === "Page") {
        throw new MarkupError(
          `unexpected <${describeTag(tag.kind)}> on line ${i + 1} inside a <Page>: ${BREAK_INSIDE_PAGE[tag.kind]}`,
          i + 1,
        );
      }
      flush();
      content.push({ kind: tag.kind, line: i + 1 });
      continue;
    }
    if (tag !== undefined) {
      throw new MarkupError(`unexpected <${describeTag(tag.kind)}> on line ${i + 1} inside a <${container}>`, i + 1);
    }

    if (bufferStart === null) bufferStart = i + 1;
    buffer.push(line);
  }
  flush();

  return content;
}

function assertOnlyBlank(doc: Doc, from: number, to: number, where: string): void {
  for (let i = from; i < to; i++) {
    tagAt(doc, i); // throws UnknownTagError for a mistyped tag before <Book> or after </Book>
    if (doc.lines[i]!.trim() !== "") {
      throw new MarkupError(`content on line ${i + 1} appears ${where}`, i + 1);
    }
  }
}

function findMatchingClose(
  doc: Doc,
  from: number,
  to: number,
  openKind: TagLine["kind"],
  closeKind: TagLine["kind"],
  tagName: string,
): number {
  for (let i = from; i < to; i++) {
    const tag = tagAt(doc, i);
    if (tag?.kind === openKind) {
      throw new MarkupError(`<${tagName}> cannot be nested inside another <${tagName}>`, i + 1);
    }
    if (tag?.kind === closeKind) return i;
  }
  throw new MarkupError(`<${tagName}> opened on line ${from} is never closed with </${tagName}>`, from);
}
