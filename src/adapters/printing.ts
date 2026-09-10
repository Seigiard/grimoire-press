import { printHTML } from "@vivliostyle/core";

import { EngineTimeoutError } from "./engine-timeout";

// How long one print call may go unanswered before it is given up on (issue #10).
// More generous than pagination's bound for two reasons: printing lays the whole
// book out again from scratch, and the author is deliberately standing by for the
// dialogue, so cutting a long book off early costs them the print they asked for
// rather than a preview that will repaint again on the next keystroke anyway.
const PRINT_TIMEOUT_SECONDS = 60;

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
 * it (issue #10). The hidden iframe cannot be called off and may still call back for
 * the abandoned attempt; the guard is released once, on that attempt settling, and
 * never written again -- so a late callback cannot reclaim a guard that by then
 * belongs to whatever the author started next.
 */
let inFlight: Promise<void> | undefined;

export function printBook(html: string): Promise<void> {
  if (inFlight !== undefined) return inFlight;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const attempt = new Promise<void>((resolve, reject) => {
    timeoutId = setTimeout(() => reject(new EngineTimeoutError(PRINT_TIMEOUT_SECONDS)), PRINT_TIMEOUT_SECONDS * 1000);
    printHTML(html, {
      title: "Grimoire Press",
      printCallback: (iframeWindow) => {
        iframeWindow.print();
        resolve();
      },
      errorCallback: (message) => {
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
