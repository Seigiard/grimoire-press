import { DEFAULT_PAGE_SIZE } from "./book";
import { MarkupError } from "./markup-error";
import { describeTag, matchTagLine, TagLine } from "./markup-tags";

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
  readonly columns: number;
  readonly line: number;
  readonly content: readonly SectionContent[];
}

export interface ParsedBook {
  readonly size: string;
  readonly sections: readonly Section[];
}

const VALID_SIZE = /^[A-Za-z0-9.\s]+$/;

/**
 * Turns a book's source into its structure: a page size and the sections that make
 * it up. A `<Book>` wrapper is optional -- plain Markdown with no tags at all is a
 * complete, valid book, sized by `DEFAULT_PAGE_SIZE` and laid out as one single-column
 * section, which keeps issue #2's bare-prose books working unchanged. A `<Section>`
 * wrapper is likewise optional inside `<Book>`: content with no explicit section is
 * treated the same way, as one implicit single-column section.
 *
 * Throws `MarkupError` on malformed markup (an unclosed or nested tag, a break or
 * prose line outside a `<Section>`, an invalid attribute). Reporting that to an
 * author is issue #6's preview error surface; this only needs to fail clearly.
 */
export function parseBook(source: string): ParsedBook {
  const lines = source.split("\n");
  const bookOpenIndex = lines.findIndex((line) => matchTagLine(line)?.kind === "book-open");

  if (bookOpenIndex === -1) {
    return { size: DEFAULT_PAGE_SIZE, sections: parseBookBody(lines, 0, lines.length) };
  }

  assertOnlyBlank(lines, 0, bookOpenIndex, "before <Book>");

  const bookOpen = matchTagLine(lines[bookOpenIndex]!) as Extract<TagLine, { kind: "book-open" }>;
  const bookCloseIndex = findMatchingClose(lines, bookOpenIndex + 1, lines.length, "book-open", "book-close", "Book");
  assertOnlyBlank(lines, bookCloseIndex + 1, lines.length, "after </Book>");

  return {
    size: resolveSize(bookOpen.size, bookOpenIndex),
    sections: parseBookBody(lines, bookOpenIndex + 1, bookCloseIndex),
  };
}

function resolveSize(size: string | undefined, tagLine: number): string {
  if (size === undefined) return DEFAULT_PAGE_SIZE;
  if (!VALID_SIZE.test(size)) {
    throw new MarkupError(`<Book size="${size}"> on line ${tagLine + 1} has an invalid size attribute`, tagLine + 1);
  }
  return size;
}

/**
 * Content with no `<Section>` tag anywhere in it becomes one implicit single-column
 * section; content with at least one `<Section>` tag is parsed strictly, since mixing
 * the two within one scope would leave prose with no declared column count.
 */
function parseBookBody(lines: readonly string[], from: number, to: number): Section[] {
  const hasSection = lines.slice(from, to).some((line) => matchTagLine(line)?.kind === "section-open");
  if (!hasSection) {
    return [{ columns: 1, line: from + 1, content: parseSectionContent(lines, from, to) }];
  }
  return parseSections(lines, from, to);
}

function parseSections(lines: readonly string[], from: number, to: number): Section[] {
  const sections: Section[] = [];
  let i = from;

  while (i < to) {
    const tag = matchTagLine(lines[i]!);
    if (tag === undefined) {
      if (lines[i]!.trim() === "") {
        i++;
        continue;
      }
      throw new MarkupError(`line ${i + 1} has content outside any <Section>`, i + 1);
    }
    if (tag.kind !== "section-open") {
      throw new MarkupError(
        `unexpected <${describeTag(tag.kind)}> on line ${i + 1}: content here must be inside a <Section>`,
        i + 1,
      );
    }

    const sectionLine = i;
    const closeIndex = findMatchingClose(lines, i + 1, to, "section-open", "section-close", "Section");
    sections.push({
      columns: resolveColumns(tag.columns, sectionLine),
      line: sectionLine + 1,
      content: parseSectionContent(lines, sectionLine + 1, closeIndex),
    });
    i = closeIndex + 1;
  }

  return sections;
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

function parseSectionContent(lines: readonly string[], from: number, to: number): SectionContent[] {
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
    const line = lines[i]!;
    const tag = matchTagLine(line);

    if (tag?.kind === "page-break" || tag?.kind === "column-break") {
      flush();
      content.push({ kind: tag.kind, line: i + 1 });
      continue;
    }
    if (tag !== undefined) {
      throw new MarkupError(`unexpected <${describeTag(tag.kind)}> on line ${i + 1} inside a <Section>`, i + 1);
    }

    if (bufferStart === null) bufferStart = i + 1;
    buffer.push(line);
  }
  flush();

  return content;
}

function assertOnlyBlank(lines: readonly string[], from: number, to: number, where: string): void {
  for (let i = from; i < to; i++) {
    if (lines[i]!.trim() !== "") {
      throw new MarkupError(`content on line ${i + 1} appears ${where}`, i + 1);
    }
  }
}

function findMatchingClose(
  lines: readonly string[],
  from: number,
  to: number,
  openKind: TagLine["kind"],
  closeKind: TagLine["kind"],
  tagName: string,
): number {
  for (let i = from; i < to; i++) {
    const tag = matchTagLine(lines[i]!);
    if (tag?.kind === openKind) {
      throw new MarkupError(`<${tagName}> cannot be nested inside another <${tagName}>`, i + 1);
    }
    if (tag?.kind === closeKind) return i;
  }
  throw new MarkupError(`<${tagName}> opened on line ${from} is never closed with </${tagName}>`, from);
}
