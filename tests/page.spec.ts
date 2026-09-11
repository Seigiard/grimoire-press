import { expect, test } from "@playwright/test";

/**
 * Consumer: an author who writes a page between two chapters -- a character sheet,
 * a reference card -- and expects it to be one physical page of its own, with the
 * coordinates they wrote inside it resolving against that page.
 *
 * The oracle is always what the real Vivliostyle engine did: its own page count,
 * its own page indices, and the geometry it laid out, read back from the pages it
 * produced. Never render-book.ts's CSS or markup, which would only test the
 * renderer against itself. Where a claim is comparative -- "the chapters around a
 * page are laid out as they are without it" -- the other side of the comparison is
 * the same engine paginating a book this file wrote, not a number this file
 * predicted. Where a claim is absolute -- "forty millimetres down lands forty
 * millimetres down" -- the expected value is the offset the book's own source
 * declares, converted by CSS's own definition of a millimetre and measured from a
 * page origin the engine reported.
 */

/** CSS's own definition: 1in is 96px and 1in is 25.4mm. Nothing in this repository
 * decides this, which is what makes it usable as an oracle for a declared offset. */
const mm = (value: number): number => (value / 25.4) * 96;

/** Sub-pixel: Vivliostyle lays pages out under a pixel-ratio emulation, so a
 * measured offset lands within a hundredth of a pixel of the declared one rather
 * than exactly on it. One decimal place is far finer than any layout mistake this
 * suite looks for -- the subtlest of them, a coordinate resolved against a frame
 * that a heading's margin pushed down the page, is off by some twenty pixels. */
const round = (value: number): number => Math.round(value * 10) / 10;

const paragraph = (n: number): string =>
  `Paragraph ${n}. ` +
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ".repeat(
    3,
  );

/** `count` paragraphs, each followed by the blank line that ends it, so a fixture's
 * line numbers are countable from the arrays it is built out of. */
const prose = (from: number, count: number): string[] =>
  Array.from({ length: count }, (_, i) => [paragraph(from + i), ""]).flat();

const chapter = (body: readonly string[]): string[] => ['<Section columns="1">', ...body, "</Section>"];

const box = (measurement: PageMeasurement, key: string): PageBox => {
  const found = measurement.boxes[key];
  if (found === undefined) throw new Error(`nothing was measured for ${key}`);
  return found;
};

// --- A book of prose, a page, and more prose -----------------------------------
// 1 <Book>            5 <Page>              8 <Section columns="1">
// 2 <Section ...>     6 A card ...          9 Short prose after.
// 3 Short prose ...   7 </Page>            10 </Section>
// 4 </Section>                             11 </Book>
const proseAroundACard = (size: string, pageTag: string, theme?: string): string =>
  [
    `<Book size="${size}"${theme === undefined ? "" : ` theme="${theme}"`}>`,
    '<Section columns="1">',
    "Short prose before the card.",
    "</Section>",
    pageTag,
    "A card that stands on its own.",
    "</Page>",
    '<Section columns="1">',
    "Short prose after the card.",
    "</Section>",
    "</Book>",
  ].join("\n");

const PROSE_PAGE_PROSE = proseAroundACard("A5", "<Page>");

// 1 <Book>            5 <Page>            8 <Page>           11 <Section ...>
// 2 <Section ...>     6 First card.       9 Second card.     12 Prose after.
// 3 Prose before.     7 </Page>          10 </Page>          13 </Section>
// 4 </Section>                                               14 </Book>
const TWO_PAGES_IN_A_ROW = [
  '<Book size="A5">',
  '<Section columns="1">',
  "Short prose before the cards.",
  "</Section>",
  "<Page>",
  "The first card.",
  "</Page>",
  "<Page>",
  "The second card.",
  "</Page>",
  '<Section columns="1">',
  "Short prose after the cards.",
  "</Section>",
  "</Book>",
].join("\n");

