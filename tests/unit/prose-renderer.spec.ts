import { describe, expect, it } from "vitest";

import { renderProse } from "../../src/core/prose-renderer";

describe("renderProse headings", () => {
  it("marks Markdown headings as structural without marking raw HTML headings", () => {
    const html = renderProse(["## A book section", "", "<h2>A form caption</h2>"].join("\n"), 4);

    expect(html).toContain('<h2 data-line="4" data-grimoire-structural-heading>A book section</h2>');
    expect(html).toContain("<h2>A form caption</h2>");
    expect(html).not.toContain("<h2 data-grimoire-structural-heading>A form caption</h2>");
  });
});
