import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

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
    page.once("dialog", (dialog) => void dialog.dismiss());
    await page.locator("#load").setInputFiles(savedPath);
    await page.waitForTimeout(200);

    // #then: nothing about the current book changed
    const after = await page.evaluate(() => window.__editor?.getSource?.());
    expect(after).toBe(before);
  });
});
