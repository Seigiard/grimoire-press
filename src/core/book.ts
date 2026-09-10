/**
 * A book's source, as an author writes it in the left pane. This skeleton carries
 * plain Markdown prose only; the `<Book>`/`<Section>`/`<PageBreak>` vocabulary that
 * lets an author declare page size, columns, and forced breaks is issue #3.
 */
export interface Book {
  readonly source: string;
}

/**
 * Fixed until #3 lets a book declare its own page size (see CONTEXT.md's Book).
 * A5 matches the referee's-cheat-sheet workload issue #1 names as the first payload.
 */
export const DEFAULT_PAGE_SIZE = "A5";
