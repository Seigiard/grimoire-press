// Prints a book through the real browser print engine so the resulting PDF can be
// inspected: `pdffonts` must show every typeface embedded rather than silently
// fallen back to a machine font, and `pdftotext -bbox` must show the page the
// author turned landscape printed on the book's own sheet lying the long way, with
// no running header over it and its page number under it.
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
// stayed upright. The same page is what the third check reads, for the same reason:
// "carries no running header" (issue #21) is a claim about one page among pages
// that carry one, and it opens with a heading of its own so that a header printed
// over it would have something to say.
// The three headings, named here because the running header the printed file is
// checked for below is the heading of the part of the book the reader is in -- so
// the check compares the printed margin box against the very words this script
// wrote, not against a string it would otherwise have to repeat.
const FIRST_HEADING = "Заголовок книги";
const SECOND_HEADING = "Второй раздел *и продолжение*";
const CARD_HEADING = "Лист персонажа";

const RUSSIAN_BOOK = [
  `<Book size="${SHEET_ACROSS_MM}mm ${SHEET_DOWN_MM}mm" theme="default-ru">`,
  '<Section columns="1">',
  `# ${FIRST_HEADING}`,
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
  "Продолжение первой главы на следующей странице, чтобы её бегущий заголовок " +
    "встретился не на одной странице, а повторился на каждой.",
  "</Section>",
  '<Page orientation="landscape">',
  `# ${CARD_HEADING}`,
  "",
  "Широкая таблица, которой нужна длинная сторона листа, а не короткая: " +
    "строка, набранная поперёк повёрнутого листа, шире всего того, что " +
    "помещается на страницах вокруг неё.",
  "</Page>",
  '<Section columns="1">',
  `# ${SECOND_HEADING}`,
  "",
  "Текст второго раздела, который идёт после листа персонажа: глава " +
    "продолжается за ним, и её бегущий заголовок должен вернуться.",
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

// Every word the printed file carries, with its box and its text, grouped by the
// page it was printed on. Both checks below read this: the second measures how far
// the words on a page spread, the third reads which words landed in the band above
// the text and which in the band below it.
const WORD = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/;
const printedPages = [];
for (const line of wordBoxes.split("\n")) {
  if (line.includes("<page ")) printedPages.push([]);
  const word = WORD.exec(line);
  if (word === null || printedPages.length === 0) continue;
  const [, xMin, yMin, xMax, yMax, text] = word;
  printedPages[printedPages.length - 1].push({
    xMin: Number(xMin),
    yMin: Number(yMin),
    xMax: Number(xMax),
    yMax: Number(yMax),
    text,
  });
}

const across = SHEET_ACROSS_MM * PT_PER_MM;
const down = SHEET_DOWN_MM * PT_PER_MM;
// A point of slack: a glyph's inked bounding box is not its layout box, so a word
// can report a hair outside the area it was set in.
const SLACK_PT = 1;
const spreads = printedPages.map((words, index) => ({
  number: index + 1,
  across: words.length === 0 ? 0 : Math.max(...words.map((w) => w.xMax)) - Math.min(...words.map((w) => w.xMin)),
  down: words.length === 0 ? 0 : Math.max(...words.map((w) => w.yMax)) - Math.min(...words.map((w) => w.yMin)),
}));
const turnedPages = spreads.filter((page) => page.across > across + SLACK_PT);

const printProblems = [];
if (spreads.length === 0) {
  printProblems.push("the PDF has no text on any page at all");
}
// Which printed page is the author's own is read from what it says, not from where
// it sits: the page carries the heading it opens with, and nothing else in the book
// does. Counting to a position would make this check agree with itself about where
// the page landed, and where it landed is part of what is being checked.
const cardWords = CARD_HEADING.toUpperCase().split(" ");
const turnedByText = printedPages.findIndex((words) =>
  cardWords.every((wanted) => words.some((word) => word.text.toUpperCase() === wanted)),
);
if (turnedPages.length !== 1 || turnedByText === -1 || turnedPages[0].number !== turnedByText + 1) {
  printProblems.push(
    `expected the page carrying "${CARD_HEADING}" (printed page ` +
      `${turnedByText === -1 ? "not found" : turnedByText + 1}) alone to be set across a turned ` +
      `sheet, but the pages set wider than ${across.toFixed(1)}pt were: ` +
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

// The third check: the page carries no running header, and keeps its number
// (issue #21). A running header names where the reader is in the flow; a page has
// left the flow, so the chapter the author was writing around it must not be printed
// over it -- nor must the page's own heading, which would name the reader's place no
// better.
//
// The oracle is where the words landed and what they say. A running header is the
// text set in the top margin, above everything else on its page, and it says the
// heading of the part of the book that page belongs to -- one of the two this file
// wrote into the source. The page sits between those two chapters, so the pages
// before it are asked for the first chapter's heading and the pages after it for the
// second one's, each in its own place rather than merely somewhere: a renderer that
// printed the right two headings in the wrong order would satisfy "both were
// printed" and still be wrong. The page itself is asked for nothing at all in the
// band those lines occupy. The page number is read the same way from the other end:
// the bottom line of every page, the page's own, must be its position in the file.
const LINE_SLACK_PT = 1;

/** The words of one printed page, gathered into lines by their top edge: words set
 * on one line share it, and pdftotext reports each word's own box. */
const linesOf = (words) => {
  const lines = [];
  for (const word of [...words].sort((a, b) => a.yMin - b.yMin || a.xMin - b.xMin)) {
    const line = lines[lines.length - 1];
    if (line !== undefined && Math.abs(word.yMin - line.yMin) <= LINE_SLACK_PT) {
      line.yMax = Math.max(line.yMax, word.yMax);
      line.words.push(word.text);
    } else {
      lines.push({ yMin: word.yMin, yMax: word.yMax, words: [word.text] });
    }
  }
  return lines.map((line) => ({ yMin: line.yMin, yMax: line.yMax, text: line.words.join(" ") }));
};

/** What a heading looks like once it is a running header: the theme sets margin
 * boxes in capitals, and `string-set` captures a heading's rendered text, so the
 * emphasis markers an author wrote are not part of it. Compared in capitals at both
 * ends, so this stays a claim about the words rather than about the theme's
 * `text-transform`. */
const asHeader = (heading) => heading.replaceAll("*", "").toUpperCase();

const pageLines = printedPages.map(linesOf);
const headerProblems = [];
if (pageLines.length < 2 || pageLines.some((lines) => lines.length === 0)) {
  headerProblems.push(`expected a printed book of several pages, all with text on them, and got ${pageLines.length}`);
}

// Which printed page is the author's own is asked of the file rather than counted
// to: it is the one carrying the heading the page opens with. Counting to it would
// make this check agree with itself about where the page went, which is one of the
// things it is here to find out.
const cardHeader = asHeader(CARD_HEADING);
const cardIndex = pageLines.findIndex((lines) => lines.some((line) => line.text.toUpperCase() === cardHeader));
if (cardIndex === -1) {
  headerProblems.push(`no printed page carries the heading the page opens with, "${cardHeader}"`);
}
const thePage = pageLines[cardIndex] ?? [];
const printedHeaders = [
  ...pageLines.slice(0, Math.max(cardIndex, 0)).map((lines, index) => ({
    number: index + 1,
    line: lines[0],
    chapter: asHeader(FIRST_HEADING),
  })),
  ...pageLines.slice(cardIndex + 1).map((lines, index) => ({
    number: cardIndex + 2 + index,
    line: lines[0],
    chapter: asHeader(SECOND_HEADING),
  })),
];

// A page with no chapter on one side of it cannot say whether the header came back
// after the page, which is half of what "the pages around it keep theirs" claims.
const before = cardIndex;
const after = pageLines.length - cardIndex - 1;
if (cardIndex !== -1 && (before === 0 || after === 0)) {
  headerProblems.push(
    `the printed page is not between chapters: ${before} page(s) before it and ${after} after, ` +
      `so one side of "the pages around it keep their header" is not being read`,
  );
}

for (const { number, line, chapter } of printedHeaders) {
  if (line === undefined || line.text.toUpperCase() !== chapter) {
    headerProblems.push(
      `page ${number} is headed "${line?.text ?? ""}", not "${chapter}", so its running ` +
        `header does not name the chapter that page belongs to`,
    );
  }
}

const headerBandFoot = Math.max(...printedHeaders.map(({ line }) => line?.yMax ?? -Infinity));
const intruders = thePage.filter((line) => line.yMin < headerBandFoot);
if (intruders.length > 0) {
  headerProblems.push(
    `the page is printed with ${intruders.length} line(s) in the band its neighbours' ` +
      `running headers occupy (down to ${headerBandFoot.toFixed(1)}pt): ` +
      intruders.map((line) => `"${line.text}" at ${line.yMin.toFixed(1)}pt`).join(", "),
  );
}
// The band above is a claim about where words landed, and it reads the page against
// neighbours of a different shape printed on the same sheet. This second claim needs
// no geometry at all: a running header on this page would repeat the heading the page
// opens with, because the page's own heading reassigns `current-heading` (issue #18).
// So that heading appearing twice is the header, wherever on the sheet it landed --
// and appearing no times is a page that printed nothing, which would satisfy "nothing
// in the header band" for the wrong reason.
const cardHeadings = thePage.filter((line) => line.text.toUpperCase() === cardHeader);
if (cardIndex !== -1 && cardHeadings.length !== 1) {
  headerProblems.push(
    `the page prints the heading it opens with ${cardHeadings.length} time(s) rather than once: ` +
      cardHeadings.map((line) => `"${line.text}" at ${line.yMin.toFixed(1)}pt`).join(", "),
  );
}

// The address at the foot of each page, the page's own included.
const printedNumbers = pageLines.map((lines) => lines[lines.length - 1]?.text);
const expectedNumbers = pageLines.map((_, index) => String(index + 1));
if (printedNumbers.join(" ") !== expectedNumbers.join(" ")) {
  headerProblems.push(
    `the pages are not numbered ${expectedNumbers.join(", ")} at their feet, but ` +
      `${printedNumbers.map((text) => `"${text ?? ""}"`).join(", ")}`,
  );
}

if (headerProblems.length > 0) {
  console.error("\nThe printed PDF does not show a page free of the running header its neighbours carry:");
  for (const problem of headerProblems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `The page prints no running header where the ${before} page(s) of the chapter before it and ` +
    `the ${after} after it print theirs, and it is numbered ${printedNumbers[cardIndex]} at its foot.`,
);
