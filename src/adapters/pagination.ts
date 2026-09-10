import { CoreViewer, type Payload } from "@vivliostyle/core";

export interface PaginationResult {
  readonly pageCount: number;
}

/**
 * Paginates an HTML document (as produced by `core/render-book`) into `container`
 * using the real Vivliostyle engine (ADR-0002). Resolves once the whole book has laid
 * out, carrying the resulting page count — Vivliostyle's own pagination, never ours.
 *
 * Loads the document from a blob URL rather than a served path: the document is a
 * string the app just built in memory, not a resource that lives at a URL.
 */
export function paginate(container: HTMLElement, html: string): Promise<PaginationResult> {
  return new Promise((resolve, reject) => {
    // Each call creates a fresh CoreViewer rather than reloading an existing one, so
    // a stale render from the previous call must be cleared first: CoreViewer appends
    // to the viewport element, it does not replace what a prior instance left there.
    container.replaceChildren();
    const viewer = new CoreViewer({ viewportElement: container });
    const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));

    // The 'loaded' event's own payload carries no epageCount (it is just {type:
    // "loaded"}); the count arrives on 'nav' events instead, dispatched once per
    // navigation and again as background rendering updates each page's count. The
    // last 'nav' seen before 'loaded' fires is the total once renderAllPages (the
    // default) has finished laying out every page.
    let latestEpageCount: number | undefined;

    const onNav = (payload: Payload): void => {
      latestEpageCount = payload.epageCount;
    };
    const onLoaded = (payload: Payload): void => {
      cleanup();
      resolve({ pageCount: latestEpageCount ?? payload.epageCount });
    };
    const onError = (payload: Payload): void => {
      cleanup();
      reject(new Error(`Vivliostyle failed to paginate the book: ${JSON.stringify(payload.content)}`));
    };
    const cleanup = (): void => {
      URL.revokeObjectURL(blobUrl);
      viewer.removeListener("nav", onNav);
      viewer.removeListener("loaded", onLoaded);
      viewer.removeListener("error", onError);
    };

    viewer.addListener("nav", onNav);
    viewer.addListener("loaded", onLoaded);
    viewer.addListener("error", onError);
    viewer.loadDocument(blobUrl);
  });
}
