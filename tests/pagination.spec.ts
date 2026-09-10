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

const paragraph = (n: number) => `Paragraph ${n} with a little more text so it takes up real vertical space in its column.`;

const twoColumnSource = (columns: number) =>
  [`<Book size="A5">`, `<Section columns="${columns}">`, paragraph(1), "", paragraph(2), "", paragraph(3), "", paragraph(4), "</Section>", "</Book>"].join(
    "\n",
  );

const noPageBreak = ["# A cheat sheet", "", "One short paragraph of prose.", "", "Another short paragraph of prose."].join("\n");
const withPageBreak = ["# A cheat sheet", "", "One short paragraph of prose.", "", "<PageBreak />", "", "Another short paragraph of prose."].join("\n");

// Four paragraphs (rather than two) so that, left to natural column balancing,
// paragraph 2 shares column 1 with paragraph 1 -- only a forced break moves it on.
const columnBreakSource = (withBreak: boolean) =>
  [
    '<Book size="A5">',
    '<Section columns="2">',
    paragraph(1),
    "",
    ...(withBreak ? ["<ColumnBreak />", ""] : []),
    paragraph(2),
    "",
    paragraph(3),
    "",
    paragraph(4),
    "</Section>",
    "</Book>",
  ].join("\n");

/**
 * Issue #3's markup: page size, columns, and forced breaks. Each test paginates OUR
 * book through the real Vivliostyle engine and asserts an observable property of the
 * result -- a page's real rendered size, a rendered element's real on-page x
 * position -- never Vivliostyle's own pagination correctness, and never a comparison
 * against an expected markup string.
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

    const { positions } = await page.evaluate((source) => window.__paginateAndInspect(source), twoColumnSource(2));

    const distinctColumnXPositions = new Set(Object.values(positions).map((p) => p.x));
    expect(distinctColumnXPositions.size).toBe(2);
  });

  test("a three-column section lays its text out in three columns", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    const { positions } = await page.evaluate((source) => window.__paginateAndInspect(source), twoColumnSource(3));

    const distinctColumnXPositions = new Set(Object.values(positions).map((p) => p.x));
    expect(distinctColumnXPositions.size).toBe(3);
  });

  test("a forced page break ends the current page and starts the next", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    const without = await page.evaluate((source) => window.__paginateBook(source), noPageBreak);
    const withBreak = await page.evaluate((source) => window.__paginateBook(source), withPageBreak);

    expect(withBreak).toBeGreaterThan(without);
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
    expect(forcedX).toBeGreaterThan(naturalX);
  });
});
