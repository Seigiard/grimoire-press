import { describe, expect, it } from "vitest";

import { MarkupError } from "../../src/core/markup-error";
import { parseBook } from "../../src/core/parse-book";

/**
 * parseBook is pure, browser-free TypeScript -- it needs no browser oracle. The
 * consumer is an author who mistypes the book markup (a bad attribute, a stray,
 * missing, or misplaced tag). The observable failure is parseBook throwing a
 * MarkupError whose `.line` does not point at the actual mistake. The oracle is the
 * fixture itself: each one below is a literal string this test wrote, so the
 * expected line number comes from counting the fixture's own lines, independent of
 * how parse-book.ts happens to compute it -- the same way asserting a compiler
 * diagnostic points at the right line in a hand-written snippet works.
 *
 * One test per `throw new MarkupError(...)` statement in parse-book.ts (eight in
 * total), plus one bonus variant for assertOnlyBlank, whose single throw statement
 * is reached from two call sites (content before `<Book>`, content after `</Book>`).
 */

function expectMarkupErrorLine(source: string, line: number): void {
  try {
    parseBook(source);
    expect.unreachable("parseBook was expected to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(MarkupError);
    expect((error as MarkupError).line).toBe(line);
  }
}

describe("parseBook error paths", () => {
  it("names the line of an invalid size attribute", () => {
    const source = ['<Book size="A5;bad">', '<Section columns="1">', "Some prose.", "</Section>", "</Book>"].join("\n");
    expectMarkupErrorLine(source, 1);
  });

  it("names the line of an invalid columns attribute", () => {
    const source = ['<Book size="A5">', '<Section columns="two">', "Some prose.", "</Section>", "</Book>"].join("\n");
    expectMarkupErrorLine(source, 2);
  });

  it("names the line of content outside any <Section>", () => {
    const source = [
      '<Book size="A5">',
      '<Section columns="1">',
      "Some prose.",
      "</Section>",
      "Stray line here.",
      "</Book>",
    ].join("\n");
    expectMarkupErrorLine(source, 5);
  });

  it("names the line of a break tag directly inside <Book>, outside any <Section>", () => {
    const source = ['<Book size="A5">', "<PageBreak />", '<Section columns="1">', "Some prose.", "</Section>", "</Book>"].join(
      "\n",
    );
    expectMarkupErrorLine(source, 2);
  });

  it("names the line of an unexpected tag inside a <Section>'s content", () => {
    // No <Book> wrapper at all (so nothing outer intercepts the stray </Book> as a
    // boundary first) -- an author who meant to close the <Section> but typed
    // </Book> by mistake.
    const source = ['<Section columns="1">', "Some prose.", "</Book>", "</Section>"].join("\n");
    expectMarkupErrorLine(source, 3);
  });

  it("names the line of content before <Book>", () => {
    const source = [
      "Stray line here.",
      "",
      '<Book size="A5">',
      '<Section columns="1">',
      "Some prose.",
      "</Section>",
      "</Book>",
    ].join("\n");
    expectMarkupErrorLine(source, 1);
  });

  it("names the line of content after </Book>", () => {
    const source = [
      '<Book size="A5">',
      '<Section columns="1">',
      "Some prose.",
      "</Section>",
      "</Book>",
      "",
      "Stray line here.",
    ].join("\n");
    expectMarkupErrorLine(source, 7);
  });

  it("names the line of a <Book> nested inside another <Book>", () => {
    const source = [
      '<Book size="A5">',
      '<Book size="A4">',
      '<Section columns="1">',
      "Some prose.",
      "</Section>",
      "</Book>",
      "</Book>",
    ].join("\n");
    expectMarkupErrorLine(source, 2);
  });

  it("names the line of an unclosed <Book>", () => {
    const source = ['<Book size="A5">', '<Section columns="1">', "Some prose.", "</Section>"].join("\n");
    expectMarkupErrorLine(source, 1);
  });
});
