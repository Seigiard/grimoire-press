import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { FILE_FORMAT } from "../src/adapters/file";

const HARNESS = "/tests/fixtures/persistence-harness.html";

// Plain ASCII prose rather than the Cyrillic CONTEXT.md's default-ru theme is meant
// for -- typing Unicode through Playwright's keyboard simulation is its own source
// of flakiness this suite doesn't need. The `theme="default-ru"` attribute is what
// this file cares about: it is the theme travelling *inside* the source (see
// `adapters/file.ts`'s own comment on why no separate theme field exists), so an
// exact round trip of this string is already proof the theme came back too.
const SOURCE = ['<Book size="A5" theme="default-ru">', '<Section columns="2">', "# Skill list", "", "Roll two dice and add the result.", "</Section>", "</Book>"].join(
  "\n",
);

async function replaceSource(page: import("@playwright/test").Page, source: string): Promise<void> {
  await page.locator(".cm-editor").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(source);
}

/**
 * The consumer throughout this file is the author who downloads a book to keep it,
 * and later loads it back -- on the same machine or another one -- to continue
 * where they left off. Every oracle below is real: a real browser download event
 * captured by Playwright, a real `<input type="file">` given that real downloaded
 * file, and the real DOM (`#preview`'s own text, `#status`'s own text, and
 * `getSource()` reading CodeMirror's own buffer) that `startApp`'s real wiring
 * produces from it. None of it is a Blob-construction or JSON-shape assertion --
 * the file's own bytes are never inspected directly by these tests.
 */
