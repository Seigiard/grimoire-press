import { expect, test } from "@playwright/test";

const HARNESS = "/tests/fixtures/persistence-harness.html";

/**
 * The oracle for every test here is the browser's own storage, observed through the
 * native `Storage` API rather than through the adapter that wrote to it. What is
 * asserted is what an author would notice: a draft that comes back after a reload,
 * an editor that opens on a clean machine, and a storage that is not written once
 * per keystroke.
 */
test.describe("persistence", () => {
  test.beforeEach(async ({ page }) => {
    // #given: a browser with no draft stored
    await page.goto(HARNESS);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("a draft written before the tab closes comes back when it reopens", async ({ page }) => {
    // #when: the author writes, then the tab is closed and reopened
    await page.locator(".cm-editor").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\n\nThe referee rolls two dice.\n");

    await expect
      .poll(() => page.evaluate(() => window.__editor?.getSource?.()))
      .toContain("The referee rolls two dice.");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("grimoire:draft")))
      .toContain("The referee rolls two dice.");

    await page.reload();

    // #then: the reopened editor holds what the author wrote
    const restored = await page.evaluate(() => window.__editor?.getSource?.());
    expect(restored).toContain("The referee rolls two dice.");
  });

  test("a first-time visitor gets a usable editor rather than an error", async ({ page }) => {
    // #given: storage holds no draft (cleared in beforeEach)
    // #when: the editor opens
    const source = await page.evaluate(() => window.__editor?.getSource?.());

    // #then: there is a book to edit, and typing into it works
    expect(source).toBeTruthy();

    await page.locator(".cm-editor").click();
    await page.keyboard.type("x");
    const afterTyping = await page.evaluate(() => window.__editor?.getSource?.());
    expect(afterTyping).not.toBe(source);
  });

  test("a burst of typing costs far fewer writes than it has keystrokes", async ({ page }) => {
    // #given: a counter on the native storage API, which is the browser's, not ours.
    // Counting here rather than inside the adapter keeps the oracle independent of
    // the code under test: a writer that ignored its debounce would still be counted.
    await page.evaluate(() => {
      const nativeSetItem = Storage.prototype.setItem;
      window.__writeCount = 0;
      Storage.prototype.setItem = function (key: string, value: string): void {
        window.__writeCount += 1;
        nativeSetItem.call(this, key, value);
      };
    });

    // #when: the author types a run of characters with no pause between them
    const burst = "Roll under your ability score to succeed.";
    await page.locator(".cm-editor").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(burst, { delay: 0 });

    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("grimoire:draft")))
      .toContain(burst);

    // #then: the burst reached storage in a handful of writes, not one per keystroke.
    // The bound is deliberately loose: the point is the order of magnitude, not an
    // exact count, which would depend on how fast the machine running this types.
    const writes = await page.evaluate(() => window.__writeCount);
    expect(writes).toBeLessThan(burst.length / 4);
  });
});
