import type { EditorHandle } from "../src/adapters/editor";

export {};

declare global {
  interface PageInspection {
    pageCount: number;
    pageSizes: ReadonlyArray<{ width: number; height: number }>;
    positions: Record<string, { x?: number; y?: number; pageIndex: number | null }>;
  }

  /** One element's position on the page it landed on: the page's own index, the
   * element's offset from that page's top-left corner in CSS pixels, its own
   * height, and the height of the whole sheet it landed on. The last two are what
   * make a box anchored to the foot of the page measurable. */
  interface PageBox {
    pageIndex: number;
    x: number;
    y: number;
    height: number;
    pageHeight: number;
  }

  interface PageMeasurement {
    pageCount: number;
    /** Keyed `line-<data-line>` for a rendered block, `probe-<data-probe>` for an
     * element the book's own source marked. Absent when nothing carried the key. */
    boxes: Record<string, PageBox | undefined>;
  }

  /** What the pagination adapter reported about one page that did not fit: the
   * source line it was declared on, and how many physical pages it took. */
  interface OverflowingPageReport {
    line: number;
    pages: number;
  }

  interface OverflowInspection {
    pageCount: number;
    overflowingPages: OverflowingPageReport[];
    /** How many physical pages the engine left in the preview container, so a
     * test can see the book was still shown rather than withheld. */
    renderedPages: number;
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
    __paginateAndMeasure: (source: string) => Promise<PageMeasurement>;
    __paginateAndReportOverflow: (source: string) => Promise<OverflowInspection>;
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
    __printDialoguesOpened: () => number;
    __printSequentiallyStartsFreshAttempts: (source: string) => Promise<boolean>;
    __editor?: EditorHandle;
    __writeCount: number;
    __repaintCount: number;
  }
}
