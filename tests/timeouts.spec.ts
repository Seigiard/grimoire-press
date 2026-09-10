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

/** A book long enough that the engine is still laying it out several seconds in, so a
 * bound can be made to fire while a run is genuinely mid-layout rather than before it
 * has started. Set through the editor handle rather than typed: 1500 paragraphs is a
 * minute of keystrokes and none of them are what the test is about. */
const LONG_BOOK_MARKER = "Paragraph 0 of a book the engine is still laying out";
const LONG_SOURCE = [
  '<Book size="A5">',
  '<Section columns="1">',
  ...Array.from(
    { length: 1500 },
    (_, i) => `Paragraph ${i} of a book the engine is still laying out, with enough words in it to take real time.\n`,
  ),
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

/** The preview container's own attributes -- the oracle tests/pagination.spec.ts uses
 * for the sibling error path. `innerHTML` serializes descendants only and never sees
 * an attribute on the container itself, so the engine's own bookkeeping (which it
 * writes onto the container, not into it) is invisible to it. */
async function previewAttributes(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() =>
    [...document.getElementById("preview")!.attributes]
      .map((attribute) => `${attribute.name}=${attribute.value}`)
      .sort()
      .join("\n"),
  );
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
    const lastGoodAttributes = await previewAttributes(page);
    expect(lastGoodAttributes).toContain("data-vivliostyle-viewer-status=complete");

    // #when: the next repaint empties the preview and then goes unanswered for its
    // whole bound. The preview being genuinely blank at this point, and the container
    // itself genuinely describing the new run, is what makes the assertions below
    // about restoring rather than about nothing having happened.
    await page.evaluate(() => window.__stallEngine());
    await replaceSource(page, OTHER_GOOD_SOURCE);
    await expect.poll(() => withheldRuns(page)).toBe(1);
    expect(await page.locator("#preview").textContent()).not.toContain("A good paragraph appears here.");
    expect(await previewAttributes(page)).toContain("data-vivliostyle-viewer-status=loading");

    await page.evaluate(() => window.__advanceEngineClock(30_000));
    await expect(page.locator("#status")).toBeVisible();

    // #then: the preview holds exactly the book it held on the way in -- its markup,
    // and the container's own attributes, the same all-or-nothing ADR-0005 records
    // for a failed run
    expect(await page.locator("#preview").innerHTML()).toBe(lastGood);
    expect(await previewAttributes(page)).toBe(lastGoodAttributes);
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
    // CoreViewer's own event target calls its listeners inline, and the handler that
    // would put the stale book back writes to the container inline too, so by the
    // time this call has returned the damage is either done or it is not. There is
    // nothing to wait for, and a wait would only be waiting on nothing.
    expect(await page.evaluate(() => window.__failOldestStalledEngineRun())).toBe(true);

    // #then: the preview is still the newest book, not the one the abandoned run
    // was holding on to, and nothing is reported about a book that is no longer
    // on screen
    const preview = await page.locator("#preview").textContent();
    expect(preview).toContain("A third paragraph appears here.");
    expect(preview).not.toContain("A good paragraph appears here.");
    await expect(page.locator("#status")).toBeHidden();
  });
});

/**
 * What an abandoned run actually goes on to do, pinned rather than assumed. The bound
 * is deliberately generous, which means it is meant to fire on books that are still
 * laying out, so this case is reachable by construction rather than exotic. Half of
 * the outcome is good and half is not, and the not-good half is issue #15: nothing in
 * this application can call the engine off, and `removeListener` only detaches the
 * adapter's handlers from the viewer's event target -- the object writing to the
 * container is the viewer's internal one, and nothing detaches that. A staging
 * container is what closes it, and that is a decision with its own cost (ADR-0005).
 */
