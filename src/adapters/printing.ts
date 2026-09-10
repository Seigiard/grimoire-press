import { printHTML } from "@vivliostyle/core";

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
 */
let inFlight: Promise<void> | undefined;

export function printBook(html: string): Promise<void> {
  if (inFlight !== undefined) return inFlight;

  const attempt = new Promise<void>((resolve, reject) => {
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
    inFlight = undefined;
  });

  inFlight = attempt;
  return attempt;
}
