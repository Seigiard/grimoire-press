// Prints a book through the real browser print engine so the resulting PDF can be
// inspected: `pdftotext` must extract its text, and `pdffonts` must show every
// typeface embedded rather than silently fallen back to a machine font.
//
// This does not go through the preview's own pagination (Vivliostyle in a
// CoreViewer, printed through @vivliostyle/core's printHTML) because that
// path needs a live browser tab and a print dialog -- there is no headless
// equivalent that stays faithful to ADR-0001's "PDF comes from the browser's
// print engine": window.print() opens the OS/browser's own dialogue, which
// has no capturable result under automation.
//
// It used to stop there and hand Chromium's native page.pdf() the exact HTML
// render-book.ts produces, unmodified. Issue #5's running headers broke that
// shortcut: ADR-0002 records that plain Chrome has never implemented
// `string-set`, so a native print of that raw HTML shows page numbers (Chrome
// does support @page/counter(page)) but never a running header -- confirmed
// empirically while building this ticket; the header was silently missing
// from `pdftotext`'s output. Vivliostyle is what actually resolves
// `string-set`/`content(string(...))` into literal text, and it only does
// that as part of pagination, so this script now runs the book through
// `printHTML` (the same Vivliostyle entry point src/adapters/printing.ts
// calls) via a small fixture (tests/fixtures/print-capture-harness.html) that
// reads the fully-paginated iframe's document instead of calling
// `iframeWindow.print()` on it. What comes back is already-resolved, ordinary
// HTML -- literal header text and page numbers baked in by Vivliostyle, not a
// `string-set` declaration the printing browser must understand -- which is
// then handed to Chromium's page.pdf() exactly as before.
//
// render-book.ts imports the theme through Vite-only `?raw`/`?inline` asset
// suffixes (see src/core/themes/vite-assets.d.ts), which plain Node has no
// idea how to resolve, and the fixture above imports render-book.ts as an ES
// module -- both need a real Vite dev server transforming those imports, not
// Node's module loader, hence `createServer` here actually listens on a port
// instead of running in Node-side `ssrLoadModule` middleware mode as before.
//
// Usage: npm run check:pdf, then: pdffonts /tmp/check.pdf
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { createServer } from "vite";

// A port distinct from playwright.config.ts's 5183, so this script can run
// without clashing with `npm run test:e2e`'s own dev server.
const PORT = 5197;

// Narrow on purpose (a bit narrower than a typical digest-sized book): wide
// enough to read, narrow enough that the long compound words below cannot
// help but wrap somewhere -- proof that "hyphens: auto" + lang="ru" is
// actually breaking them at syllable boundaries and not just word-wrapping.
// Two headings, forced onto separate pages by <PageBreak />, is issue #5's
// own evidence: a running header that names one heading on the first page
// and the other on the second is not provable from a single heading.
const RUSSIAN_BOOK = [
  '<Book size="90mm 160mm" theme="default-ru">',
  '<Section columns="1">',
  "# Заголовок книги",
  "",
  "Это обычный русский текст с достаточным количеством слов, чтобы перенос строк " +
    "стал заметен на узкой колонке: длинные слова вроде " +
    "«интернационализация» или «кораблестроительство» должны переноситься " +
    "по слогам, а не вылезать за пределы колонки или разрываться некрасиво.",
  "",
  "A move named **Read the Situation** keeps its original English name inside " +
    "an otherwise Russian sentence, so «Read the Situation» should sit in the " +
    "very same typeface as the Cyrillic text around it.",
  "",
  "<PageBreak />",
  "",
  "# Второй раздел",
  "",
  "Текст второго раздела, чтобы бегущий заголовок сменился вместе с ним.",
  "</Section>",
  "</Book>",
].join("\n");

const server = await createServer({ server: { port: PORT, strictPort: true } });
await server.listen();

const browser = await chromium.launch();

const harnessPage = await browser.newPage();
await harnessPage.goto(`http://localhost:${PORT}/tests/fixtures/print-capture-harness.html`);
const printReadyHtml = await harnessPage.evaluate(
  (source) => window.__renderPrintReadyHtml(source),
  RUSSIAN_BOOK,
);
await harnessPage.close();

// data: URL, not page.setContent(): setContent leaves page.url() at
// about:blank, and this book's fonts are base64 data: URIs anyway (see
// default-ru/theme.ts), so nothing here depends on a same-origin fetch --
// this is the simplest way to hand Chromium a complete, self-contained
// document.
const printPage = await browser.newPage();
await printPage.goto(`data:text/html;charset=utf-8,${encodeURIComponent(printReadyHtml)}`);
await printPage.waitForLoadState("networkidle");
const pdf = await printPage.pdf({ printBackground: true });
writeFileSync("/tmp/check.pdf", pdf);

await browser.close();
await server.close();

console.log("Wrote /tmp/check.pdf (" + pdf.length + " bytes)");