test.describe("download and load a book", () => {
  test.beforeEach(async ({ page }) => {
    // #given: a browser with no draft stored
    await page.goto(HARNESS);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("a book downloaded and loaded back holds what it held, preview included", async ({ page }) => {
    // #given: a book the author wrote, whose preview has painted
    await replaceSource(page, SOURCE);
    await expect.poll(() => page.locator("#preview").textContent()).toContain("Roll two dice and add the result.");
    const originalPreview = await page.locator("#preview").textContent();

    // #when: it is downloaded, the editor is then changed to something else
    // entirely (so a load that silently did nothing could not be mistaken for one
    // that worked), and the downloaded file is loaded back in and confirmed
    const downloadDir = mkdtempSync(path.join(tmpdir(), "grimoire-roundtrip-"));
    const savedPath = path.join(downloadDir, "book.grimoire.json");
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download").click()]);
    await download.saveAs(savedPath);

    await replaceSource(page, "placeholder text that must not survive the load");

    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator("#load").setInputFiles(savedPath);

    // #then: the editor holds exactly the source it held before, and the preview
    // shows exactly what it showed before
    await expect.poll(() => page.evaluate(() => window.__editor?.getSource?.())).toBe(SOURCE);
    await expect.poll(() => page.locator("#preview").textContent()).toBe(originalPreview);
  });

  test("loading a file that is not a book is reported, and the current book is untouched", async ({ page }) => {
    // #given: a book in progress, and an unrelated JSON file with no connection to
    // this editor's saved-file format
    await replaceSource(page, "Distinctive text the author was in the middle of writing.");
    const before = await page.evaluate(() => window.__editor?.getSource?.());

    const dir = mkdtempSync(path.join(tmpdir(), "grimoire-not-a-book-"));
    const notABookPath = path.join(dir, "definitely-not-a-book.json");
    writeFileSync(notABookPath, JSON.stringify({ some: "unrelated JSON file" }));

    // #when: that file is loaded
    await page.locator("#load").setInputFiles(notABookPath);

    // #then: the author is told, and the book they were writing is unchanged
    await expect(page.locator("#status")).toBeVisible();
    await expect.poll(() => page.locator("#status").textContent()).toContain("Loading file failed");
    const after = await page.evaluate(() => window.__editor?.getSource?.());
    expect(after).toBe(before);
  });

  test("a JSON file carrying a source field but no format marker is still not a book", async ({ page }) => {
    // #given: a book in progress, and another tool's JSON file that happens to have
    // a top-level "source" string -- the shape check alone cannot tell it apart, so
    // only the format marker stands between the author and a silent replacement
    await replaceSource(page, "Distinctive text the author was in the middle of writing.");
    const before = await page.evaluate(() => window.__editor?.getSource?.());

    const dir = mkdtempSync(path.join(tmpdir(), "grimoire-lookalike-"));
    const lookalikePath = path.join(dir, "some-other-tool.json");
    writeFileSync(lookalikePath, JSON.stringify({ source: "print('hello from another tool')" }));

    // #when: that file is loaded
    await page.locator("#load").setInputFiles(lookalikePath);

    // #then: the author is told, and the book they were writing is unchanged
    await expect(page.locator("#status")).toBeVisible();
    await expect.poll(() => page.locator("#status").textContent()).toContain("Loading file failed");
    const after = await page.evaluate(() => window.__editor?.getSource?.());
    expect(after).toBe(before);
  });

  // Consumer: the author who picks a file that carries the right `format` marker
  // (so it passed the previous test's check) but was assembled wrong -- an older
  // export, a hand-edited file, a bug in some other tool that writes this format
  // -- and has no `source` field at all. Observable failure: `loadBookFile`'s
  // shape guard is a single `||`-chain, and a marker-present/source-missing file
  // is the one member of that chain the two tests above never reach, so a
  // regression narrowing the guard to only the marker check would ship unnoticed.
  // Oracle: the same real `#status` text and real `getSource()` before/after as
  // the tests above -- independent of `file.ts`'s own internals. `FILE_FORMAT` is
  // imported from production code rather than retyped here, so this can't drift
  // from the marker `loadBookFile` actually checks against.
  test("a file with the right format marker but no source field is still not a book", async ({ page }) => {
    await replaceSource(page, "Distinctive text the author was in the middle of writing.");
    const before = await page.evaluate(() => window.__editor?.getSource?.());

    const dir = mkdtempSync(path.join(tmpdir(), "grimoire-missing-source-"));
    const missingSourcePath = path.join(dir, "missing-source.json");
    writeFileSync(missingSourcePath, JSON.stringify({ format: FILE_FORMAT, version: 1 }));

    await page.locator("#load").setInputFiles(missingSourcePath);

    await expect(page.locator("#status")).toBeVisible();
    await expect.poll(() => page.locator("#status").textContent()).toContain("Loading file failed");
    const after = await page.evaluate(() => window.__editor?.getSource?.());
    expect(after).toBe(before);
  });

  // Consumer: the author whose saved file was corrupted between download and
  // load -- a bad copy, an interrupted sync, a botched transfer to another
  // machine. Observable failure: `File.text()` decodes UTF-8 non-fatally, so an
  // invalid byte becomes a `U+FFFD` replacement character instead of a
  // rejection -- the file would load "successfully" as a book quietly full of
  // replacement glyphs, telling the author nothing is wrong. Oracle: the real
  // `#status` text/visibility and real `getSource()` before/after, driven by a
  // byte sequence (0xFF, never valid UTF-8 in any position) a real `TextDecoder`
  // rejects -- nothing about `TextDecoder` itself is asserted, only the
  // observable DOM outcome.
  test("a file corrupted into invalid UTF-8 is reported rather than loaded full of replacement characters", async ({
    page,
  }) => {
    await replaceSource(page, "Distinctive text the author was in the middle of writing.");
    const before = await page.evaluate(() => window.__editor?.getSource?.());

    const dir = mkdtempSync(path.join(tmpdir(), "grimoire-corrupt-"));
    const corruptPath = path.join(dir, "corrupt.grimoire.json");
    const prefix = Buffer.from(`{"format":"${FILE_FORMAT}","version":1,"source":"`, "utf-8");
    const suffix = Buffer.from(`"}`, "utf-8");
    writeFileSync(corruptPath, Buffer.concat([prefix, Buffer.from([0xff]), suffix]));

    await page.locator("#load").setInputFiles(corruptPath);

    await expect(page.locator("#status")).toBeVisible();
    await expect.poll(() => page.locator("#status").textContent()).toContain("Loading file failed");
    const after = await page.evaluate(() => window.__editor?.getSource?.());
    expect(after).toBe(before);
  });

  // Consumer: the author who opens the "replace your book?" dialog and clicks
  // Cancel. Observable failure: the previous version of this test only asserted
  // the source was unchanged, which is equally true if the whole load handler
  // were deleted -- no file read, no dialog, nothing. That is not a load being
  // declined; it is nothing happening at all. `dialogSeen` and the message text
  // are the missing half of the oracle: proof that a real native confirm
  // dialog, carrying the load handler's own wording, was actually presented
  // before the decision not to replace anything is asserted.
  test("declining the confirmation leaves the current book exactly as it was", async ({ page }) => {
    // #given: a downloaded book, and newer work in the editor since then
    await replaceSource(page, SOURCE);
    const downloadDir = mkdtempSync(path.join(tmpdir(), "grimoire-decline-"));
    const savedPath = path.join(downloadDir, "book.grimoire.json");
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download").click()]);
    await download.saveAs(savedPath);

    await replaceSource(page, "the author's newer, still-unsaved work");
    const before = await page.evaluate(() => window.__editor?.getSource?.());

    // #when: the file is loaded, but the replace-your-book confirmation is declined
    let dialogMessage: string | undefined;
    page.once("dialog", (dialog) => {
      dialogMessage = dialog.message();
      void dialog.dismiss();
    });
    await page.locator("#load").setInputFiles(savedPath);
    await page.waitForTimeout(200);

    // #then: the confirmation was genuinely reached (proving the load path ran
    // all the way to the decision point, not that it silently did nothing)...
    expect(dialogMessage).toContain("replaces the book you are currently editing");
    // ...and declining it is what left the current book untouched
    const after = await page.evaluate(() => window.__editor?.getSource?.());
    expect(after).toBe(before);
  });

  // Consumer: the author typing with auto-refresh on, who loads a file instead
  // of typing. Observable failure: `EditorHandle.setSource` fires the same
  // update listener a keystroke would, arming a debounced repaint, while the
  // load handler also repaints immediately -- two repaints for one load.
  // Oracle: a counter patched onto `Element.prototype.replaceChildren`, the
  // real DOM method `paginate()` calls once per attempted repaint -- the same
  // independent oracle `preview.spec.ts`'s own burst-typing test already
  // established for counting repaints, unrelated to any file this patch touches.
  test("loading a file triggers exactly one repaint, not two", async ({ page }) => {
    await replaceSource(page, SOURCE);
    await expect.poll(() => page.locator("#preview").textContent()).toContain("Roll two dice and add the result.");

    const downloadDir = mkdtempSync(path.join(tmpdir(), "grimoire-single-repaint-"));
    const savedPath = path.join(downloadDir, "book.grimoire.json");
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download").click()]);
    await download.saveAs(savedPath);

    await replaceSource(page, "placeholder text");
    await expect.poll(() => page.locator("#preview").textContent()).toContain("placeholder text");

    // Counting starts only now, so the placeholder's own repaint above isn't
    // mistaken for one the load itself caused.
    await page.evaluate(() => {
      const native = Element.prototype.replaceChildren;
      const preview = document.getElementById("preview");
      window.__repaintCount = 0;
      Element.prototype.replaceChildren = function (...args: (string | Node)[]) {
        if (this === preview) window.__repaintCount += 1;
        return native.apply(this, args);
      };
    });

    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator("#load").setInputFiles(savedPath);
    await expect.poll(() => page.locator("#preview").textContent()).toContain("Roll two dice and add the result.");
    // Past the auto-refresh debounce window, so a stray second repaint the bug
    // would schedule has time to land before the count below is read.
    await page.waitForTimeout(600);

    expect(await page.evaluate(() => window.__repaintCount)).toBe(1);
  });
});

/**
 * Consumer: the author who picks a file, realizes it's the wrong one, and picks
 * a different one before the first has finished being read. Observable failure:
 * the first (now-unwanted) selection's result lands after the second's and
 * silently overwrites it, leaving the editor holding the file the author did not
 * mean to load. Oracle: the real `getSource()` DOM state after two real
 * `setInputFiles` calls processed by the real `change` handler in
 * `start-app.ts` -- only the load adapter's timing is faked (this harness's own
 * `fakeLoadBookFile`), the same substitution technique `coalesce-harness.html`
 * already established as legitimate for proving this exact class of ordering
 * defect deterministically rather than by hoping a slow read outlasts a fast one.
 */
test.describe("loading two files in quick succession", () => {
  test("a slower load started first never overwrites a faster one requested after it", async ({ page }) => {
    await page.goto("/tests/fixtures/load-race-harness.html");
    await expect.poll(() => page.locator("#preview").textContent()).toContain("Start writing your book here.");

    const dir = mkdtempSync(path.join(tmpdir(), "grimoire-load-race-"));
    const slowPath = path.join(dir, "slow-book.json");
    const fastPath = path.join(dir, "fast-book.json");
    writeFileSync(slowPath, "{}");
    writeFileSync(fastPath, "{}");

    page.on("dialog", (dialog) => void dialog.accept());

    await page.locator("#load").setInputFiles(slowPath);
    await page.locator("#load").setInputFiles(fastPath);

    await expect.poll(() => page.evaluate(() => window.__editor?.getSource?.())).toContain("fast-book.json");
    // The slow selection's 300ms delay has time to resolve and, if the bug is
    // present, clobber the editor after the fact.
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__editor?.getSource?.())).toContain("fast-book.json");
  });
});

