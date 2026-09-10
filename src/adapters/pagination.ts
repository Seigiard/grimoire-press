import { CoreViewer, type Payload } from "@vivliostyle/core";

export interface PaginationResult {
  readonly pageCount: number;
  /** Each page's rendered size in CSS pixels, driven by the book's `@page size`. */
  readonly pageSizes: ReadonlyArray<{ readonly width: number; readonly height: number }>;
}

/**
 * Paginates an HTML document (as produced by `core/render-book`) into `container`
 * using the real Vivliostyle engine (ADR-0002). Resolves once the whole book has laid
 * out, carrying the resulting page count — Vivliostyle's own pagination, never ours.
 *
 * Loads the document from a blob URL rather than a served path: the document is a
 * string the app just built in memory, not a resource that lives at a URL.
 *
 * All-or-nothing about `container` (issue #11): when it settles, the container either
 * holds a newly paginated book or exactly what it held on the way in -- never the
 * empty space that a failed run used to leave behind.
 */
export function paginate(container: HTMLElement, html: string): Promise<PaginationResult> {
  return new Promise((resolve, reject) => {
    // The last book that paginated successfully, held onto across the emptying below
    // so a failed run can put it back. An engine failure hands the author no line
    // number to go to, unlike a markup error, so the render they were writing against
    // is the only thing left that tells them where they are.
    //
    // Laying the next book out in a detached staging container and swapping it in on
    // success would keep the preview intact without any of this, and would remove the
    // empty flash of a slow repaint too -- but the engine cannot fragment a book it
    // cannot measure, and a detached container collapses every page onto one. See
    // ADR-0005.
    const lastGoodRender = Array.from(container.childNodes);
    // The engine writes its own bookkeeping onto the container as well as into it --
    // a viewer-status, a page progression, `--viv-*` custom properties -- and a run
    // that fails leaves that bookkeeping describing the failed run. Nothing styles
    // off those attributes today, so this is not a visible defect; it is the
    // difference between the guarantee above being true and being nearly true, and a
    // guarantee that is nearly true is the kind a later change quietly relies on.
    const lastGoodAttributes = Array.from(container.attributes, (a) => [a.name, a.value] as const);
    // Each call creates a fresh CoreViewer rather than reloading an existing one, so
    // a stale render from the previous call must be cleared first: CoreViewer appends
    // to the viewport element, it does not replace what a prior instance left there.
    container.replaceChildren();
    // autoResize would register a window resize listener, and a viewer is created per
    // call, so leaving it on leaks one listener per keystroke. `CoreViewer` in
    // @vivliostyle/core 2.45.1 exposes no teardown method at all -- there is no
    // `destroy()` to call afterwards -- so never registering the listener is the only
    // way not to accumulate them. The preview repaints from source instead of
    // resizing in place.
    const viewer = new CoreViewer({ viewportElement: container }, { autoResize: false });
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
      const pageSizes = viewer.getPageSizes();
      cleanup();
      resolve({ pageCount: latestEpageCount ?? payload.epageCount, pageSizes });
    };
    const onError = (payload: Payload): void => {
      cleanup();
      // Discards whatever the engine had already laid out before it gave up, along
      // with the empty container a first-ever failure leaves (nothing to put back is
      // an empty spread, not a special case).
      container.replaceChildren(...lastGoodRender);
      // Attributes the engine added during the failed run go with it, and any it
      // overwrote go back to the value they had on the way in.
      for (const { name } of Array.from(container.attributes)) {
        container.removeAttribute(name);
      }
      for (const [name, value] of lastGoodAttributes) {
        container.setAttribute(name, value);
      }
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
