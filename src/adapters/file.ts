/**
 * The exchange format for a book (CONTEXT.md's "saved file"): a browser reading and
 * writing a local file, no server involved. A book's source already names its own
 * theme -- `<Book theme="default-ru">` is part of the text itself (see
 * `core/parse-book.ts`) -- so carrying the source is carrying the theme; nothing
 * about the theme is serialized a second time.
 *
 * The envelope beyond the bare source exists for one reason: `parseBook` accepts
 * almost any string as a valid book (bare prose with no `<Book>` wrapper is a
 * complete book, sized by `DEFAULT_PAGE_SIZE`), so a `.txt` file would never be
 * reported as "not a book" -- it would just render as an odd one. The `format`
 * marker below is what lets `loadBookFile` tell a Grimoire Press save apart from
 * an unrelated file (a PDF, an image, someone else's JSON) and reject the latter
 * the way issue #1's error surface requires: "a file that cannot be read as a book."
 */
/** Exported for the tests that assemble a lookalike or malformed envelope --
 * production code that names it is `downloadBook` and `loadBookFile` below. */
export const FILE_FORMAT = "grimoire-press-book";
const FILE_FORMAT_VERSION = 1;
const DOWNLOAD_FILENAME = "book.grimoire.json";

interface SavedBookFile {
  readonly format: typeof FILE_FORMAT;
  readonly version: number;
  readonly source: string;
}

/** Thrown by `loadBookFile` for anything that isn't a Grimoire Press save --
 * unparsable JSON, valid JSON of the wrong shape, or a missing/mismatched
 * `format` marker. Classified into `PreviewError`'s `unreadable-file` case by
 * `app/preview-error.ts`, never surfaced to the author as a raw exception. */
export class UnreadableBookFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadableBookFileError";
  }
}

/**
 * Downloads a book's source as a single file the author can keep, back up, or put
 * in version control (issue #1's story 25-27). There is no server: the file is
 * built in memory and handed to the browser as a blob URL, the same technique
 * `adapters/pagination.ts` already uses to hand Vivliostyle a document that only
 * ever existed in memory.
 */
export function downloadBook(source: string): void {
  const payload: SavedBookFile = { format: FILE_FORMAT, version: FILE_FORMAT_VERSION, source };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = DOWNLOAD_FILENAME;
    anchor.click();
  } finally {
    // Revoking on the next task rather than synchronously: some browsers start the
    // download's navigation asynchronously off the anchor click, and revoking the
    // blob URL before that navigation reads it would turn the download into an
    // empty file.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Reads a previously downloaded file back into a book's source. Rejects with
 * `UnreadableBookFileError` -- never lets a malformed or unrelated file reach the
 * caller as some other kind of failure -- for anything that isn't a Grimoire Press
 * save: unreadable bytes, JSON that doesn't parse, or JSON missing the shape above.
 *
 * Deliberately does not also validate the book markup inside `source` -- a file
 * that is a genuine Grimoire Press save but whose markup is broken is not "not a
 * book," and is left to the normal preview error path (issue #6) once its source
 * reaches the editor, the same as if the author had typed the same mistake by hand.
 */
export async function loadBookFile(file: File): Promise<string> {
  let text: string;
  try {
    // `File.text()` decodes UTF-8 non-fatally: an invalid byte sequence becomes
    // U+FFFD replacement characters rather than a rejection, which would load a
    // file corrupted in transit as a "book" full of replacement characters and
    // tell the author nothing. Decoding the raw bytes with `fatal: true` turns
    // that corruption into the same `UnreadableBookFileError` a shape mismatch
    // already produces, instead of a silent, wrong book.
    const bytes = await file.arrayBuffer();
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new UnreadableBookFileError(
      `"${file.name}" could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UnreadableBookFileError(`"${file.name}" is not a Grimoire Press book file`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as Record<string, unknown>).format !== FILE_FORMAT ||
    typeof (parsed as Record<string, unknown>).source !== "string"
  ) {
    throw new UnreadableBookFileError(`"${file.name}" is not a Grimoire Press book file`);
  }

  return (parsed as SavedBookFile).source;
}
