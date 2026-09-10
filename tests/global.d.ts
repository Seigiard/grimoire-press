import type { EditorHandle } from "../src/adapters/editor";

export {};

declare global {
  interface PageInspection {
    pageCount: number;
    pageSizes: ReadonlyArray<{ width: number; height: number }>;
    positions: Record<string, { x?: number; y?: number; pageIndex: number | null }>;
  }

  interface HeaderInspection {
    pageIndex: number;
    header: string | undefined;
    pageNumber: string | undefined;
  }

  interface MarginBoxFontInspection {
    topCenter: string | undefined;
    bottomCenter: string | undefined;
  }

  interface Window {
    __paginateBook: (source: string) => Promise<number>;
    __paginateAndInspect: (source: string) => Promise<PageInspection>;
    __paginateAndInspectHeaders: (source: string) => Promise<HeaderInspection[]>;
    __inspectMarginBoxFonts: (source: string) => Promise<MarginBoxFontInspection>;
    __inspectFonts: (source: string, selectors: readonly string[]) => Promise<Record<string, string | undefined>>;
    __printTwiceSharesOneAttempt: (source: string) => boolean;
    __printSequentiallyStartsFreshAttempts: (source: string) => Promise<boolean>;
    __editor?: EditorHandle;
    __writeCount: number;
    __repaintCount: number;
  }
}
