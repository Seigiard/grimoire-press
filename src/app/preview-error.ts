import { UnreadableBookFileError } from "../adapters/file";
import { MarkupError, UnknownTagError } from "../core/markup-error";

/**
 * The preview's whole error surface (issues #6 and #8): four closed cases the
 * application must decide what to tell the author about. A discriminated union
 * rather than an error-handling library (ADR-0004) -- adding a case here makes
 * every switch over `.kind` fail to compile until it is handled, which is what
 * "matched exhaustively" buys. `unreadable-file` is issue #1's third named error
 * case, "a file that cannot be read as a book" -- it belongs in this union, not a
 * separate type, so loading a file is reported through the same closed surface as
 * every other thing that can go wrong on the way to a repaint.
 */
export type PreviewError =
  | { readonly kind: "markup-error"; readonly message: string; readonly line: number }
  | { readonly kind: "unknown-tag"; readonly tag: string; readonly line: number }
  | { readonly kind: "pagination-failure"; readonly message: string }
  | { readonly kind: "unreadable-file"; readonly message: string };

/**
 * Classifies whatever `renderBook` threw, the pagination adapter rejected with, or
 * `loadBookFile` rejected with, into the closed set above. `renderBook` is the
 * only source of the first two cases; `loadBookFile` is the only source of the
 * fourth; anything else reaching a repaint's failure path is the pagination
 * engine, the only other thing that can fail a repaint.
 */
export function toPreviewError(error: unknown): PreviewError {
  if (error instanceof UnknownTagError) {
    return { kind: "unknown-tag", tag: error.tag, line: error.line };
  }
  if (error instanceof MarkupError) {
    return { kind: "markup-error", message: error.message, line: error.line };
  }
  if (error instanceof UnreadableBookFileError) {
    return { kind: "unreadable-file", message: error.message };
  }
  return { kind: "pagination-failure", message: error instanceof Error ? error.message : String(error) };
}

/**
 * What the author reads in the status bar. Exhaustive over every `PreviewError`
 * case: the `never` assignment in the default branch is a compile-time check that
 * every case above is handled here, and the throw is what that check becomes at
 * runtime if a case ever slips past the type system.
 */
export function describePreviewError(error: PreviewError): string {
  switch (error.kind) {
    case "markup-error":
      return `line ${error.line}: ${error.message}`;
    case "unknown-tag":
      return `line ${error.line}: <${error.tag}> is not a tag this editor recognizes`;
    case "pagination-failure":
      return `the pagination engine could not lay out the book: ${error.message}`;
    case "unreadable-file":
      return error.message;
    default: {
      const exhaustive: never = error;
      throw new Error(`unhandled preview error kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * What the author reads when printing itself fails, sharing the same closed
 * union -- a broken book is the same broken book whether the preview or the
 * print button noticed it -- but its own wording, never the repaint's.
 * `toPreviewError` is reused as the print handler's classifier too: the same
 * split (core's two thrown errors, a failed file load, or "something else")
 * applies to printing's own failure just as much as a repaint's. A
 * `pagination-failure` case here did not actually come from the pagination
 * engine, though -- printing.ts's own rejection message already names printing,
 * not pagination, so it is used as-is rather than wrapped in
 * `describePreviewError`'s pagination-specific text. `unreadable-file` can never
 * actually reach this function -- printing has no file to load -- but the
 * branch is required for the same reason the others are: the union is closed,
 * and every switch over it is checked exhaustively.
 */
export function describePrintError(error: PreviewError): string {
  switch (error.kind) {
    case "markup-error":
      return `line ${error.line}: ${error.message}`;
    case "unknown-tag":
      return `line ${error.line}: <${error.tag}> is not a tag this editor recognizes`;
    case "pagination-failure":
      return error.message;
    case "unreadable-file":
      return error.message;
    default: {
      const exhaustive: never = error;
      throw new Error(`unhandled preview error kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}
