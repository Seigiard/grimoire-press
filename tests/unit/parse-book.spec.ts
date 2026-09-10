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

/** As above, plus what the author is told. Used where the mistake is one an author
 * can make in more than one place and the message is what distinguishes them -- a
 * break rejected because it is inside a page, say, rather than because it sits
 * outside every block -- so a line number alone would not tell the two apart. */
function expectMarkupError(source: string, line: number, message: RegExp): void {
  try {
    parseBook(source);
    expect.unreachable("parseBook was expected to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(MarkupError);
    expect((error as MarkupError).line).toBe(line);
    expect((error as MarkupError).message).toMatch(message);
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

  it("names a tag-shaped typo strictly before <Book>", () => {
    const source = [
      "<PageBrek />",
      '<Book size="A5">',
      '<Section columns="1">',
      "Some prose.",
      "</Section>",
      "</Book>",
    ].join("\n");
    try {
      parseBook(source);
      expect.unreachable("parseBook was expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownTagError);
      expect((error as UnknownTagError).tag).toBe("PageBrek");
      expect((error as UnknownTagError).line).toBe(1);
    }
  });

  it("names a tag-shaped typo strictly after </Book>", () => {
    const source = [
      '<Book size="A5">',
      '<Section columns="1">',
      "Some prose.",
      "</Section>",
      "</Book>",
      "<PageBrek />",
    ].join("\n");
    try {
      parseBook(source);
      expect.unreachable("parseBook was expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownTagError);
      expect((error as UnknownTagError).tag).toBe("PageBrek");
      expect((error as UnknownTagError).line).toBe(6);
    }
  });
});

/**
 * Issue #20's vocabulary: the top level of a book stops being a list of sections and
 * becomes an ordered list of sections and pages. The consumer is render-book.ts,
 * which walks that list to build the document, and through it an author who wrote a
 * character sheet between two chapters. The observable failure is a page dropped
 * from the book, or landing somewhere other than where the author wrote it. The
 * oracle is the fixture itself: the order this test wrote the blocks in and the
 * count of the fixture's own lines, neither of which parse-book.ts computes.
 */
describe("parseBook top-level blocks", () => {
  it("carries sections and pages in the order the author wrote them", () => {
    // #given: a book with a page written between two sections
    const source = [
      '<Book size="A5">',
      '<Section columns="1">',
      "Prose before the card.",
      "</Section>",
      "<Page>",
      "A card that stands on its own.",
      "</Page>",
      '<Section columns="2">',
      "Prose after the card.",
      "</Section>",
      "</Book>",
    ].join("\n");

    // #when: it is parsed
    const parsed = parseBook(source);

    // #then: all three blocks are there, in that order, each naming the line it was
    // opened on and holding the prose written inside it
    expect(parsed.blocks).toEqual([
      { kind: "section", columns: 1, line: 2, content: [{ kind: "prose", source: "Prose before the card.", line: 3 }] },
      { kind: "page", line: 5, content: [{ kind: "prose", source: "A card that stands on its own.", line: 6 }] },
      { kind: "section", columns: 2, line: 8, content: [{ kind: "prose", source: "Prose after the card.", line: 9 }] },
    ]);
  });

  it("treats a book that is nothing but a page as that one page", () => {
    // #given: a book whose author wrote a card and no section at all -- the case
    // that decides whether a page counts as a block in its own right, or whether
    // only a <Section> makes the top level of a book something to be parsed
    const source = ['<Book size="A5">', "<Page>", "A card that stands on its own.", "</Page>", "</Book>"].join("\n");

    // #when: it is parsed
    const parsed = parseBook(source);

    // #then: the page is the book's only block, not prose wrapped in an implicit
    // section it never asked for
    expect(parsed.blocks).toEqual([
      { kind: "page", line: 2, content: [{ kind: "prose", source: "A card that stands on its own.", line: 3 }] },
    ]);
  });
});

/**
 * Issue #24: the mistakes an author can make writing a page, told the way the same
 * mistake is already told inside a section. The consumer is an author who reached
 * for a break out of habit, forgot a closing tag, or tried to lay a page out in
 * columns. The observable failure is either silence -- markup that does nothing and
 * says nothing, leaving the author to wonder why the break had no effect -- or an
 * error that names the wrong line, or one whose wording gives no reason and so
 * sends the author looking for a fault that is not there.
 *
 * The oracle is the fixture itself, as in the suites above: the expected line comes
 * from counting the literal source each test wrote, never from anything
 * parse-book.ts computes. Where the message is asserted it is asserted on the part
 * an author reads for the reason, not on the whole sentence.
 */
describe("parseBook page vocabulary", () => {
  it("rejects a page break inside a page, saying the page is already one page", () => {
    // #given: a page whose author reached for a page break inside it (line 4)
    const source = [
      '<Book size="A5">',
      "<Page>",
      "A card that stands on its own.",
      "<PageBreak />",
      "</Page>",
      "</Book>",
    ].join("\n");

    // #when: it is parsed
    // #then: the break is rejected on its own line, with the reason it makes no
    // sense there rather than a bare "unexpected tag"
    expectMarkupError(source, 4, /already one page/);
  });

  it("rejects a column break inside a page, saying a page has no columns to break", () => {
    // #given: a page whose author reached for a column break inside it (line 4)
    const source = [
      '<Book size="A5">',
      "<Page>",
      "A card that stands on its own.",
      "<ColumnBreak />",
      "</Page>",
      "</Book>",
    ].join("\n");

    // #when: it is parsed
    // #then: rejected on its own line, and for the reason that belongs to a column
    // break rather than the one that belongs to a page break
    expectMarkupError(source, 4, /no columns to break/);
  });

  it("names the line a page was opened on when it is never closed", () => {
    // #given: a page opened on line 2 and never closed
    const source = ['<Book size="A5">', "<Page>", "A card that stands on its own.", "</Book>"].join("\n");

    // #when: it is parsed
    // #then: the same shape an unclosed <Section> already produces -- the line the
    // block was opened on, and the closing tag that is missing
    expectMarkupError(source, 2, /<Page> opened on line 2 is never closed with <\/Page>/);
  });

  it("names the line of a page nested inside another page", () => {
    // #given: a page opened again (line 3) inside a page
    const source = [
      '<Book size="A5">',
      "<Page>",
      "<Page>",
      "A card that stands on its own.",
      "</Page>",
      "</Page>",
      "</Book>",
    ].join("\n");

    // #when: it is parsed
    // #then: the inner page's own line, in the same shape as the existing nesting
    // error -- not the outer page's line, and not an "unexpected tag"
    expectMarkupError(source, 3, /<Page> cannot be nested inside another <Page>/);
  });

  it("rejects a column count declared on a page", () => {
    // #given: a page an author tried to give a column count (line 2)
    const source = ['<Book size="A5">', '<Page columns="2">', "A card that stands on its own.", "</Page>", "</Book>"].join(
      "\n",
    );

    // #when: it is parsed
    // #then: the attribute is rejected on the line it was written on, and the
    // author is told a page has no columns -- rather than the line falling through
    // to prose and being reported as content outside any block, which names the
    // right line for the wrong reason
    expectMarkupError(source, 2, /<Page columns="2">.*a page has no columns/);
  });

  it("rejects an attribute a page does not have, rather than ignoring it", () => {
    // #given: a page whose author reached for a column count and misspelled it (line 2)
    const source = ['<Book size="A5">', '<Page colums="2">', "A card that stands on its own.", "</Page>", "</Book>"].join(
      "\n",
    );

    // #when: it is parsed
    // #then: they are told the attribute means nothing here, on the line they wrote
    // it -- an attribute that quietly did nothing would leave them reading a sheet
    // that came out wrong for a reason nothing in the editor mentioned
    expectMarkupError(source, 2, /<Page colums=.*a page does not have/);
  });

  it("leaves a break inside a section working, so the reason above is about pages and not about breaks", () => {
    // #given: a section holding both kinds of break (lines 4 and 6)
    const source = [
      '<Book size="A5">',
      '<Section columns="2">',
      "Prose.",
      "<PageBreak />",
      "More prose.",
      "<ColumnBreak />",
      "Yet more prose.",
      "</Section>",
      "</Book>",
    ].join("\n");

    // #when: it is parsed
    // #then: both breaks are part of the section's content, on the lines they were
    // written on
    const parsed = parseBook(source);

    expect(parsed.blocks[0]).toMatchObject({
      kind: "section",
      content: [
        { kind: "prose", line: 3 },
        { kind: "page-break", line: 4 },
        { kind: "prose", line: 5 },
        { kind: "column-break", line: 6 },
        { kind: "prose", line: 7 },
      ],
    });
  });
});
