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
 */
export function printBook(html: string): void {
  printHTML(html, {
    title: "Grimoire Press",
    printCallback: (iframeWindow) => iframeWindow.print(),
    errorCallback: (message) => {
      throw new Error(`Vivliostyle failed to prepare the book for printing: ${message}`);
    },
    hideIframe: true,
    removeIframe: true,
  });
}
