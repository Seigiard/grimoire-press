// Prints a book through the real browser print engine so the resulting PDF can be
// inspected: `pdftotext` must extract its text, and `pdffonts` must show every
// typeface embedded rather than silently fallen back to a machine font.
//
// This does not go through the preview's own pagination (Vivliostyle in a
// CoreViewer, printed through @vivliostyle/core's printHTML) because that
// path needs a live browser tab and a print dialog -- there is no headless
// equivalent that stays faithful to ADR-0001's "PDF comes from the browser's
// print engine". Chromium's own page.pdf() *is* that print engine, so this
// loads the exact same HTML string render-book.ts produces (core, unmodified)
// into a Playwright-driven Chromium and asks it to print -- as close to the
// real path as a script can get without a browser tab.
//
// render-book.ts imports the theme through Vite-only `?raw`/`?inline` asset
// suffixes (see src/core/themes/vite-assets.d.ts), which plain Node has no
// idea how to resolve. `ssrLoadModule` runs the same transform pipeline
// `vite build`/`vitest` already use, in Node, without a browser -- the
// supported way to import a Vite-only module from a script like this one.
//
// Usage: npm run check:pdf, then: pdffonts /tmp/check.pdf
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { createServer } from "vite";

// Narrow on purpose (a bit narrower than a typical digest-sized book): wide
// enough to read, narrow enough that the long compound words below cannot
// help but wrap somewhere -- proof that "hyphens: auto" + lang="ru" is
// actually breaking them at syllable boundaries and not just word-wrapping.
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
  "</Section>",
  "</Book>",
].join("\n");

const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const { renderBook } = await server.ssrLoadModule("/src/core/render-book.ts");
const html = renderBook({ source: RUSSIAN_BOOK });
await server.close();

const browser = await chromium.launch();
const page = await browser.newPage();
// data: URL, not page.setContent(): setContent leaves page.url() at
// about:blank, and this book's fonts are base64 data: URIs anyway (see
// default-ru/theme.ts), so nothing here depends on a same-origin fetch --
// this is the simplest way to hand Chromium a complete, self-contained
// document.
await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
await page.waitForLoadState("networkidle");
const pdf = await page.pdf({ printBackground: true });
writeFileSync("/tmp/check.pdf", pdf);
await browser.close();

console.log("Wrote /tmp/check.pdf (" + pdf.length + " bytes)");
