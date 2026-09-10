import { expect, test } from "@playwright/test";

const HARNESS = "/tests/fixtures/persistence-harness.html";

const GOOD_SOURCE = ['<Book size="A5">', '<Section columns="1">', "A good paragraph appears here.", "</Section>", "</Book>"].join(
  "\n",
);

// Line 3 is the inner, nested <Section> tag. This scenario -- rather than an
// unclosed tag -- is deliberately chosen because parse-book.ts's own thrown message
// for it ("<Section> cannot be nested inside another <Section>") carries no line
// number of its own, so the status text's line number can only have come from the
// application actually attaching one, not from a message that already happened to
// mention it. The expected line comes from counting this literal fixture's own
// lines -- the same technique tests/unit/parse-book.spec.ts already uses.
const BROKEN_SOURCE = [
  '<Book size="A5">',
  '<Section columns="1">',
  '<Section columns="1">',
  "A good paragraph appears here.",
  "</Section>",
  "</Section>",
  "</Book>",
].join("\n");

// Line 4 is the misspelled tag itself.
const UNKNOWN_TAG_SOURCE = [
  '<Book size="A5">',
  '<Section columns="1">',
  "Some prose.",
  "<PageBrek />",
  "</Section>",
  "</Book>",
].join("\n");

async function replaceSource(page: import("@playwright/test").Page, source: string): Promise<void> {
  await page.locator(".cm-editor").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(source);
}

/**
 * The consumer throughout this file is the author typing into the left pane. Every
 * oracle below is the real DOM the harness's real `startApp` wiring -- real
 * CodeMirror, real Vivliostyle -- produces: `#preview`'s own rendered text,
 * `#status`'s own text and visibility, and (for the burst test) the native
 * `Element.prototype.replaceChildren` that `paginate()` calls once per attempted
 * repaint, patched from the test the same way the existing persistence suite
 * patches `Storage.prototype.setItem`.
 */
test.describe("preview refresh and error surface", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("broken markup leaves the last good preview on screen and names the line", async ({ page }) => {
    // #given: a book that parses and paginates
    await replaceSource(page, GOOD_SOURCE);
    await expect.poll(() => page.locator("#preview").textContent()).toContain("A good paragraph appears here.");
    const goodPreview = await page.locator("#preview").textContent();

    // #when: the author breaks it (a <Section> nested inside another <Section>)
    await replaceSource(page, BROKEN_SOURCE);
    await expect(page.locator("#status")).toBeVisible();
    await expect.poll(() => page.locator("#status").textContent()).toContain("line 3");

    // #then: the preview still shows exactly what it showed before the break
    expect(await page.locator("#preview").textContent()).toBe(goodPreview);
  });

  test("an unrecognized tag is reported by name rather than silently ignored", async ({ page }) => {
    await replaceSource(page, UNKNOWN_TAG_SOURCE);

    await expect(page.locator("#status")).toBeVisible();
    await expect.poll(() => page.locator("#status").textContent()).toContain("PageBrek");
    expect(await page.locator("#status").textContent()).toContain("line 4");
  });

  test("turning auto-refresh off stops automatic repaints; the refresh control repaints on demand", async ({ page }) => {
    // #given: the initial book has painted
    await expect.poll(() => page.locator("#preview").textContent()).toContain("Start writing your book here.");

    // #when: auto-refresh is turned off and the author writes something new
    await page.locator("#auto-refresh").uncheck();
    await replaceSource(page, GOOD_SOURCE);

    // #then: waiting well past the debounce window, the preview has not moved
    await page.waitForTimeout(1000);
    expect(await page.locator("#preview").textContent()).not.toContain("A good paragraph appears here.");

    // #when: the author asks for a refresh explicitly
    await page.locator("#refresh").click();

    // #then: the preview now reflects the current source
    await expect.poll(() => page.locator("#preview").textContent()).toContain("A good paragraph appears here.");
  });

  test("unchecking auto-refresh mid-debounce cancels the pending repaint too", async ({ page }) => {
    // #given: the author types with auto-refresh still on, so a repaint is
    // debounced and waiting
    await expect.poll(() => page.locator("#preview").textContent()).toContain("Start writing your book here.");
    await replaceSource(page, GOOD_SOURCE);

    // #when: auto-refresh is switched off before the debounce has elapsed
    await page.locator("#auto-refresh").uncheck();

    // #then: waiting well past the debounce window, the pending repaint never
    // fires -- switching off a moment before the timer would have landed does
    // not still let it through
    await page.waitForTimeout(600);
    expect(await page.locator("#preview").textContent()).not.toContain("A good paragraph appears here.");
  });

  test("re-enabling auto-refresh repaints immediately, without waiting for another keystroke", async ({ page }) => {
    // #given: auto-refresh is off and the author has written something new that
    // has not reached the preview yet
    await expect.poll(() => page.locator("#preview").textContent()).toContain("Start writing your book here.");
    await page.locator("#auto-refresh").uncheck();
    await replaceSource(page, GOOD_SOURCE);
    await page.waitForTimeout(600);
    expect(await page.locator("#preview").textContent()).not.toContain("A good paragraph appears here.");

    // #when: the author re-enables auto-refresh, without typing anything else
    await page.locator("#auto-refresh").check();

    // #then: the preview catches up on its own
    await expect.poll(() => page.locator("#preview").textContent()).toContain("A good paragraph appears here.");
  });

  test("a burst of typing costs far fewer repaints than it has keystrokes", async ({ page }) => {
    // #given: a counter on the native DOM method pagination.ts calls once per
    // attempted repaint, counted independently of anything our own code tracks.
    await page.evaluate(() => {
      const native = Element.prototype.replaceChildren;
      const preview = document.getElementById("preview")!;
      window.__repaintCount = 0;
      Element.prototype.replaceChildren = function (...args: (string | Node)[]) {
        if (this === preview) window.__repaintCount += 1;
        return native.apply(this, args);
      };
    });

    // #when: the author types a run of characters with no pause between them
    const burst = "A burst of characters typed with no pause between them at all.";
    await page.locator(".cm-editor").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(burst, { delay: 0 });

    await expect.poll(() => page.locator("#preview").textContent()).toContain(burst);

    // #then: far fewer repaints happened than keystrokes were typed
    const repaints = await page.evaluate(() => window.__repaintCount);
    expect(repaints).toBeLessThan(burst.length / 4);
  });
});

