// Prints a book through the real browser print engine so the resulting PDF can be
// inspected: `pdffonts` must show every typeface embedded rather than silently
// fallen back to a machine font, and `pdftotext -bbox` must show the page the
// author turned landscape printed on the book's own sheet lying the long way.
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
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "vite";

// A port distinct from playwright.config.ts's 5183, so this script can run
// without clashing with `npm run test:e2e`'s own dev server.
const PORT = 5197;

// The book is bound at one format, in millimetres, so the checks at the foot of
// this file can say what a sheet of it measures without reading the size back out
// of the markup that declared it.
const SHEET_ACROSS_MM = 90;
const SHEET_DOWN_MM = 160;
const PT_PER_MM = 72 / 25.4;

// Narrow on purpose (a bit narrower than a typical digest-sized book): wide
// enough to read, narrow enough that the long compound words below cannot
// help but wrap somewhere -- proof that "hyphens: auto" + lang="ru" is
// actually breaking them at syllable boundaries and not just word-wrapping.
// Two headings, forced onto separate pages by <PageBreak />, is issue #5's
// own evidence: a running header that names one heading on the first page
// and the other on the second is not provable from a single heading.
//
// Every run of this book has to reach every face the theme declares, or the
// check silently stops guarding the ones it misses. That is what happened up
// to issue #9: with no italic and no bold anywhere in the text, the theme's
// italic and semibold @font-face rules never loaded, and `pdffonts` reported
// on the two faces the book happened to use rather than on the eight the
// theme ships. So the emphasis below is not decoration -- each run is the
// only thing that pulls one face into the PDF:
//
//   plain Cyrillic prose  -> Vollkorn 400 normal (and @bottom-center)
//   *курсив*              -> Vollkorn 400 italic
//   **полужирный**        -> Vollkorn 600 normal
//   ***оба сразу***       -> Vollkorn 600 italic
//   > blockquote          -> Vollkorn 400 italic at display size
//   # Заголовок           -> Alegreya 600 normal (and @top-center at 400)
//   # ... *с курсивом*    -> Alegreya 600 italic
//
// Alegreya 400 italic is the one shipped face this book cannot reach: the
// theme sets Alegreya in h1..h4 (weight 600) and in @top-center (weight 400,
// font-style normal), so nothing in its CSS can ask for Alegreya italic at
// 400. It ships anyway, because an author writing emphasis inside a heading
// at any other weight would otherwise land back on a synthesised oblique.
// The last block is a page turned landscape (issue #22): a wide table that needs
// the long edge of the very sheet the book is bound at. It is here rather than in
// a book of its own because "prints landscape" is a claim about one page among
// pages that did not turn, and the same print run is what proves the rest of them
// stayed upright.
const RUSSIAN_BOOK = [
  `<Book size="${SHEET_ACROSS_MM}mm ${SHEET_DOWN_MM}mm" theme="default-ru">`,
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
  "Ход *«Прочитать обстановку»* даёт **преимущество**, а на полном успехе — " +
    "***решающее преимущество***, которое сохраняется до конца сцены.",
  "",
  "> Предгрозовое затишье длилось недолго: свидетельствование о " +
    "достопримечательностях закончилось, и переосвидетельствование началось.",
  "",
  "<PageBreak />",
  "",
  "# Второй раздел *и продолжение*",
  "",
  "Текст второго раздела, чтобы бегущий заголовок сменился вместе с ним.",
  "</Section>",
  '<Page orientation="landscape">',
  "# Лист персонажа",
  "",
  "Широкая таблица, которой нужна длинная сторона листа, а не короткая: " +
    "строка, набранная поперёк повёрнутого листа, шире всего того, что " +
    "помещается на страницах вокруг неё.",
  "</Page>",
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

// The check that gives this script its name. Everything above only produces a
// PDF; without this, a change that puts a variable font back in the theme
// prints a perfectly readable book whose every glyph is a Type 3 drawing
// procedure, and nothing notices. `pdffonts` is the oracle: the type column
// must read CID TrueType for every face, and no face may carry a synthetic
// axis suffix such as `_wght2580000`, which is how Chromium names an instance
// of a file that still declares variation axes. See issue #9.
let fontReport;
try {
  fontReport = execFileSync("pdffonts", ["/tmp/check.pdf"], { encoding: "utf8" });
} catch (error) {
  // Not a warning. This script's job is to check the PDF, and without the
  // checker it cannot do it -- exiting 0 here would be a green run that
  // verified nothing.
  console.error("pdffonts is required to check the printed PDF and is not available.");
  console.error("Install poppler (macOS: `brew install poppler`), then run this again.");
  console.error(String(error));
  process.exit(1);
}

console.log(fontReport.trimEnd());

const faces = fontReport
  .split("\n")
  .slice(2)
  .filter((line) => line.trim() !== "")
  .map((line) => ({ name: line.slice(0, 36).trim(), type: line.slice(37, 54).trim() }));

const problems = [];
if (faces.length === 0) {
  problems.push("the PDF embeds no typeface at all");
}
for (const face of faces) {
  if (face.type !== "CID TrueType") {
    problems.push(`${face.name} embeds as ${face.type}, not CID TrueType`);
  }
  if (/_wght\d/.test(face.name)) {
    problems.push(`${face.name} carries an axis suffix, so it is still on a variable font file`);
  }
}

if (problems.length > 0) {
  console.error("\nThe printed PDF does not embed its typefaces as outline fonts:");
  for (const problem of [...new Set(problems)]) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`\nEvery face embeds as an outline font (${new Set(faces.map((f) => f.name)).size} distinct).`);

// The second check: a page an author turned prints turned (issue #22).
//
// Not readable from the printed page's own size. Vivliostyle's print path gives
// the whole document a single square sheet big enough for the longest edge of any
// page in it (measured: `@page {size: 454pt 454pt}` for this book) and draws each
// page's own box inside it, which is how one printed file carries pages of two
// shapes at all. Every PDF page therefore reports the same size, turned or not.
//
// What does distinguish them is where the text landed, which is what the author
// actually gets: a line set across a turned sheet runs wider than an upright sheet
// of this book is wide, and could not have been printed on one. So the oracle is
// the spread of the words themselves, measured by `pdftotext -bbox` -- spreads,
// not positions, because Chromium centres the document's sheet on whatever paper
// it is printing to and the offset that adds is not part of the claim.
let wordBoxes;
try {
  wordBoxes = execFileSync("pdftotext", ["-bbox", "/tmp/check.pdf", "-"], { encoding: "utf8" });
} catch (error) {
  console.error("pdftotext is required to check the printed PDF and is not available.");
  console.error("Install poppler (macOS: `brew install poppler`), then run this again.");
  console.error(String(error));
  process.exit(1);
}

const WORD = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/;
const printedPages = [];
for (const line of wordBoxes.split("\n")) {
  if (line.includes("<page ")) printedPages.push({ xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity });
  const word = WORD.exec(line);
  if (word === null || printedPages.length === 0) continue;
  const [, xMin, yMin, xMax, yMax] = word.map(Number);
  const spread = printedPages[printedPages.length - 1];
  spread.xMin = Math.min(spread.xMin, xMin);
  spread.xMax = Math.max(spread.xMax, xMax);
  spread.yMin = Math.min(spread.yMin, yMin);
  spread.yMax = Math.max(spread.yMax, yMax);
}

const across = SHEET_ACROSS_MM * PT_PER_MM;
const down = SHEET_DOWN_MM * PT_PER_MM;
// A point of slack: a glyph's inked bounding box is not its layout box, so a word
// can report a hair outside the area it was set in.
const SLACK_PT = 1;
const spreads = printedPages.map((page, index) => ({
  number: index + 1,
  across: page.xMax > page.xMin ? page.xMax - page.xMin : 0,
  down: page.yMax > page.yMin ? page.yMax - page.yMin : 0,
}));
const turnedPages = spreads.filter((page) => page.across > across + SLACK_PT);

const printProblems = [];
if (spreads.length === 0) {
  printProblems.push("the PDF has no text on any page at all");
}
// The page is the last block of the book, so it is the last page of it.
if (turnedPages.length !== 1 || turnedPages[0].number !== spreads.length) {
  printProblems.push(
    `expected the last page (${spreads.length}) alone to be set across a turned sheet, ` +
      `but the pages set wider than ${across.toFixed(1)}pt were: ` +
      (turnedPages.length === 0 ? "none" : turnedPages.map((p) => p.number).join(", ")),
  );
}
for (const page of spreads) {
  const turned = turnedPages.includes(page);
  const sheet = turned ? { across: down, down: across } : { across, down };
  if (page.across > sheet.across + SLACK_PT || page.down > sheet.down + SLACK_PT) {
    printProblems.push(
      `page ${page.number}'s text spreads ${page.across.toFixed(1)}x${page.down.toFixed(1)}pt, ` +
        `which does not fit the ${turned ? "turned" : "upright"} sheet ` +
        `(${sheet.across.toFixed(1)}x${sheet.down.toFixed(1)}pt)`,
    );
  }
}

if (printProblems.length > 0) {
  console.error("\nThe printed PDF does not show the page the author turned printing turned:");
  for (const problem of printProblems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `The page turned landscape printed across the sheet ` +
    `(${turnedPages[0].across.toFixed(1)}pt wide, on a book bound ${across.toFixed(1)}pt across).`,
);
