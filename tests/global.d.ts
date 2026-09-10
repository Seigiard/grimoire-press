export {};

declare global {
  interface Window {
    __paginateBook: (source: string) => Promise<number>;
  }
}
