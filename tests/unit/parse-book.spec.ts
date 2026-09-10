import { describe, expect, it } from "vitest";

import { MarkupError, UnknownTagError } from "../../src/core/markup-error";
import { parseBook } from "../../src/core/parse-book";
import { getTheme } from "../../src/core/themes/registry";

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

  it("rejects a theme named after an inherited Object property", () => {
    // #given: a theme name that is not registered but does name a property every
    // plain object inherits, which a bare registry lookup would resolve to
    // #when: a book declares it
    const source = ['<Book theme="toString">', '<Section columns="1">', "Some prose.", "</Section>", "</Book>"].join("\n");

    // #then: it is rejected like any other unknown theme, naming its line
    expectMarkupErrorLine(source, 1);
  });

  it("names the line of an unknown theme attribute", () => {
    const source = ['<Book theme="not-a-real-theme">', '<Section columns="1">', "Some prose.", "</Section>", "</Book>"].join(
      "\n",
    );
    expectMarkupErrorLine(source, 1);
  });
});

/**
 * Consumer: render-book.ts, which embeds `parsed.theme`'s CSS and sets
 * `<html lang>` from `parsed.lang`. The observable failure is parseBook
 * resolving either field to something other than what `themes/registry.ts` --
 * a different module, not parse-book.ts's own logic -- actually says
 * "default-ru" is, or failing to fall back to a themeless, English-lang book
 * when `<Book>` names no theme at all (issues #2/#3's books, which predate
 * themes and must keep rendering unchanged).
 */
describe("parseBook theme resolution", () => {
  it("resolves a named theme to the registry's own theme object and language", () => {
    const source = ['<Book theme="default-ru">', '<Section columns="1">', "Some prose.", "</Section>", "</Book>"].join("\n");

    const parsed = parseBook(source);

    expect(parsed.theme).toBe(getTheme("default-ru"));
    expect(parsed.lang).toBe("ru");
  });

  it("leaves a themeless book without a theme, defaulting to English", () => {
    const source = ['<Book size="A5">', '<Section columns="1">', "Some prose.", "</Section>", "</Book>"].join("\n");

    const parsed = parseBook(source);

    expect(parsed.theme).toBeUndefined();
    expect(parsed.lang).toBe("en");
  });
});

/**
 * Issue #6's second error case: a tag nobody recognises, reported as such rather
 * than silently swallowed as prose. The consumer is an author who mistypes a tag
 * name (e.g. `<PageBreak />` as `<PageBrek />`); the observable failure is
 * `parseBook` either not throwing at all (today's silent-prose behaviour) or
 * throwing the wrong error class, leaving an author with no idea their tag did
 * nothing. The oracle is the fixture's own line count, same as the suite above.
 */
describe("parseBook unknown-tag detection", () => {
  it("names the tag and line of a tag-shaped line nobody recognises", () => {
    const source = ["Some prose.", "", "<PageBrek />", "", "More prose."].join("\n");
    try {
      parseBook(source);
      expect.unreachable("parseBook was expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownTagError);
      expect((error as UnknownTagError).tag).toBe("PageBrek");
      expect((error as UnknownTagError).line).toBe(3);
    }
  });

  it("does not misreport a known tag carrying an attribute it doesn't expect", () => {
    // A real tag name used oddly must not be reported as a made-up one -- it falls
    // through to whatever generic markup error its shape produces, unchanged from
    // before unknown-tag detection existed.
    const source = ['<Book foo="bar">', '<Section columns="1">', "Some prose.", "</Section>", "</Book>"].join("\n");
    expect(() => parseBook(source)).not.toThrow(UnknownTagError);
  });
});
