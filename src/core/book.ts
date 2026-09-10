/**
 * A book's source, as an author writes it in the left pane: Markdown prose, plus the
 * `<Book>`/`<Section>`/`<PageBreak>`/`<ColumnBreak>` vocabulary (see `parse-book.ts`)
 * that lets an author declare page size, columns, and forced breaks.
 */
export interface Book {
  readonly source: string;
}

/**
 * The page size a book gets when its source declares none, or declares no `<Book>`
 * wrapper at all (see `parse-book.ts`). A5 matches the referee's-cheat-sheet workload
 * issue #1 names as the first payload.
 */
export const DEFAULT_PAGE_SIZE = "A5";