test.describe("a page occupies one page of its own", () => {
  test("prose, a page and more prose lay out as three pages with the page alone in the middle", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    // #given: a book whose author declared no break anywhere
    // #when: the real engine paginates it
    const measured = await page.evaluate((source) => window.__paginateAndMeasure(source), PROSE_PAGE_PROSE);

    // #then: three pages, and the engine put each block on one of its own
    expect({
      pageCount: measured.pageCount,
      proseBefore: box(measured, "line-3").pageIndex,
      thePage: box(measured, "line-5").pageIndex,
      proseAfter: box(measured, "line-9").pageIndex,
    }).toEqual({ pageCount: 3, proseBefore: 0, thePage: 1, proseAfter: 2 });
  });

  test("two pages written one after another are two pages", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    // #given: a character sheet and its reference card, written back to back
    // #when: the real engine paginates the book
    const measured = await page.evaluate((source) => window.__paginateAndMeasure(source), TWO_PAGES_IN_A_ROW);

    // #then: each card got a page, and the two did not run together into one
    expect({
      pageCount: measured.pageCount,
      firstCard: box(measured, "line-5").pageIndex,
      secondCard: box(measured, "line-8").pageIndex,
    }).toEqual({ pageCount: 4, firstCard: 1, secondCard: 2 });
  });
});

// --- The same chapter, with and without a page after it ------------------------
const FIRST_CHAPTER = prose(1, 6);
const SECOND_CHAPTER = prose(20, 6);
const FIRST_CHAPTER_ALONE = ['<Book size="A5">', ...chapter(FIRST_CHAPTER), "</Book>"].join("\n");
const SECOND_CHAPTER_ALONE = ['<Book size="A5">', ...chapter(SECOND_CHAPTER), "</Book>"].join("\n");

// A page deep enough into the book that the sheet it lands on is nowhere near the
// document's own origin: were an author's coordinates resolving against anything
// but this page, they would be out by whole pages rather than by a hair. The
// heading is the case ADR-0007 warns about -- its top margin collapses through
// whatever box sits at the top of the page -- and the box anchored to the foot of
// the sheet is the case that tells a frame the size of the page apart from one the
// size of its contents.
// 1 <Book>                            16 <Page>              19 strength
// 2 <Section columns="1">             17 # Character sheet   20 wounds
// 3..14 six paragraphs and blanks     18 (blank)             21 playbook
// 15 </Section>                                              22 </Page>  23 </Book>
const PLACED_BOXES = [
  '<Book size="A5">',
  ...chapter(FIRST_CHAPTER),
  "<Page>",
  "# Character sheet",
  "",
  '<div data-probe="strength" style="position: absolute; top: 40mm; left: 20mm;">Strength</div>',
  '<div data-probe="wounds" style="position: absolute; top: 100mm; left: 50mm;">Wounds</div>',
  '<div data-probe="playbook" style="position: absolute; bottom: 20mm; left: 20mm;">Playbook</div>',
  "</Page>",
  "</Book>",
].join("\n");