test.describe("a repaint abandoned while the engine was mid-layout", () => {
  test("keeps its pages out of the preview, but goes on stamping the container itself (issue #15)", async ({ page }) => {
    test.setTimeout(90_000);

    // #given: a book on screen, and a much longer one the engine is part-way through
    await firstPaint(page);
    await page.evaluate((source) => window.__editor!.setSource(source), GOOD_SOURCE);
    await expect.poll(() => page.locator("#preview").textContent()).toContain("A good paragraph appears here.");

    await page.evaluate((source) => window.__editor!.setSource(source), LONG_SOURCE);
    await expect
      .poll(() => page.evaluate(() => document.querySelectorAll("#preview [data-vivliostyle-page-index]").length), {
        timeout: 30_000,
      })
      .toBeGreaterThan(5);
    // Pages of the new book are on screen and the call has still not settled: this run
    // is genuinely mid-layout, not merely started.
    expect(await page.evaluate(() => window.__pendingEngineDeadlines())).toBe(1);

    // #when: the bound fires there. The engine's own stamp is taken off the container
    // in the same task, so that its coming back can only be the abandoned run writing.
    await page.evaluate(() => {
      window.__advanceEngineClock(30_000);
      document.getElementById("preview")!.removeAttribute("data-vivliostyle-viewer-status");
    });
    await expect(page.locator("#status")).toBeVisible();

    // #then: the run does come back and write to the live container -- this is the
    // defect, recorded rather than claimed away
    await expect
      .poll(() => page.evaluate(() => document.getElementById("preview")!.getAttribute("data-vivliostyle-viewer-status")), {
        timeout: 30_000,
      })
      .not.toBeNull();

    // #then: and its pages never arrive, because the restore took the engine's own
    // viewport subtree out of the document with the rest of the children, and a
    // detached element has no geometry to lay out against (ADR-0005) -- the run halts
    // where it stands, writing into a subtree nobody can see
    const preview = await page.locator("#preview").textContent();
    expect(preview).toContain("A good paragraph appears here.");
    expect(preview).not.toContain(LONG_BOOK_MARKER);
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

  test("does not open a dialogue over the author when the engine answers for it later", async ({ page }) => {
    // #given: a print given up on, with no dialogue opened for it
    await firstPaint(page);
    await page.evaluate(() => window.__stallEngine());
    await page.locator("#print").click();
    await expect.poll(() => withheldRuns(page)).toBe(1);
    await page.evaluate(() => window.__advanceEngineClock(60_000));
    await expect.poll(() => page.locator("#status").textContent()).toContain("Printing failed");
    expect(await page.evaluate(() => window.__printDialoguesOpened())).toBe(0);

    // #when: the abandoned attempt's engine lays the whole book out after all and
    // calls back to have it printed -- a real success, arriving for a print the
    // author gave up on a minute ago
    expect(await page.evaluate(() => window.__resumeOldestStalledEngineRun())).toBe(true);
    // `printHTML` removes an attempt's iframe once that attempt has run to the end,
    // so the count dropping is the abandoned attempt reporting that its whole success
    // path -- the print callback included -- has now run.
    await expect.poll(() => page.evaluate(() => window.__printAttemptsStarted()), { timeout: 30_000 }).toBe(0);

    // #then: the browser's own modal was not opened over whatever the author has
    // moved on to. Settling twice is a harmless no-op; opening a dialogue is not,
    // and it happens on the line before the resolve.
    expect(await page.evaluate(() => window.__printDialoguesOpened())).toBe(0);
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
    // Both steps land inline: CoreViewer dispatches to its listeners synchronously,
    // and `printHTML` appends an attempt's iframe in its own constructor, so a click
    // that started a print of its own has already done so by the time it returns.
    expect(await page.evaluate(() => window.__failOldestStalledEngineRun())).toBe(true);
    await page.locator("#print").click();

    // #then: that click joined the print still in flight rather than starting a
    // third one alongside it -- the dead attempt did not hand the guard away on its
    // way out. Vivliostyle keeps a single global print instance, so two live
    // attempts would repoint it out from under each other.
    expect(await page.evaluate(() => window.__printAttemptsStarted())).toBe(2);
  });
});