/**
 * Issue #6's first handed-over defect: a slow repaint finishing after a faster,
 * newer one used to clobber the container back to stale content. The consumer is
 * an author who keeps writing (or clicks refresh again) while a repaint is still
 * running; the observable failure is the container ending up showing the older
 * request instead of the newest one made. Real Vivliostyle timing turned out not
 * to be a reliable oracle for this -- a real "slow" document large enough to
 * outlast the gap between two rapid actions on a fast machine could still finish
 * before the second request landed, or vice versa, on every machine this suite
 * runs on. Substituting the pagination adapter with a version whose delay is
 * fixed instead of measured -- at the exact seam issue #1's architecture built for
 * this -- makes the race deterministic while every other real behaviour
 * (`startApp`'s own run/pending queue, `renderBook`, real DOM writes) is untouched.
 */
test.describe("preview coalescing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tests/fixtures/coalesce-harness.html");
  });

  test("a slow repaint in flight never lets it clobber a faster, newer one", async ({ page }) => {
    // #given: initial paint settled, so the click below starts a fresh run
    // rather than getting coalesced into the startup one.
    await expect.poll(() => page.locator("#preview").textContent()).toContain("Start writing your book here.");

    // #when: a slow-to-resolve repaint is requested, then -- before it can
    // possibly have finished -- a fast one is requested too. Each edit
    // re-focuses the editor first: clicking #refresh moves focus onto the
    // button, and a select-all sent to the wrong element would silently select
    // nothing in the editor at all.
    await page.locator(".cm-editor").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("# SLOW MARKER\n\nContent from the slow request.\n");
    await page.locator("#refresh").click();

    await page.locator(".cm-editor").click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("# FAST MARKER\n\nContent from the fast request.\n");
    await page.locator("#refresh").click();

    // #then: once things settle, the container shows the newer, faster request
    // -- never the slow one finishing late and overwriting it. The wait below is
    // not polling for an outcome that might still be pending -- it gives the slow
    // request's fixed 300ms delay time to elapse, so a version that let it clobber
    // the container afterwards is caught rather than missed because the assertion
    // ran the moment the fast content first (correctly or not) appeared.
    await expect.poll(() => page.locator("#preview").textContent()).toContain("FAST MARKER");
    await page.waitForTimeout(400);
    expect(await page.locator("#preview").textContent()).toContain("FAST MARKER");
    expect(await page.locator("#preview").textContent()).not.toContain("SLOW MARKER");
  });
});

test.describe("printing", () => {
  test("two print requests made back-to-back share one in-flight attempt", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    const shared = await page.evaluate((source) => window.__printTwiceSharesOneAttempt(source), GOOD_SOURCE);

    expect(shared).toBe(true);
  });

  test("a print request made after the previous one has settled starts its own fresh attempt", async ({ page }) => {
    await page.goto("/tests/fixtures/harness.html");

    const fresh = await page.evaluate((source) => window.__printSequentiallyStartsFreshAttempts(source), GOOD_SOURCE);

    expect(fresh).toBe(true);
  });
});

/**
 * The print button had no error handling at all before this ticket: a `renderBook`
 * throw was an uncaught exception, and the print adapter's rejection had no
 * `.catch`. Both consumer is the author who clicks print while something is
 * wrong; the observable failure is nothing reaching `#status` (or the page
 * breaking outright) instead of a message with printing's own wording. Forcing
 * a genuine Vivliostyle print-engine failure has no oracle independent of the
 * engine itself -- the print adapter is substituted with one that always
 * rejects, at the same seam issue #1's architecture designed for this -- while
 * the broken-markup case below exercises the real, unmodified `renderBook`.
 */
