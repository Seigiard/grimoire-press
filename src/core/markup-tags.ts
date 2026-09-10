/**
 * Recognises the book's markup tags -- `<Book>`, `<Section>`, `<PageBreak />`,
 * `<ColumnBreak />` -- against a single source line. This is the one place that
 * decides what counts as one of the book's tags: `parse-book.ts` calls it to build a
 * book's structure, and the editor's CodeMirror extension (`adapters/markup-syntax.ts`)
 * calls it to highlight the same lines. Sharing this function is what the parent
 * issue means by "one grammar" -- highlighting cannot disagree with what a tag does,
 * because both read the same recognition rules.
 *
 * A tag occupies an entire line by itself; one that shares a line with prose is not
 * recognised as a tag; the tag-in-prose case is out of scope for this version.
 */

const BOOK_OPEN = /^<Book(?:\s+size="([^"]*)")?\s*>$/;
const BOOK_CLOSE = /^<\/Book>$/;
const SECTION_OPEN = /^<Section(?:\s+columns="([^"]*)")?\s*>$/;
const SECTION_CLOSE = /^<\/Section>$/;
const PAGE_BREAK = /^<PageBreak\s*\/>$/;
const COLUMN_BREAK = /^<ColumnBreak\s*\/>$/;
const INDENTED = /^(?: {4}|\t)/;
const FENCE = /^(`{3,}|~{3,})/;

export type TagLine =
  | { readonly kind: "book-open"; readonly size: string | undefined }
  | { readonly kind: "book-close" }
  | { readonly kind: "section-open"; readonly columns: string | undefined }
  | { readonly kind: "section-close" }
  | { readonly kind: "page-break" }
  | { readonly kind: "column-break" };

/**
 * A raw (untrimmed) line indented four spaces or more, or starting with a tab, is
 * never a tag -- a `<Section>` written that way in an author's own docs must not
 * become real structure. CommonMark would treat such a line as an indented code
 * block, or as a lazy continuation of a paragraph above it, depending on context;
 * this deliberately does not replicate that distinction and always excludes it,
 * which is simple enough for both this function and the editor's grammar to agree on.
 */
export function matchTagLine(line: string): TagLine | undefined {
  if (INDENTED.test(line)) return undefined;

  const trimmed = line.trim();

  const bookOpen = BOOK_OPEN.exec(trimmed);
  if (bookOpen) return { kind: "book-open", size: bookOpen[1] };
  if (BOOK_CLOSE.test(trimmed)) return { kind: "book-close" };

  const sectionOpen = SECTION_OPEN.exec(trimmed);
  if (sectionOpen) return { kind: "section-open", columns: sectionOpen[1] };
  if (SECTION_CLOSE.test(trimmed)) return { kind: "section-close" };

  if (PAGE_BREAK.test(trimmed)) return { kind: "page-break" };
  if (COLUMN_BREAK.test(trimmed)) return { kind: "column-break" };

  return undefined;
}

/**
 * Indices of lines inside a fenced code block: opened by a line of three or more
 * backticks or tildes, closed by a line using the same character (an unclosed fence
 * runs to the end of the source, matching CommonMark's own rule for that case).
 *
 * `matchTagLine` sees one line at a time and cannot decide this by itself, so
 * `parse-book.ts` consults this first and skips tag recognition entirely for a
 * fenced line -- a rulebook's own docs can show `<Section>` inside a fence without
 * it becoming real structure. The editor's grammar needs no matching change: its
 * `FencedCode` block parser already runs ahead of ours (see `markup-syntax.ts`), so
 * a fenced line never reaches our recognizer there either.
 */
export function fencedCodeLines(lines: readonly string[]): ReadonlySet<number> {
  const fenced = new Set<number>();
  let fenceChar: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const match = FENCE.exec(lines[i]!.trim());

    if (fenceChar !== undefined) {
      fenced.add(i);
      if (match && match[1]!.startsWith(fenceChar)) fenceChar = undefined;
      continue;
    }
    if (match) {
      fenceChar = match[1]![0];
      fenced.add(i);
    }
  }

  return fenced;
}

/** Display name for a tag kind, for error messages. */
export function describeTag(kind: TagLine["kind"]): string {
  switch (kind) {
    case "book-open":
      return "Book";
    case "book-close":
      return "/Book";
    case "section-open":
      return "Section";
    case "section-close":
      return "/Section";
    case "page-break":
      return "PageBreak";
    case "column-break":
      return "ColumnBreak";
  }
}
