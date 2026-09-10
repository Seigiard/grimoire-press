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
