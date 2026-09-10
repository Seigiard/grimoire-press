import type { Book } from "../core/book";
import { renderBook } from "../core/render-book";
import type { createEditor, EditorHandle } from "../adapters/editor";
import type { paginate } from "../adapters/pagination";
import type { printBook } from "../adapters/printing";

const INITIAL_SOURCE = "# Untitled book\n\nStart writing your book here.\n";

/**
 * Wires the editor, pagination, and printing adapters to core's pure rendering. Each
 * adapter arrives as its own parameter, not a bundled options object or a container:
 * three seams, three arguments (ADR-0004).
 *
 * State outside the editor's own buffer is exactly one string, the latest rendered
 * markup, kept so the print control always prints what the preview last showed.
 */
export function startApp(
  editorContainer: HTMLElement,
  previewContainer: HTMLElement,
  printControl: HTMLElement,
  createEditorAdapter: typeof createEditor,
  paginateAdapter: typeof paginate,
  printBookAdapter: typeof printBook,
): EditorHandle {
  let latestMarkup = renderBook({ source: INITIAL_SOURCE });

  const repaint = (source: string): void => {
    const book: Book = { source };
    latestMarkup = renderBook(book);
    void paginateAdapter(previewContainer, latestMarkup);
  };

  const editor = createEditorAdapter(editorContainer, INITIAL_SOURCE, repaint);
  printControl.addEventListener("click", () => printBookAdapter(latestMarkup));

  void paginateAdapter(previewContainer, latestMarkup);

  return editor;
}
