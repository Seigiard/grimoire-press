/**
 * Both calls this application makes into the pagination engine guard a resource
 * that is released only when the call settles: printing's single-flight guard and
 * the repaint scheduler's running flag. Neither call had a time bound, so an
 * engine that stalled once stayed stalled -- printing stopped opening dialogues
 * and the preview froze on its last render, for the rest of the session, with
 * nothing said about it (issue #10).
 *
 * A bound turns that permanent failure into a temporary one. It cannot do more
 * than that: `CoreViewer` in @vivliostyle/core 2.45.1 exposes no teardown method
 * at all, so nothing here aborts the work the engine is still doing. Releasing
 * this application's own guard is the whole of the fix, and it is why both
 * adapters below also have to survive the engine answering late, for a run they
 * already gave up on.
 */

/** Thrown by an adapter whose call into the engine went unanswered for its whole
 * bound. Distinct from the engine *failing*: a book the engine refuses to lay out
 * is a book the author can fix by editing it, while an engine that does not answer
 * leaves the markup entirely innocent and is resolved by reloading. Classified into
 * `PreviewError`'s `engine-timeout` case by `app/preview-error.ts`, which is where
 * the difference is put to the author in words. */
export class EngineTimeoutError extends Error {
  /** The bound that elapsed, in seconds -- carried so each status surface can say
   * how long it waited without repeating the number the adapter chose. */
  readonly seconds: number;

  constructor(seconds: number) {
    super(`the engine did not answer within ${seconds} seconds`);
    this.name = "EngineTimeoutError";
    this.seconds = seconds;
  }
}
