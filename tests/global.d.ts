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

  interface ContainerAfterFailure {
    rejection: string | undefined;
    before?: string;
    after: string;
    attributesBefore?: string;
    attributesAfter: string;
  }

  interface Window {
    __paginateBook: (source: string) => Promise<number>;
    __previewAfterEngineFailure: (goodSource: string, nextSource: string) => Promise<ContainerAfterFailure>;
    __previewAfterFirstEverEngineFailure: (source: string) => Promise<ContainerAfterFailure>;
    __paginateAndInspect: (source: string) => Promise<PageInspection>;
    __paginateAndInspectHeaders: (source: string) => Promise<HeaderInspection[]>;
    __inspectMarginBoxFonts: (source: string) => Promise<MarginBoxFontInspection>;
    __inspectFonts: (source: string, selectors: readonly string[]) => Promise<Record<string, string | undefined>>;
    __printTwiceSharesOneAttempt: (source: string) => boolean;
    /** tests/fixtures/timeout-harness.html: the clock the two engine deadlines are
     * held on, and the withheld engine runs they are measured against. */
    __advanceEngineClock: (ms: number) => void;
    __pendingEngineDeadlines: () => number;
    __stallEngine: () => void;
    __unstallEngine: () => void;
    __stalledEngineRuns: () => number;
    __resumeOldestStalledEngineRun: () => boolean;
    __failOldestStalledEngineRun: () => boolean;
    __printAttemptsStarted: () => number;
    __printSequentiallyStartsFreshAttempts: (source: string) => Promise<boolean>;
    __editor?: EditorHandle;
    __writeCount: number;
    __repaintCount: number;
  }
}
