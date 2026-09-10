import { expect, test } from "@playwright/test";

const HARNESS = "/tests/fixtures/timeout-harness.html";

const GOOD_SOURCE = ['<Book size="A5">', '<Section columns="1">', "A good paragraph appears here.", "</Section>", "</Book>"].join(
  "\n",
);

const OTHER_GOOD_SOURCE = [
  '<Book size="A5">',
  '<Section columns="1">',
  "A second paragraph appears here.",
  "</Section>",
  "</Book>",
].join("\n");

const THIRD_GOOD_SOURCE = [
  '<Book size="A5">',
  '<Section columns="1">',
  "A third paragraph appears here.",
  "</Section>",
  "</Book>",
].join("\n");

async function replaceSource(page: import("@playwright/test").Page, source: string): Promise<void> {
  await page.locator(".cm-editor").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(source);
}

/** The author's first book has painted, so anything that follows is a fresh run
 * rather than something coalesced into the session's opening repaint. */
async function firstPaint(page: import("@playwright/test").Page): Promise<void> {
  await page.goto(HARNESS);
  await expect.poll(() => page.locator("#preview").textContent()).toContain("Start writing your book here.");
}

/** A run the engine has been handed and is sitting on. Waiting for it is what makes
 * "the engine is not answering" a fact rather than a hope about timing. */
async function withheldRuns(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => window.__stalledEngineRuns());
}

/**
 * Issue #10: the two calls this application makes into the pagination engine had no
 * time bound, and each guards a resource released only when that call settles. An
 * engine that stalled once therefore stalled for the rest of the session -- the
 * preview froze on its last render while the editor kept taking edits, and every
 * later click on print handed back the same stuck promise.
 *
 * The consumer is the author sitting in front of that editor, so every oracle below
 * is the real DOM the harness's real `startApp` wiring produces: `#preview`'s own
 * content and `#status`'s own text and visibility. Real CodeMirror, real
 * Vivliostyle, real pagination and printing adapters -- what the harness substitutes
 * is not an adapter but the engine's own silence (see the harness for why that has
 * to be forced at `loadDocument` rather than through a document), and the clock the
 * two bounds are measured on, which holds back timers of 30 seconds or more and lets
 * every other timer in the page run for real.
 */
test.describe("a repaint the engine never answers", () => {
  test("is given up on after 30 seconds, and not a moment before", async ({ page }) => {
    // #given: a book the real engine has laid out, and an engine that will not
    // answer about the next one
    await firstPaint(page);
    await replaceSource(page, GOOD_SOURCE);
    await expect.poll(() => page.locator("#preview").textContent()).toContain("A good paragraph appears here.");
    await page.evaluate(() => window.__stallEngine());

    // #when: the author writes on, and the repaint that follows goes unanswered
    await replaceSource(page, OTHER_GOOD_SOURCE);
    await expect.poll(() => withheldRuns(page)).toBe(1);

    // #then: nothing is said for the whole of the bound -- a book that simply takes
    // a while to lay out must not be cut off
    await page.evaluate(() => window.__advanceEngineClock(29_000));
    await expect(page.locator("#status")).toBeHidden();

    // #then: and the second the bound elapses, the author is told, in words that
    // name an engine that did not answer rather than a book it could not lay out
    await page.evaluate(() => window.__advanceEngineClock(1_000));
    await expect(page.locator("#status")).toBeVisible();
    const status = await page.locator("#status").textContent();
    expect(status).toContain("the pagination engine did not answer within 30 seconds");
    expect(status).not.toContain("could not lay out the book");
  });

  test("leaves the last book that did paginate on screen (issue #11's guarantee, through the timeout)", async ({ page }) => {
    // #given: a book the real engine has laid out into the preview
    await firstPaint(page);
    await replaceSource(page, GOOD_SOURCE);
    await expect.poll(() => page.locator("#preview").textContent()).toContain("A good paragraph appears here.");
    const lastGood = await page.locator("#preview").innerHTML();

    // #when: the next repaint empties the preview and then goes unanswered for its
    // whole bound. The preview being genuinely blank at this point is what makes the
    // assertion below about restoring rather than about never having emptied.
    await page.evaluate(() => window.__stallEngine());
    await replaceSource(page, OTHER_GOOD_SOURCE);
    await expect.poll(() => withheldRuns(page)).toBe(1);
    expect(await page.locator("#preview").textContent()).not.toContain("A good paragraph appears here.");

    await page.evaluate(() => window.__advanceEngineClock(30_000));
    await expect(page.locator("#status")).toBeVisible();

    // #then: the preview holds exactly the book it held on the way in -- markup and
    // attributes both, the same all-or-nothing ADR-0005 records for a failed run
    expect(await page.locator("#preview").innerHTML()).toBe(lastGood);
  });

  test("does not wedge the repaint queue: the next edit paints", async ({ page }) => {
    // #given: a repaint that has been given up on
    await firstPaint(page);
    await page.evaluate(() => window.__stallEngine());
    await replaceSource(page, GOOD_SOURCE);
    await expect.poll(() => withheldRuns(page)).toBe(1);
    await page.evaluate(() => window.__advanceEngineClock(30_000));
    await expect(page.locator("#status")).toBeVisible();

    // #when: the engine recovers and the author keeps writing
    await page.evaluate(() => window.__unstallEngine());
    await replaceSource(page, OTHER_GOOD_SOURCE);

    // #then: that edit actually reaches the preview -- the coalescing queue was
    // released when the abandoned repaint settled, rather than holding the newer
    // source forever without ever draining
    await expect.poll(() => page.locator("#preview").textContent()).toContain("A second paragraph appears here.");
  });

  test("cannot put its stale book back when the engine answers for it later", async ({ page }) => {
    // #given: a repaint given up on, which restored the book before it
    await firstPaint(page);
    await replaceSource(page, GOOD_SOURCE);
    await expect.poll(() => page.locator("#preview").textContent()).toContain("A good paragraph appears here.");
    await page.evaluate(() => window.__stallEngine());
    await replaceSource(page, OTHER_GOOD_SOURCE);
    await expect.poll(() => withheldRuns(page)).toBe(1);
    await page.evaluate(() => window.__advanceEngineClock(30_000));
    await expect(page.locator("#status")).toBeVisible();

    // #given: and a newer book the author has since written, painted for real
    await page.evaluate(() => window.__unstallEngine());
    await replaceSource(page, THIRD_GOOD_SOURCE);
    await expect.poll(() => page.locator("#preview").textContent()).toContain("A third paragraph appears here.");
    await expect(page.locator("#status")).toBeHidden();

    // #when: the engine finally answers about the abandoned run -- the work could
    // not be called off, so this is the real event arriving for a book nobody is
    // waiting for any more
    expect(await page.evaluate(() => window.__failOldestStalledEngineRun())).toBe(true);
    await page.waitForTimeout(300);

    // #then: the preview is still the newest book, not the one the abandoned run
    // was holding on to, and nothing is reported about a book that is no longer
    // on screen
    const preview = await page.locator("#preview").textContent();
    expect(preview).toContain("A third paragraph appears here.");
    expect(preview).not.toContain("A good paragraph appears here.");
    await expect(page.locator("#status")).toBeHidden();
  });
});

