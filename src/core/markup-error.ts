/**
 * Malformed book markup: an unclosed or nested `<Book>`/`<Section>`, a break or stray
 * text outside the element that would give it meaning, or an invalid attribute. Carries
 * the 1-based source line so a caller can report where the problem is, without core
 * needing to know how (or whether) that reaches an author -- the preview's error
 * surface is issue #6's to build.
 */
export class MarkupError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = "MarkupError";
  }
}

/**
 * A line shaped exactly like one of the book's tags -- a bare, capitalized element
 * alone on its own line, the same silhouette `matchTagLine` recognises -- but whose
 * name is not one of ours: an author's typo such as `<PageBrek />`. Distinct from
 * `MarkupError` because the preview's error surface (issue #6) treats "markup we
 * understood but rejected" and "a tag we don't recognise at all" as separate cases.
 */
export class UnknownTagError extends Error {
  constructor(
    readonly tag: string,
    readonly line: number,
  ) {
    super(`<${tag}> on line ${line} is not a tag this editor recognizes`);
    this.name = "UnknownTagError";
  }
}
