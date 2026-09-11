# PDF comes from the browser's print engine, not from a JavaScript PDF library

The editor shows a live preview of a book and must hand the author a PDF of it. The
obvious-looking route is a JavaScript library that writes a PDF file directly in the
browser, which would let us embed the finished PDF in the preview pane. We rejected that
and print the paginated HTML through the browser instead.

## Considered options

**A JavaScript PDF library** (jsPDF, pdfmake, pdf-lib) can write a real PDF file in the
browser, and that file can be displayed in an iframe. But none of them understand HTML or
CSS: each carries its own layout model and its own restricted style vocabulary. Adopting
one discards the stylesheet, the theme, and the embedded typefaces, which is most of what
this project is.

**Rasterising the page** (html2canvas and its descendants) draws the page into an image
and wraps the image in a PDF. The text stops being text: it cannot be selected or
searched, and print quality drops visibly.

**The browser's own print engine** produces a vector PDF with embedded typefaces and
selectable text, and it honours the whole stylesheet. It is reachable only through the
print dialog.

## Consequences

There is no silent download. The author presses a button, the print dialog opens, and
they choose to save as PDF. The file name comes from the document title rather than from
us.

The preview pane therefore shows paginated HTML, not an embedded PDF. Both come from the
same marked-up book, so they agree.

A one-press download stays available later through a server that loads the same HTML in
Playwright and calls `page.pdf()`. That is only possible while pagination is driven by the
book's own markup and stylesheet. Nothing in the editor's own page structure may take
part in laying out a book, or that route closes.

Code under `src/core` therefore cannot refer directly to browser globals and may import
only external packages that have been reviewed as DOM-free. The DOM-less core TypeScript
configuration and restricted-globals lint rule enforce the first constraint; the
external-package allowlist in the boundaries lint rule enforces the second. Adapters and
app code may use browser-bound packages because they sit outside the server-callable core.
