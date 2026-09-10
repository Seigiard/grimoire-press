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
});
