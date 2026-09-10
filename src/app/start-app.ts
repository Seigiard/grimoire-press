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
 * Nothing outside the editor's own buffer is stored. The preview markup is derived
 * whenever it is needed, to repaint and to print alike, which is the state model
 * ADR-0004 records.
 */
export function startApp(
  editorContainer: HTMLElement,
  previewContainer: HTMLElement,
  printControl: HTMLElement,
  createEditorAdapter: typeof createEditor,
  paginateAdapter: typeof paginate,
  printBookAdapter: typeof printBook,
): EditorHandle {
  const repaint = (source: string): void => {
    const book: Book = { source };
    // A pagination failure reaches the console only. Reporting it to the author is
    // issue #6, which owns the preview's error surface.
    void paginateAdapter(previewContainer, renderBook(book)).catch((error: unknown) => {
      console.error(error);
    });
  };

  const editor = createEditorAdapter(editorContainer, INITIAL_SOURCE, repaint);
  printControl.addEventListener("click", () => {
    printBookAdapter(renderBook({ source: editor.getSource() }));
  });

  repaint(INITIAL_SOURCE);

  return editor;
}
