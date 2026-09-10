import type { EditorHandle } from "../src/adapters/editor";

export {};

declare global {
  interface PageInspection {
    pageCount: number;
    pageSizes: ReadonlyArray<{ width: number; height: number }>;
    positions: Record<string, { x: number; y: number }>;
  }

  interface Window {
    __paginateBook: (source: string) => Promise<number>;
    __paginateAndInspect: (source: string) => Promise<PageInspection>;
    __editor?: EditorHandle;
    __writeCount: number;
  }
}