test.describe("a page is the frame of reference for what an author places on it", () => {
  test("boxes placed inside a page land where they were declared on that page", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    // #given: three boxes an author positioned inside a page late in the book, and
    // the same chapter without the page, which tells us where a page's own area
    // begins and how many pages that chapter takes
    // #when: the real engine lays both books out
    const measured = await page.evaluate((source) => window.__paginateAndMeasure(source), PLACED_BOXES);
    const chapterAlone = await page.evaluate((source) => window.__paginateAndMeasure(source), FIRST_CHAPTER_ALONE);

    // #then: each box sits where it was declared, measured from the top-left of the
    // page's own area, on the sheet the chapter's own pages stop short of -- and
    // the one anchored to the foot of the page is twenty millimetres above that
    // foot, not merely somewhere below the box above it
    const origin = box(chapterAlone, "line-2");
    const declared = (key: string): Record<string, number> => ({
      x: round(box(measured, key).x - origin.x),
      y: round(box(measured, key).y - origin.y),
    });
    // The page area's foot, in the sheet's own coordinates. The book is margined
    // evenly, so the area ends one top margin short of the sheet, and the top
    // margin is what `origin.y` measured. Anchoring to the foot cannot be checked
    // against another absolutely positioned box: both would resolve against the
    // same containing block and would move together if that block were wrong.
    // Rounded to the whole pixel rather than the tenth the offsets above use: this
    // one is derived from three separate measurements, so it accumulates their
    // sub-pixel error. A wrapper that took the frame of reference away misses by
    // hundreds of pixels, not by one.
    const playbook = box(measured, "probe-playbook");
    const areaFoot = playbook.pageHeight - origin.y;
    const toWholePixel = (value: number): number => Math.round(value);
    expect({
      sheet: box(measured, "probe-strength").pageIndex,
      strength: declared("probe-strength"),
      wounds: declared("probe-wounds"),
      playbookAboveTheFoot: toWholePixel(areaFoot - (playbook.y + playbook.height)),
    }).toEqual({
      sheet: chapterAlone.pageCount,
      strength: { x: round(mm(20)), y: round(mm(40)) },
      wounds: { x: round(mm(50)), y: round(mm(100)) },
      playbookAboveTheFoot: toWholePixel(mm(20)),
    });
  });
});

// The same two chapters, once with a page between them and once each on its own. A
// chapter runs to more than one page, so "laid out identically" is a claim about
// where it broke as well as where its paragraphs sat.
const CARD = ["<Page>", "# Character sheet", "", "Name, look, and three moves.", "</Page>"];
const WITH_A_PAGE = ['<Book size="A5">', ...chapter(FIRST_CHAPTER), ...CARD, ...chapter(SECOND_CHAPTER), "</Book>"].join(
  "\n",
);

/** Line 3 is a chapter's first paragraph in a book that opens with it; each further
 * paragraph is two lines on (a paragraph, then the blank line ending it). */
const paragraphLines = (firstLine: number, count: number): number[] =>
  Array.from({ length: count }, (_, i) => firstLine + i * 2);

/** Each paragraph's position, with page indices counted from the chapter's own
 * first page rather than the book's, so a chapter that starts on page 3 of one book
 * and page 1 of another is still comparable. */
const chapterLayout = (measured: PageMeasurement, lines: readonly number[]): Record<string, number>[] => {
  const first = box(measured, `line-${lines[0]}`);
  return lines.map((line) => {
    const placed = box(measured, `line-${line}`);
    return { pagesIn: placed.pageIndex - first.pageIndex, x: round(placed.x), y: round(placed.y) };
  });
};

test.describe("a page does not reflow the chapters around it", () => {
  test("the chapters around a page break and sit exactly where they do without it", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    // #given: two chapters with a character sheet between them, and each chapter
    // written as a book of its own
    // #when: the real engine paginates all three books
    const withPage = await page.evaluate((source) => window.__paginateAndMeasure(source), WITH_A_PAGE);
    const firstAlone = await page.evaluate((source) => window.__paginateAndMeasure(source), FIRST_CHAPTER_ALONE);
    const secondAlone = await page.evaluate((source) => window.__paginateAndMeasure(source), SECOND_CHAPTER_ALONE);

    // #then: every paragraph of both chapters fell on the same page of its own
    // chapter, in the same place -- the page took a sheet to itself, handed the
    // chapter after it a fresh one, and changed nothing else
    expect({
      before: chapterLayout(withPage, paragraphLines(3, 6)),
      after: chapterLayout(withPage, paragraphLines(22, 6)),
    }).toEqual({
      before: chapterLayout(firstAlone, paragraphLines(3, 6)),
      after: chapterLayout(secondAlone, paragraphLines(3, 6)),
    });
  });
});

