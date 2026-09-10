import { printHTML } from "@vivliostyle/core";

import { EngineTimeoutError } from "./engine-timeout";

// How long one print call may go unanswered before it is given up on (issue #10).
// More generous than pagination's bound for two reasons: printing lays the whole
// book out again from scratch, and the author is deliberately standing by for the
// dialogue, so cutting a long book off early costs them the print they asked for
// rather than a preview that will repaint again on the next keystroke anyway.
export const PRINT_TIMEOUT_SECONDS = 60;

/**
 * Prints an HTML document (the same string the preview pane paginated) through the
 * browser's own print engine (ADR-0001). Vivliostyle lays the document out again in a
 * hidden iframe and calls that frame's `print()`, so the printed PDF is paginated by
 * the same engine and the same markup the preview showed, and the editor's own page
 * never takes part in the printed layout.
 *
 * There is no silent download: this opens the browser's print dialogue, where the
 * author chooses to save as PDF.
 *
 * Resolves once the print dialogue has been asked for, rejects on a Vivliostyle
 * failure -- `printHTML`'s own `errorCallback` runs outside this function's call
 * stack, so a caller can only ever observe that failure through this promise, never
 * through a thrown exception.
 *
 * Vivliostyle keeps a single global print instance, so a second call before the
 * first hidden iframe finishes would repoint it out from under the first: the first
 * frame could print the wrong markup, and its callbacks could fire after the second
 * call's cleanup already ran. A call made while one is in flight joins that one
 * instead of starting a second, which is what makes this single-flight.
 *
 * That guard is what makes a hung print permanent rather than merely slow: neither
 * callback runs, so nothing releases it, and every later click hands the author the
 * same stuck promise back. Rejecting after `PRINT_TIMEOUT_SECONDS` is what releases
 * it (issue #10).
 *
 * The hidden iframe cannot be called off and may still call back for an attempt
 * already given up on. Settling a promise twice is a no-op, but `printCallback`
 * opens the browser's print dialogue *before* it resolves, and that is a real thing
 * happening to a real author -- a dialogue for a book they asked to print minutes
 * ago, over whatever they are doing now. `printHTML` offers no way to take its
 * callbacks back, so where `pagination.ts` can stop listening, this has to decline
 * to act instead: the bound marks the attempt abandoned, and both callbacks check
 * that before doing anything at all. The guard itself is released once, on the
 * attempt settling, and never written again, so a late callback cannot reclaim one
 * that by then belongs to whatever the author started next.
 */
let inFlight: Promise<void> | undefined;

export function printBook(html: string): Promise<void> {
  if (inFlight !== undefined) return inFlight;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const attempt = new Promise<void>((resolve, reject) => {
    // Set by the bound below and read by both callbacks: the hidden iframe keeps
    // working after this attempt has been given up on, and neither of its answers
    // may act on a print nobody is waiting for any more.
    let abandoned = false;

    timeoutId = setTimeout(() => {
      abandoned = true;
      reject(new EngineTimeoutError(PRINT_TIMEOUT_SECONDS));
    }, PRINT_TIMEOUT_SECONDS * 1000);

    printHTML(html, {
      title: "Grimoire Press",
      printCallback: (iframeWindow) => {
        if (abandoned) return;
        iframeWindow.print();
        resolve();
      },
      errorCallback: (message) => {
        if (abandoned) return;
        reject(new Error(`Vivliostyle failed to prepare the book for printing: ${message}`));
      },
      hideIframe: true,
      removeIframe: true,
    });
  }).finally(() => {
    // An attempt that answered in time leaves no timer behind to fire into an
    // empty session a minute later.
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    inFlight = undefined;
  });

  inFlight = attempt;
  return attempt;
}
