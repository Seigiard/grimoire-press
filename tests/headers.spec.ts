import { expect, test } from "@playwright/test";

// A repeated sentence, long enough that a handful of these paragraphs push a
// heading's own page onto more than one physical page before the next heading
// arrives -- real overflow spanning pages, not a book short enough that both
// headings could coincidentally land on the very same page.
const bigParagraph = (n: number) =>
  `Paragraph ${n}. ` +
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ".repeat(
    3,
  );

const TWO_HEADINGS_BOOK = [
  '<Book size="A5">',
  '<Section columns="1">',
  "# First Section",
  "",
  ...Array.from({ length: 10 }, (_, i) => [bigParagraph(i + 1), ""]).flat(),
  "# Second Section",
  "",
  ...Array.from({ length: 10 }, (_, i) => [bigParagraph(i + 11), ""]).flat(),
  "</Section>",
  "</Book>",
].join("\n");

/**
 * Consumer: a reader who opens the printed or previewed book partway through
 * and relies on the running header to tell which part of the book they are
 * in, and on the page number to refer someone else to a specific page.
 *
 * The oracle is the real Vivliostyle pagination engine's own resolved output
 * -- the actual text it placed in each page's margin box, and its own
 * independently assigned page index -- never a comparison against
 * render-book.ts's own CSS text. That output is compared against the two
 * distinct heading strings this test itself authored as book source (an
 * author-facing input the patch does not compute) and against Vivliostyle's
 * own page ordering, both independent of the files this patch touches.
 */
test.describe("running headers and page numbers", () => {
  test("a page's running header carries the heading that precedes it, and changes once a later heading appears", async ({
    page,
  }) => {
    await page.goto("/tests/fixtures/harness.html");

    const pages = await page.evaluate((source) => window.__paginateAndInspectHeaders(source), TWO_HEADINGS_BOOK);

    // More than one page under each heading is what proves this follows real
    // pagination rather than merely mirroring markup structure -- the first
    // and second pages both fall under "First Section" before the heading
    // changes.
    expect(pages.length).toBeGreaterThan(3);
    expect(pages[0]!.header).toBe("First Section");
    expect(pages[1]!.header).toBe("First Section");
    expect(pages[pages.length - 1]!.header).toBe("Second Section");
  });

  test("each page's printed page number matches its real position among the pages Vivliostyle produced", async ({
    page,
  }) => {
    await page.goto("/tests/fixtures/harness.html");

    const pages = await page.evaluate((source) => window.__paginateAndInspectHeaders(source), TWO_HEADINGS_BOOK);

    for (const p of pages) {
      expect(p.pageNumber).toBe(String(p.pageIndex + 1));
    }
  });
});