test.describe("a page keeps its address in the book", () => {
  test("the page counter runs through a page without a gap", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    // #given: prose, a page, and more prose
    // #when: the real engine paginates it and resolves each page's own counter
    const pages = await page.evaluate((source) => window.__paginateAndInspectHeaders(source), PROSE_PAGE_PROSE);

    // #then: the page is numbered like any other page, and the prose after it
    // carries on from there rather than starting over or skipping ahead
    expect(pages.map((p) => p.pageNumber)).toEqual(["1", "2", "3"]);
  });
});

// --- A page turned, while the book keeps its one size --------------------------

/** The same book with no page in it at all, which is what "the book's own sheet"
 * means: a size the engine reported for a book that declared nothing but its own,
 * rather than a number this file predicted from the size attribute it wrote. */
const proseOnly = (size: string): string =>
  [`<Book size="${size}">`, '<Section columns="1">', "Short prose, and no card at all.", "</Section>", "</Book>"].join(
    "\n",
  );

const sheetOf = (inspection: PageInspection, pageIndex: number): { width: number; height: number } => {
  const found = inspection.pageSizes[pageIndex];
  if (found === undefined) throw new Error(`the engine reported no page ${pageIndex}`);
  return { width: found.width, height: found.height };
};

/** The sheet the block written on `line` landed on -- read from the engine's own
 * page index for that block, so a claim about "the card's sheet" cannot drift onto
 * a neighbour's if the book ever paginates differently. */
const sheetForLine = (inspection: PageInspection, line: number): { width: number; height: number } => {
  const placed = inspection.positions[String(line)];
  if (placed === undefined || placed.pageIndex === null) throw new Error(`nothing was measured for line ${line}`);
  return sheetOf(inspection, placed.pageIndex);
};

const turned = (sheet: { width: number; height: number }): { width: number; height: number } => ({
  width: sheet.height,
  height: sheet.width,
});

