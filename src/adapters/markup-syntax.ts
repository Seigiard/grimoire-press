import { tags } from "@lezer/highlight";
import type { BlockParser, MarkdownConfig, NodeSpec } from "@lezer/markdown";

import { matchTagLine, TagLine } from "../core/markup-tags";

const NODE_NAME: Record<TagLine["kind"], string> = {
  "book-open": "BookOpenTag",
  "book-close": "BookCloseTag",
  "section-open": "SectionOpenTag",
  "section-close": "SectionCloseTag",
  "page-open": "PageOpenTag",
  "page-close": "PageCloseTag",
  "page-break": "PageBreakTag",
  "column-break": "ColumnBreakTag",
};

// tags.tagName already has a rule in @codemirror/language's defaultHighlightStyle, so
// the book's tags read apart from prose without this extension also having to define
// and register its own highlight style.
const nodeSpecs: NodeSpec[] = Object.values(NODE_NAME).map((name) => ({
  name,
  block: true,
  style: tags.tagName,
}));

const bookMarkupBlock: BlockParser = {
  name: "BookMarkup",
  // Our tags look exactly like the start of a CommonMark "HTML block", which would
  // otherwise swallow one whole and everything after it up to the next blank line.
  // Running before that built-in parser is what lets ours claim the line first.
  before: "HTMLBlock",
  parse(cx, line) {
    const tag = matchTagLine(line.text.slice(line.basePos));
    if (tag === undefined) return false;

    const from = cx.lineStart + line.basePos;
    const to = cx.lineStart + line.text.length;
    cx.nextLine();
    cx.addElement(cx.elt(NODE_NAME[tag.kind], from, to));
    return true;
  },
  // Lets one of our tags end an in-progress paragraph even with no blank line before
  // it, the same way the base grammar's headings and rules do.
  endLeaf(_cx, line) {
    return matchTagLine(line.text.slice(line.basePos)) !== undefined;
  },
};

/**
 * The book markup's grammar for CodeMirror, sharing `core/markup-tags`'s tag
 * recognition with `core/parse-book.ts` so the editor's highlighting can never
 * disagree with what a tag actually does (issue #3's "one grammar").
 */
export const bookMarkupSyntax: MarkdownConfig = {
  defineNodes: nodeSpecs,
  parseBlock: [bookMarkupBlock],
};
