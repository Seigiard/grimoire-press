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
