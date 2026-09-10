import type { EditorHandle } from "../src/adapters/editor";

export {};

declare global {
  interface PageInspection {
    pageCount: number;
    pageSizes: ReadonlyArray<{ width: number; height: number }>;
    positions: Record<string, { x?: number; y?: number; pageIndex: number | null }>;
  }

  interface Window {
    __paginateBook: (source: string) => Promise<number>;
    __paginateAndInspect: (source: string) => Promise<PageInspection>;
    __inspectFonts: (source: string, selectors: readonly string[]) => Promise<Record<string, string | undefined>>;
    __printTwiceSharesOneAttempt: (source: string) => boolean;
    __editor?: EditorHandle;
    __writeCount: number;
    __repaintCount: number;
  }
}