test.describe("a page can be turned while the book keeps its one size", () => {
  test("a theme cannot replace the book's sheet for sections or pages", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    // #given: an A5 book using a theme that tries to bind it at A4, strongly
    // enough that source order alone cannot protect the book's declaration
    const conflictingThemeCss = `
      @page { size: A4 !important; }
      @page :first { size: A4 !important; }
    `;

    // #when: the real engine paginates one ordinary page and one turned page
    // under that theme, alongside the same book with no theme as the sheet oracle
    const ordinary = await page.evaluate(
      ({ source, css }) => window.__paginateAndInspect(source, css),
      { source: proseAroundACard("A5", "<Page>", "default-ru"), css: conflictingThemeCss },
    );
    const landscape = await page.evaluate(
      ({ source, css }) => window.__paginateAndInspect(source, css),
      { source: proseAroundACard("A5", '<Page orientation="landscape">', "default-ru"), css: conflictingThemeCss },
    );
    const bookAlone = await page.evaluate((source) => window.__paginateAndInspect(source), proseOnly("A5"));

    // #then: sections and an ordinary page use the Book sheet, while the
    // landscape page uses that same sheet turned, never the Theme's A4 sheet
    const sheet = sheetOf(bookAlone, 0);
    expect({
      ordinarySection: sheetForLine(ordinary, 3),
      ordinaryPage: sheetForLine(ordinary, 5),
      landscapeSection: sheetForLine(landscape, 3),
      landscapePage: sheetForLine(landscape, 5),
    }).toEqual({
      ordinarySection: sheet,
      ordinaryPage: sheet,
      landscapeSection: sheet,
      landscapePage: turned(sheet),
    });
  });

  test("a landscape page reports the book's own sheet turned, and the pages around it report it upright", async ({
    page,
  }) => {
    await page.goto("/tests/fixtures/harness.html");

    // #given: a card turned landscape between two runs of prose, and the same book
    // with no card in it, which is what the book's own sheet measures as
    // #when: the real engine paginates both
    const measured = await page.evaluate(
      (source) => window.__paginateAndInspect(source),
      proseAroundACard("A5", '<Page orientation="landscape">'),
    );
    const bookAlone = await page.evaluate((source) => window.__paginateAndInspect(source), proseOnly("A5"));

    // #then: the card's own sheet is the book's, turned; the prose on either side
    // of it is on the book's sheet as it was
    const sheet = sheetOf(bookAlone, 0);
    expect({
      before: sheetForLine(measured, 3),
      theCard: sheetForLine(measured, 5),
      after: sheetForLine(measured, 9),
    }).toEqual({ before: sheet, theCard: turned(sheet), after: sheet });
  });

  test("a book bound at a size it spelled out is turned, not resized", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    // #given: a book whose size is two lengths rather than a format's name -- the
    // shape an orientation keyword cannot be attached to, so the sheet has to be
    // turned by composing it
    // #when: the real engine paginates it, and the same book with no card
    const measured = await page.evaluate(
      (source) => window.__paginateAndInspect(source),
      proseAroundACard("90mm 160mm", '<Page orientation="landscape">'),
    );
    const bookAlone = await page.evaluate((source) => window.__paginateAndInspect(source), proseOnly("90mm 160mm"));

    // #then: the card is the same sheet on its side, not a sheet of some other size
    // the engine fell back to
    const sheet = sheetOf(bookAlone, 0);
    expect({
      before: sheetForLine(measured, 3),
      theCard: sheetForLine(measured, 5),
      after: sheetForLine(measured, 9),
    }).toEqual({ before: sheet, theCard: turned(sheet), after: sheet });
  });

  test("a page that declares no orientation is on the book's own sheet, like every other page", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    // #given: a card written exactly as it was before a page could be turned
    // #when: the real engine paginates it, and the same book with no card
    const measured = await page.evaluate((source) => window.__paginateAndInspect(source), PROSE_PAGE_PROSE);
    const bookAlone = await page.evaluate((source) => window.__paginateAndInspect(source), proseOnly("A5"));

    // #then: every page of the book, the card's included, is the sheet the book
    // declared -- the card was given no orientation of its own to be turned by
    const sheet = sheetOf(bookAlone, 0);
    expect({
      before: sheetForLine(measured, 3),
      theCard: sheetForLine(measured, 5),
      after: sheetForLine(measured, 9),
    }).toEqual({ before: sheet, theCard: sheet, after: sheet });
  });

  test("a book bound the wide way has its one upright page turned back", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    // #given: a book bound landscape -- lengths, so the sheet has to be composed --
    // with one page the author asked to stand upright
    // #when: the real engine paginates it, and the same book with no card
    const measured = await page.evaluate(
      (source) => window.__paginateAndInspect(source),
      proseAroundACard("160mm 90mm", '<Page orientation="portrait">'),
    );
    const bookAlone = await page.evaluate((source) => window.__paginateAndInspect(source), proseOnly("160mm 90mm"));

    // #then: the card stands up while the book stays lying down -- the other way
    // round from every case above, which is the only way to tell that the upright
    // arm composes a sheet at all rather than sharing the landscape one's
    const sheet = sheetOf(bookAlone, 0);
    expect({
      before: sheetForLine(measured, 3),
      theCard: sheetForLine(measured, 5),
      after: sheetForLine(measured, 9),
    }).toEqual({ before: sheet, theCard: turned(sheet), after: sheet });
  });
});