test.describe("a repaint the engine does answer", () => {
  test("leaves no deadline behind once it has painted", async ({ page }) => {
    // #given: a repaint under way, with its bound running
    await firstPaint(page);
    await page.evaluate(() => window.__stallEngine());
    await replaceSource(page, GOOD_SOURCE);
    await expect.poll(() => withheldRuns(page)).toBe(1);
    expect(await page.evaluate(() => window.__pendingEngineDeadlines())).toBeGreaterThan(0);

    // #when: the engine is handed that very run and lays it out for real
    expect(await page.evaluate(() => window.__resumeOldestStalledEngineRun())).toBe(true);
    await expect.poll(() => page.locator("#preview").textContent()).toContain("A good paragraph appears here.");

    // #then: the bound is not left ticking towards a rejection half a minute into a
    // session that already got its book
    expect(await page.evaluate(() => window.__pendingEngineDeadlines())).toBe(0);
  });
});

test.describe("a print the engine never answers", () => {
  test("is given up on after 60 seconds, in printing's own words", async ({ page }) => {
    // #given: the author asks for a print the engine will not answer about
    await firstPaint(page);
    await page.evaluate(() => window.__stallEngine());
    await page.locator("#print").click();
    await expect.poll(() => withheldRuns(page)).toBe(1);

    // #then: printing is given longer than a repaint -- it lays the whole book out
    // again, and the author is deliberately standing by for it
    await page.evaluate(() => window.__advanceEngineClock(59_000));
    await expect(page.locator("#status")).toBeHidden();

    await page.evaluate(() => window.__advanceEngineClock(1_000));
    await expect(page.locator("#status")).toBeVisible();
    const status = await page.locator("#status").textContent();
    expect(status).toContain("Printing failed");
    expect(status).toContain("the print engine did not answer within 60 seconds");
    // The preview's own wording for the same union case, never borrowed here
    expect(status).not.toContain("the pagination engine");
  });

  test("releases the single-flight guard, so the next click prints", async ({ page }) => {
    // #given: a print that has been given up on
    await firstPaint(page);
    await page.evaluate(() => window.__stallEngine());
    await page.locator("#print").click();
    await expect.poll(() => withheldRuns(page)).toBe(1);
    await page.evaluate(() => window.__advanceEngineClock(60_000));
    await expect.poll(() => page.locator("#status").textContent()).toContain("Printing failed");

    // #when: the engine recovers and the author clicks print again
    await page.evaluate(() => window.__unstallEngine());
    await page.locator("#print").click();

    // #then: that click started a print of its own and it succeeded, rather than
    // handing back the stuck attempt the guard was still holding
    await expect(page.locator("#status")).toBeHidden();
  });

  test("cannot take the guard from the print that replaced it when the engine answers later", async ({ page }) => {
    // #given: a print given up on, and a second one the author started in its place
    // and which is still waiting on the engine
    await firstPaint(page);
    await page.evaluate(() => window.__stallEngine());
    await page.locator("#print").click();
    await expect.poll(() => withheldRuns(page)).toBe(1);
    await page.evaluate(() => window.__advanceEngineClock(60_000));
    await expect.poll(() => page.locator("#status").textContent()).toContain("Printing failed");

    await page.locator("#print").click();
    await expect.poll(() => withheldRuns(page)).toBe(2);
    expect(await page.evaluate(() => window.__printAttemptsStarted())).toBe(2);

    // #when: the abandoned print's engine finally answers, for an attempt nobody is
    // waiting for, and the author clicks print once more
    expect(await page.evaluate(() => window.__failOldestStalledEngineRun())).toBe(true);
    await page.waitForTimeout(300);
    await page.locator("#print").click();
    await page.waitForTimeout(300);

    // #then: that click joined the print still in flight rather than starting a
    // third one alongside it -- the dead attempt did not hand the guard away on its
    // way out. Vivliostyle keeps a single global print instance, so two live
    // attempts would repoint it out from under each other.
    expect(await page.evaluate(() => window.__printAttemptsStarted())).toBe(2);
  });
});
