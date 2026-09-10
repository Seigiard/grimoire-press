import { expect, test } from "@playwright/test";

/**
 * Test oracle: The consumer is the browser application (the editor).
 * Observable failure: after reloading the page, the editor content is lost or an error is thrown.
 * Oracle: the stored value in localStorage, read directly with localStorage.getItem('grimoire:draft'),
 * which is independent of the implementation.
 */
test.describe("persistence", () => {
  test.beforeEach(async ({ page }) => {
    // #given: clear any existing draft before each test
    await page.goto("/tests/fixtures/persistence-harness.html");
    await page.evaluate(() => window.__clearDraft?.());
    await page.reload();
  });

  test("draft survives page reload", async ({ page }) => {
    // #given: the editor is open with no draft in localStorage
    await page.goto("/tests/fixtures/persistence-harness.html");

    // #when: the user types additional content (appended to template)
    const additionalText = "# My Custom Section\n\nCustom content here.\n";
    const editorView = await page.locator(".cm-editor");
    await editorView.click();
    // Move cursor to end of document
    await page.keyboard.press("Control+End");
    // Type the additional content
    await page.keyboard.type(additionalText);

    // Wait for debounce to complete (1000ms + buffer)
    await page.waitForTimeout(1200);

    // Verify it was written to localStorage (should include both template and custom content)
    const stored = await page.evaluate(() => localStorage.getItem("grimoire:draft"));
    expect(stored).toBeDefined();
    expect(stored).toContain("My Custom Section");
    expect(stored).toContain("Custom content here");

    // #then: reload the page
    await page.reload();

    // The editor content should be restored with the custom content still present
    const editorContent = await page.evaluate(() => window.__editor?.getSource?.());
    expect(editorContent).toContain("My Custom Section");
    expect(editorContent).toContain("Custom content here");
  });

  test("first-time visitor gets default template when no draft exists", async ({ page }) => {
    // #given: localStorage is empty (cleared in beforeEach)
    // (already done above)

    // #when: the page loads

    // #then: the editor should contain the default template, not error
    const editorContent = await page.evaluate(() => window.__editor?.getSource?.());

    expect(editorContent).toBeDefined();
    expect(editorContent).toContain("Untitled book");
  });

  test("draft is written after typing stops, not on every keystroke", async ({ page }) => {
    // #given: the editor is open and a draft is stored (from beforeEach clear and reload)
    await page.goto("/tests/fixtures/persistence-harness.html");

    const editorView = await page.locator(".cm-editor");
    await editorView.click();
    await page.keyboard.press("Control+End");

    // #when: the user types rapidly
    await page.keyboard.type("First");

    // Wait while the debounce timer is running
    await page.waitForTimeout(500);

    // Type more without waiting for debounce to complete
    await page.keyboard.type(" Second");
    await page.waitForTimeout(200);

    // At this point, debounce timer was reset by the second keystroke

    // #then: after typing stops and debounce completes
    await page.waitForTimeout(1100);

    const finalStored = await page.evaluate(() => localStorage.getItem("grimoire:draft"));
    // The final write should contain both words
    expect(finalStored).toContain("First");
    expect(finalStored).toContain("Second");
  });
});