// --- A page between two headed chapters ----------------------------------------
// A chapter with a heading on either side, each long enough to run to more than one
// page, so "the pages before and after carry theirs" is a claim about several pages
// rather than about the one page that happens to touch the card. The card carries a
// heading of its own: a page with nothing to name would prove nothing, since a
// running header with no heading to show is empty anyway.
//  1 <Book size="A5">                18 <Page>
//  2 <Section columns="1">           19 # Character sheet
//  3 # The first chapter             20 (blank)
//  4 (blank)                         21 Name, look, and three moves.
//  5..16 six paragraphs and blanks   22 </Page>
// 17 </Section>                      23 <Section columns="1">
//                                    24 # The second chapter
//                                    25 (blank)
//                                    26..37 six paragraphs and blanks
//                                    38 </Section>   39 </Book>
const FIRST_HEADING = "The first chapter";
const SECOND_HEADING = "The second chapter";
const CARD_LINE = 18;
const HEADED_CHAPTERS_AROUND_A_CARD = [
  '<Book size="A5">',
  ...chapter([`# ${FIRST_HEADING}`, "", ...prose(1, 6)]),
  "<Page>",
  "# Character sheet",
  "",
  "Name, look, and three moves.",
  "</Page>",
  ...chapter([`# ${SECOND_HEADING}`, "", ...prose(20, 6)]),
  "</Book>",
].join("\n");

/** The sheet the card landed on, asked of the engine rather than predicted here:
 * which page a chapter of prose runs to is the engine's business, and this file only
 * needs to know which of the pages it produced is the author's page. */
const cardPageIndex = (measured: PageMeasurement): number => box(measured, `line-${CARD_LINE}`).pageIndex;

test.describe("a page carries no running header", () => {
  test("a theme cannot put a running header back on a page", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    const headers = await page.evaluate(
      ({ source, css }) => window.__paginateAndInspectHeaders(source, css),
      {
        source: proseAroundACard("A5", "<Page>", "default-ru"),
        css: '@page { @top-center { content: "Theme header" !important; } }',
      },
    );

    // The surrounding Section pages prove the injected Theme rule was active;
    // the Page between them still owns its absence of a running header.
    expect(headers.map((page) => page.header)).toEqual(["Theme header", undefined, "Theme header"]);
  });

  test("the pages around a page name the chapter the reader is in, and the page itself names nothing", async ({
    page,
  }) => {
    await page.goto("/tests/fixtures/harness.html");

    // #given: a character sheet between two headed chapters
    // #when: the real engine paginates it and resolves each page's margin boxes
    const headers = await page.evaluate(
      (source) => window.__paginateAndInspectHeaders(source),
      HEADED_CHAPTERS_AROUND_A_CARD,
    );
    const measured = await page.evaluate(
      (source) => window.__paginateAndMeasure(source),
      HEADED_CHAPTERS_AROUND_A_CARD,
    );

    // The claim is about neighbours on both sides, so the fixture has to have some.
    const card = cardPageIndex(measured);
    expect(card).toBeGreaterThan(0);
    expect(headers.length - card - 1).toBeGreaterThan(0);

    // #then: every page of the chapter before the card is headed with that chapter,
    // every page of the chapter after it with that one, and the card's own page
    // carries no running header at all -- not even the heading it opens with
    expect({
      before: headers.slice(0, card).map((p) => p.header),
      theCard: headers[card]!.header,
      after: headers.slice(card + 1).map((p) => p.header),
    }).toEqual({
      before: Array.from({ length: card }, () => FIRST_HEADING),
      theCard: undefined,
      after: Array.from({ length: headers.length - card - 1 }, () => SECOND_HEADING),
    });
  });

  test("the page still carries its number, and the numbering runs through it", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    // #given: the same character sheet between two headed chapters
    // #when: the real engine paginates it and resolves each page's own counter
    const headers = await page.evaluate(
      (source) => window.__paginateAndInspectHeaders(source),
      HEADED_CHAPTERS_AROUND_A_CARD,
    );

    // #then: every page prints its own position among the pages the engine produced,
    // the card's included -- an address the reader can be pointed at, and one the
    // page after the card carries on from rather than repeating or skipping
    expect(headers.map((p) => p.pageNumber)).toEqual(headers.map((_, index) => String(index + 1)));
  });
});
