import { marked, type Token, type Tokens } from "marked";

/**
 * Renders one prose run through marked with a line-tracking renderer, so every
 * rendered block -- including a list's own items and a blockquote's own children,
 * not just the run's top-level blocks -- carries the source line it started on.
 * What a later ticket needs to scroll the preview to the editor's cursor, built
 * while the renderer is being written rather than bolted on after.
 *
 * A table's rows are left untagged as a group under the table's own line: marked's
 * table token does not carry a per-row source slice to derive one from, and a
 * rulebook's tables are short enough that landing on the table is an acceptable
 * cursor-sync target.
 *
 * Reference-style link definitions elsewhere in the same run will not resolve;
 * this book's prose has not needed them, and reparsing the whole document to
 * collect them first is more machinery than that's worth today.
 */
export function renderProse(source: string, startLine: number): string {
  const tokens = marked.lexer(source);
  const lineOf = new WeakMap<object, number>();
  assignLines(tokens, startLine, lineOf);
  return marked.parser(tokens, { renderer: new LineTrackingRenderer(lineOf) }).trim();
}

function assignLines(tokens: readonly Token[], startLine: number, lineOf: WeakMap<object, number>): void {
  let line = startLine;
  for (const token of tokens) {
    lineOf.set(token, line);
    if (token.type === "list") {
      assignItemLines(token.items, line, lineOf);
    } else if (token.type === "blockquote") {
      assignLines(token.tokens ?? [], line, lineOf);
    }
    line += countNewlines(token.raw);
  }
}

function assignItemLines(items: readonly Tokens.ListItem[], startLine: number, lineOf: WeakMap<object, number>): void {
  let line = startLine;
  for (const item of items) {
    lineOf.set(item, line);
    assignLines(item.tokens, line, lineOf);
    line += countNewlines(item.raw);
  }
}

function countNewlines(text: string): number {
  let count = 0;
  for (const ch of text) if (ch === "\n") count++;
  return count;
}

/** Tags a rendered block's outermost element with the source line it came from. */
function withDataLine(html: string, line: number | undefined): string {
  if (line === undefined || html.trim() === "") return html;
  return html.replace(/^<([a-zA-Z][a-zA-Z0-9-]*)/, `<$1 data-line="${line}"`);
}

class LineTrackingRenderer extends marked.Renderer {
  constructor(private readonly lineOf: WeakMap<object, number>) {
    super();
  }

  private tag(token: object, html: string): string {
    return withDataLine(html, this.lineOf.get(token));
  }

  override paragraph(token: Tokens.Paragraph): string {
    return this.tag(token, super.paragraph(token));
  }
  override heading(token: Tokens.Heading): string {
    return this.tag(token, super.heading(token));
  }
  override list(token: Tokens.List): string {
    return this.tag(token, super.list(token));
  }
  override listitem(token: Tokens.ListItem): string {
    return this.tag(token, super.listitem(token));
  }
  override blockquote(token: Tokens.Blockquote): string {
    return this.tag(token, super.blockquote(token));
  }
  override table(token: Tokens.Table): string {
    return this.tag(token, super.table(token));
  }
  override code(token: Tokens.Code): string {
    return this.tag(token, super.code(token));
  }
  override hr(token: Tokens.Hr): string {
    return this.tag(token, super.hr(token));
  }
}