test.describe("print button error paths", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tests/fixtures/print-error-harness.html");
  });

  test("a failing print engine is reported with printing's own wording", async ({ page }) => {
    await expect.poll(() => page.locator("#preview").textContent()).toContain("Start writing your book here.");

    await page.locator("#print").click();

    await expect(page.locator("#status")).toBeVisible();
    await expect.poll(() => page.locator("#status").textContent()).toContain("Printing failed");
  });

  test("printing broken markup is reported rather than thrown uncaught", async ({ page }) => {
    await replaceSource(page, BROKEN_SOURCE);

    await page.locator("#print").click();

    await expect(page.locator("#status")).toBeVisible();
    await expect.poll(() => page.locator("#status").textContent()).toContain("Printing failed");
    expect(await page.locator("#status").textContent()).toContain("line 3");
  });

  test("a standing print error survives a repaint that succeeds", async ({ page }) => {
    // #given: a print failure the author has not acknowledged
    await expect.poll(() => page.locator("#preview").textContent()).toContain("Start writing your book here.");
    await page.locator("#print").click();
    await expect.poll(() => page.locator("#status").textContent()).toContain("Printing failed");

    // #when: the author keeps writing and a repaint succeeds (this harness's
    // fake pagination adapter always resolves)
    await replaceSource(page, GOOD_SOURCE);
    await expect.poll(() => page.locator("#preview").textContent()).toContain("A good paragraph appears here.");

    // #then: the print error is still there -- a repaint's own success clears
    // only preview status, never print status
    expect(await page.locator("#status").textContent()).toContain("Printing failed");
  });
});

const OTHER_GOOD_SOURCE = ['<Book size="A5">', '<Section columns="1">', "A second paragraph appears here.", "</Section>", "</Book>"].join(
  "\n",
);

/**
 * Issue #11: broken markup already left the last good preview alone (the render step
 * throws before the pagination adapter is ever called), but the engine's own failure
 * did not -- the adapter emptied the preview before layout started, so an author whose
 * engine gave up was left with a blank pane and no line number to go to. The consumer
 * is that author; the observable failure is the preview going empty when the status
 * says the engine failed.
 *
 * Real Vivliostyle throughout: no document triggers its error path (an empty string,
 * plain text, a missing stylesheet, a missing image, unclosed XHTML and a nonsense
 * `@page size` were all tried, and it paginated every one of them), so the failure is
 * forced where the engine reads instead. The adapter hands it a blob URL, because the
 * book is a string built in memory rather than a resource that lives anywhere;
 * `URL.createObjectURL` is patched to return one that resolves to nothing, so the
 * engine's own 'error' event fires on a load it genuinely could not complete. Patching
 * a native browser API from the test is what the burst test above already does to
 * `Element.prototype.replaceChildren`.
 */
const UNLOADABLE_DOCUMENT = () => {
  URL.createObjectURL = () => `blob:${location.origin}/a-blob-url-that-resolves-to-nothing`;
};

test.describe("a repaint the engine cannot finish", () => {
  test("the last good book stays on screen and the status names the engine", async ({ page }) => {
    // #given: a book the real engine has laid out into the preview
    await page.goto(HARNESS);
    await replaceSource(page, GOOD_SOURCE);
    await expect.poll(() => page.locator("#preview").textContent()).toContain("A good paragraph appears here.");
    const goodPreview = await page.locator("#preview").textContent();

    // #when: the engine can no longer load what it is handed, and the author writes on
    await page.evaluate(UNLOADABLE_DOCUMENT);
    await replaceSource(page, OTHER_GOOD_SOURCE);

    // #then: the failure is reported in pagination's own wording, and the preview is
    // still the book the author was writing against
    await expect(page.locator("#status")).toBeVisible();
    await expect.poll(() => page.locator("#status").textContent()).toContain("the pagination engine could not lay out the book");
    expect(await page.locator("#preview").textContent()).toBe(goodPreview);
    expect(goodPreview).toContain("A good paragraph appears here.");
  });

  test("the very first repaint of a session failing leaves an empty preview, not an exception", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    // #given: an engine that cannot load a document, armed before the app's own
    // module runs, so there is no previous good render to keep at all
    // #when: the session's first repaint runs
    await page.addInitScript(UNLOADABLE_DOCUMENT);
    await page.goto(HARNESS);

    // #then: the failure is reported, the preview holds nothing at all, and nothing
    // threw. Emptiness is read as markup rather than as text because the engine
    // leaves its own empty viewport scaffolding behind when it gives up -- divs that
    // read as no text at all, so a preview that was never actually put back would
    // look identical to one that was.
    await expect(page.locator("#status")).toBeVisible();
    await expect.poll(() => page.locator("#status").textContent()).toContain("the pagination engine could not lay out the book");
    expect(await page.locator("#preview").innerHTML()).toBe("");
    expect(pageErrors).toEqual([]);
  });
});