/**
 * Consumer: an author who sees a standing "printing failed" message, then loads
 * a different book. Observable failure: the message keeps accusing a book that
 * no longer exists in the editor -- the print failure belonged to the book the
 * load just replaced, not the one now on screen. Oracle: `#status`'s own real
 * text after a real download-then-load round trip through
 * `print-error-harness.html`'s real file adapters (only pagination and printing
 * are substituted there, for reasons that harness's own existing tests already
 * establish and that have nothing to do with file loading).
 */
test.describe("a successful load and a standing print error", () => {
  test("loading a book clears a print failure recorded against the book it replaced", async ({ page }) => {
    await page.goto("/tests/fixtures/print-error-harness.html");
    await expect.poll(() => page.locator("#preview").textContent()).toContain("Start writing your book here.");

    // #given: a print failure standing against the current book
    await page.locator("#print").click();
    await expect.poll(() => page.locator("#status").textContent()).toContain("Printing failed");

    // #when: that same book is downloaded and loaded back, replacing the current one
    const dir = mkdtempSync(path.join(tmpdir(), "grimoire-print-clear-"));
    const savedPath = path.join(dir, "book.grimoire.json");
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download").click()]);
    await download.saveAs(savedPath);

    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator("#load").setInputFiles(savedPath);

    // #then: the print failure recorded against the replaced book is gone
    await expect.poll(() => page.locator("#status").textContent()).not.toContain("Printing failed");
  });
});
