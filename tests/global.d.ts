import type { EditorHandle } from "../src/adapters/editor";

export {};

declare global {
  interface Window {
    __paginateBook: (source: string) => Promise<number>;
    __editor?: EditorHandle;
    __writeCount: number;
  }
}
