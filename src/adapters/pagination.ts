import { CoreViewer, type Payload } from "@vivliostyle/core";

import { EngineTimeoutError } from "./engine-timeout";

// How long one pagination call may go unanswered before it is given up on
// (issue #10). Deliberately generous: the failure being bounded here is a
// permanent one, so any finite bound fixes it, while a bound short enough to cut
// off a genuinely large book mid-layout would turn a book that merely takes a
// while into a book that can never be previewed at all.
export const PAGINATION_TIMEOUT_SECONDS = 30;

/**
 * A page (CONTEXT.md's Page) the engine spread over more than one physical page:
 * the source line the author declared it on, and how many physical pages its
 * content actually took. Never fewer than two -- a page that fits is not reported
 * at all.
 *
 * Not an error, and deliberately not one of the app's `PreviewError` cases: that
 * union is the closed set of ways to fail to produce a book, and a book that
 * overflows was produced. It is only a book that no longer matches what its author
 * declared, which is something to tell them about while still showing it.
 */
export interface OverflowingPage {
  readonly line: number;
  readonly pages: number;
}

export interface PaginationResult {
  readonly pageCount: number;
  /** Each page's rendered size in CSS pixels, driven by the book's `@page size`. */
  readonly pageSizes: ReadonlyArray<{ readonly width: number; readonly height: number }>;
  /**
   * The pages whose content did not fit on the one physical page they claim, in
   * source order. Empty when every page fits, which is the ordinary case and the
   * only thing a book of nothing but sections can produce.
   */
  readonly overflowingPages: readonly OverflowingPage[];
}

/**
 * Paginates an HTML document (as produced by `core/render-book`) into `container`
 * using the real Vivliostyle engine (ADR-0002). Resolves once the whole book has laid
 * out, carrying the resulting page count — Vivliostyle's own pagination, never ours.
 *
 * Loads the document from a blob URL rather than a served path: the document is a
 * string the app just built in memory, not a resource that lives at a URL.
 *
 * All-or-nothing about `container`'s contents (issue #11): when it settles, the
 * container either holds a newly paginated book or exactly the children it held on
 * the way in -- never the empty space that a failed run used to leave behind. A
 * timeout is a way of settling, so it restores the container as an engine failure
 * does; anything less would reintroduce the blank preview issue #11 closed, by a
 * different door.
 *
 * Rejects if the engine has not answered within `PAGINATION_TIMEOUT_SECONDS`, so the
 * caller's own guards are released and the next edit starts a fresh attempt (issue
 * #10). The engine's work cannot be called off, so that run stays alive and may still
 * answer afterwards. Every listener this call registered is removed at the moment it
 * gives up, which is what keeps the late answer from putting a stale book back over
 * whatever the preview has moved on to.
 *
 * The guarantee is about children, and only against this adapter's own handlers.
 * `removeListener` detaches from the viewer's event target; the object that writes to
 * `container` is the viewer's internal one, and nothing detaches that. Measured, on
 * an abandoned run resumed to completion: its *pages* never reach the preview, because
 * the restore takes the engine's own viewport subtree out of the document with the
 * rest of the children, and a detached element has no geometry for the engine to lay
 * out against (ADR-0005) -- so the run halts where it stands, writing into a subtree
 * nobody can see. Its *attributes* do reach it: `data-vivliostyle-viewer-status` and
 * `data-vivliostyle-page-progression` are written straight onto `container`, and land
 * there again a moment after the restore has put the old values back. Nothing styles
 * off them, so today this is residue rather than a visible defect, and it is as far
 * as a bound can go without a staging container. Issue #15 carries that.
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
      // Read off the laid-out document, before cleanup and while the container
      // still holds the book the engine just produced.
      const overflowingPages = findOverflowingPages(container);
      cleanup();
      resolve({ pageCount: latestEpageCount ?? payload.epageCount, pageSizes, overflowingPages });
    };
    const onError = (payload: Payload): void => {
      cleanup();
      restoreLastGoodRender();
      reject(new Error(`Vivliostyle failed to paginate the book: ${JSON.stringify(payload.content)}`));
    };
    // Discards whatever the engine had already laid out before it gave up, along
    // with the empty container a first-ever failure leaves (nothing to put back is
    // an empty spread, not a special case). Attributes the engine added during the
    // abandoned run go with it, and any it overwrote go back to the value they had
    // on the way in.
    const restoreLastGoodRender = (): void => {
      container.replaceChildren(...lastGoodRender);
      for (const { name } of Array.from(container.attributes)) {
        container.removeAttribute(name);
      }
      for (const [name, value] of lastGoodAttributes) {
        container.setAttribute(name, value);
      }
    };
    // Undoes everything this call registered, so that a run given up on cannot
    // reach back into a container the preview has since moved on with: the engine
    // is still working -- there is no way to stop it -- and its 'loaded' or 'error'
    // may still arrive for a book nobody is waiting for any more. This stops the
    // handlers above from acting; it does not stop the engine, which goes on writing
    // its own attributes onto the container afterwards (issue #15).
    const cleanup = (): void => {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(blobUrl);
      viewer.removeListener("nav", onNav);
      viewer.removeListener("loaded", onLoaded);
      viewer.removeListener("error", onError);
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      restoreLastGoodRender();
      reject(new EngineTimeoutError(PAGINATION_TIMEOUT_SECONDS));
    }, PAGINATION_TIMEOUT_SECONDS * 1000);

    viewer.addListener("nav", onNav);
    viewer.addListener("loaded", onLoaded);
    viewer.addListener("error", onError);
    viewer.loadDocument(blobUrl);
  });
}

/**
 * The pages that took more than the one physical page they claim, read off the
 * document the engine has just laid out.
 *
 * Detection belongs here and nowhere above: this is the only place that sees a
 * laid-out book. A named CSS page is a page *style*, not a page *quota* (ADR-0007)
 * -- measured, fourteen paragraphs inside one produced two pages, both carrying its
 * own styling -- so the engine will not prevent this and "exactly one page" stays
 * ours to check.
 *
 * The check is a count. `render-book.ts` marks a page's own element with
 * `data-grimoire-page`, beside the source line it was declared on; the engine
 * renders a block once per physical page it occupies, inside that page's own
 * container. So a page that fits appears under one page index and a page that
 * spilled appears under several, and the number of distinct indices is the number
 * of pages it took.
 *
 * The mark, and not the `page` class or `data-line` alone: a book may contain raw
 * HTML (ADR-0006), so an author writing either of those by hand would otherwise
 * make their own book report an overflow that never happened.
 *
 * Nothing here rejects, and the caller is handed this beside the page count rather
 * than instead of it: the book paginated, and an author deciding what to cut needs
 * to see what spilled.
 */
function findOverflowingPages(container: HTMLElement): OverflowingPage[] {
  const physicalPagesByLine = new Map<number, Set<number>>();

  for (const element of container.querySelectorAll("[data-grimoire-page][data-line]")) {
    const line = Number(element.getAttribute("data-line"));
    const physicalPage = element.closest("[data-vivliostyle-page-index]");
    if (!Number.isInteger(line) || physicalPage === null) continue;

    const index = Number(physicalPage.getAttribute("data-vivliostyle-page-index"));
    if (!Number.isInteger(index)) continue;

    const indices = physicalPagesByLine.get(line) ?? new Set<number>();
    indices.add(index);
    physicalPagesByLine.set(line, indices);
  }

  return Array.from(physicalPagesByLine)
    .filter(([, indices]) => indices.size > 1)
    .map(([line, indices]) => ({ line, pages: indices.size }))
    .sort((a, b) => a.line - b.line);
}
