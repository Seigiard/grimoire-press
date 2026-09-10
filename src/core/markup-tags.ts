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

export type TagLine =
  | { readonly kind: "book-open"; readonly size: string | undefined }
  | { readonly kind: "book-close" }
  | { readonly kind: "section-open"; readonly columns: string | undefined }
  | { readonly kind: "section-close" }
  | { readonly kind: "page-break" }
  | { readonly kind: "column-break" };

export function matchTagLine(line: string): TagLine | undefined {
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
