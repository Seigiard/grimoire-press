import { expect, test } from "@playwright/test";

const SHORT_PROSE = "# A cheat sheet\n\nOne short paragraph of prose fits easily on a single page.\n";

const PARAGRAPH =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor " +
  "incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud " +
  "exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.\n\n";

const LONG_PROSE =
  "# A cheat sheet\n\n" +
  Array.from({ length: 30 }, (_, i) => `## Section ${i + 1}\n\n${PARAGRAPH.repeat(3)}`).join("");

/**
 * The one test seam: a book's source in, paginated through the real Vivliostyle
 * engine in a real browser, page count out. This asserts properties of OUR book
 * (short prose stays on one page, more prose spans more pages) rather than
 * Vivliostyle's own pagination correctness, which has no valid local oracle.
 */
test.describe("pagination", () => {
  test("a short book fits on a single page", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    const pageCount = await page.evaluate((source) => window.__paginateBook(source), SHORT_PROSE);

    expect(pageCount).toBe(1);
  });

  test("a longer book paginates across more pages than a short one", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    const shortCount = await page.evaluate((source) => window.__paginateBook(source), SHORT_PROSE);
    const longCount = await page.evaluate((source) => window.__paginateBook(source), LONG_PROSE);

    expect(longCount).toBeGreaterThan(shortCount);
  });
});

const shortSection = (size: string) =>
  [`<Book size="${size}">`, '<Section columns="1">', "Some prose.", "</Section>", "</Book>"].join("\n");

// A repeated sentence, long enough that a handful of these paragraphs overflow one
// column's height and spill into the next -- real overflow forcing the spread
// across columns, not a height-balancing heuristic that the engine could apply
// differently depending on font metrics.
const bigParagraph = (n: number) =>
  `Paragraph ${n}. ` +
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ".repeat(
    2,
  );

const overflowSource = (columns: number, count: number) =>
  [
    '<Book size="A5">',
    `<Section columns="${columns}">`,
    ...Array.from({ length: count }, (_, i) => [bigParagraph(i + 1), ""]).flat(),
    "</Section>",
    "</Book>",
  ].join("\n");

const paragraph = (n: number) => `Paragraph ${n} with a little more text so it takes up real vertical space in its column.`;

// Two short paragraphs -- render-book.ts sets `column-fill: auto` on every section,
// so as long as both paragraphs together fit under one column's height (which two
// short paragraphs comfortably do), the *first* column fills before the *second* one
// gets anything: a normatively specified fill order, not the "balance" heuristic
// that would otherwise spread even a small amount of content across both columns to
// even out their height, and could do so differently across machines.
const columnBreakSource = (withBreak: boolean) =>
  ['<Book size="A5">', '<Section columns="2">', paragraph(1), "", ...(withBreak ? ["<ColumnBreak />", ""] : []), paragraph(2), "</Section>", "</Book>"].join(
    "\n",
  );

const pageBreakSource = [
  "# A cheat sheet",
  "",
  "One short paragraph of prose.",
  "",
  "<PageBreak />",
  "",
  "Another short paragraph of prose.",
].join("\n");

/**
 * Issue #3's markup: page size, columns, and forced breaks. Each test paginates OUR
 * book through the real Vivliostyle engine and asserts an observable property of the
 * result -- a page's real rendered size, a rendered element's real on-page x
 * position, which page index an element landed on -- never Vivliostyle's own
 * pagination correctness, and never a comparison against an expected markup string.
 */
test.describe("book markup", () => {
  test("a book's declared page size sizes the printed page", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    const a5 = await page.evaluate((source) => window.__paginateAndInspect(source), shortSection("A5"));
    const a4 = await page.evaluate((source) => window.__paginateAndInspect(source), shortSection("A4"));

    expect(a4.pageSizes[0]!.height).toBeGreaterThan(a5.pageSizes[0]!.height);
  });

  test("a two-column section lays its text out in two columns", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    const { positions } = await page.evaluate((source) => window.__paginateAndInspect(source), overflowSource(2, 6));

    const distinctColumnXPositions = new Set(
      Object.values(positions)
        .map((p) => p.x)
        .filter((x) => x !== undefined),
    );
    expect(distinctColumnXPositions.size).toBe(2);
  });

  test("a three-column section lays its text out in three columns", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    const { positions } = await page.evaluate((source) => window.__paginateAndInspect(source), overflowSource(3, 7));

    const distinctColumnXPositions = new Set(
      Object.values(positions)
        .map((p) => p.x)
        .filter((x) => x !== undefined),
    );
    expect(distinctColumnXPositions.size).toBe(3);
  });

  test("a forced page break ends the current page and starts the next", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    const { positions } = await page.evaluate((source) => window.__paginateAndInspect(source), pageBreakSource);

    // Line 3 is the paragraph immediately before the break, line 7 the one
    // immediately after it -- proof the break landed exactly between them, not
    // just that a break happened somewhere in the document.
    expect(positions["7"]!.pageIndex!).toBeGreaterThan(positions["3"]!.pageIndex!);
  });

  test("a forced column break ends the current column and starts the next", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    const without = await page.evaluate((source) => window.__paginateAndInspect(source), columnBreakSource(false));
    const withBreak = await page.evaluate((source) => window.__paginateAndInspect(source), columnBreakSource(true));

    // Line 5 (paragraph 2) sits in the same column as paragraph 1 when nothing
    // forces it onward, and in the next column over once a break is forced between
    // them -- proof the break moved it, not just that two columns exist.
    const naturalX = without.positions["5"]!.x;
    const forcedX = withBreak.positions["7"]!.x;
    expect(forcedX!).toBeGreaterThan(naturalX!);
  });
});
