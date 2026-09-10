import { renderBook } from "../core/render-book";
import type { createEditor, EditorHandle } from "../adapters/editor";
import type { paginate } from "../adapters/pagination";
import type { printBook } from "../adapters/printing";
import { describePreviewError, toPreviewError, type PreviewError } from "./preview-error";

const INITIAL_SOURCE = "# Untitled book\n\nStart writing your book here.\n";

// How long the preview waits after the last keystroke before it repaints. Long
// enough that a normal typing cadence never triggers a repaint mid-word, short
// enough that a pause reads as "done for now" rather than a stall.
const REFRESH_DEBOUNCE_MS = 400;

/**
 * Wires the editor, pagination, and printing adapters to core's pure rendering. Each
 * adapter arrives as its own parameter, not a bundled options object or a container:
 * four seams, four arguments (ADR-0004).
 *
 * Persistence is delegated to an adapter function that reads and writes the draft
 * to browser storage. The adapter is responsible for debouncing writes.
 *
 * Nothing outside the editor's own buffer is stored. The preview markup is derived
 * whenever it is needed, to repaint and to print alike, which is the state model
 * ADR-0004 records.
 *
 * The preview's own refresh is a second, independent debounce (issue #6): typing
 * always updates the persisted draft on its own schedule, but only schedules a
 * repaint when automatic refreshing is on. A repaint request while one is already
 * running never starts a second one -- it replaces whatever request was already
 * waiting and is picked up the moment the running one settles, so two repaints are
 * never in flight together and the last request made is always the last one that
 * reaches the container (issue #6's first handed-over defect: overlapping repaints
 * had no cancellation, so a slow one could finish after, and clobber, a faster
 * newer one).
 */
export function startApp(
  editorContainer: HTMLElement,
  previewContainer: HTMLElement,
  printControl: HTMLElement,
  refreshControl: HTMLElement,
  autoRefreshControl: HTMLInputElement,
  statusContainer: HTMLElement,
  createEditorAdapter: typeof createEditor,
  paginateAdapter: typeof paginate,
  printBookAdapter: typeof printBook,
  persistRead: () => string | undefined,
  persistWrite: (source: string) => void,
): EditorHandle {
  const setStatus = (error: PreviewError | undefined): void => {
    if (error === undefined) {
      statusContainer.textContent = "";
      statusContainer.hidden = true;
      return;
    }
    // The preview on screen is whatever the last successful repaint left there --
    // never blanked by this call -- so the message must say it is stale, not that
    // it is wrong.
    statusContainer.textContent = `Preview is out of date — ${describePreviewError(error)}`;
    statusContainer.hidden = false;
  };

  let running = false;
  let pendingSource: string | undefined;

  function afterRun(): void {
    running = false;
    if (pendingSource !== undefined) {
      const next = pendingSource;
      pendingSource = undefined;
      run(next);
    }
  }

  function run(source: string): void {
    running = true;
    let html: string;
    try {
      html = renderBook({ source });
    } catch (error) {
      // Thrown before the pagination adapter is ever called, so the container --
      // and whatever it last showed -- is never touched.
      setStatus(toPreviewError(error));
      afterRun();
      return;
    }
    void paginateAdapter(previewContainer, html)
      .then(() => setStatus(undefined))
      .catch((error: unknown) => setStatus(toPreviewError(error)))
      .finally(afterRun);
  }

  const requestRepaint = (source: string): void => {
    if (running) {
      pendingSource = source;
      return;
    }
    run(source);
  };

  let debounceId: ReturnType<typeof setTimeout> | undefined;
  const scheduleRepaint = (source: string): void => {
    if (debounceId !== undefined) clearTimeout(debounceId);
    debounceId = setTimeout(() => {
      debounceId = undefined;
      requestRepaint(source);
    }, REFRESH_DEBOUNCE_MS);
  };

  const initialSource = persistRead() ?? INITIAL_SOURCE;
  let latestSource = initialSource;

  const onChange = (source: string): void => {
    latestSource = source;
    persistWrite(source);
    if (autoRefreshControl.checked) {
      scheduleRepaint(source);
    }
  };

  const editor = createEditorAdapter(editorContainer, initialSource, onChange);

  refreshControl.addEventListener("click", () => {
    // A manual refresh acts on the latest source immediately -- a pending
    // automatic one would otherwise still fire moments later on the same source.
    if (debounceId !== undefined) {
      clearTimeout(debounceId);
      debounceId = undefined;
    }
    requestRepaint(latestSource);
  });

  autoRefreshControl.addEventListener("change", () => {
    if (autoRefreshControl.checked) {
      requestRepaint(latestSource);
    }
  });

  printControl.addEventListener("click", () => {
    let html: string;
    try {
      html = renderBook({ source: editor.getSource() });
    } catch (error) {
      setStatus(toPreviewError(error));
      return;
    }
    printBookAdapter(html).catch((error: unknown) => {
      setStatus(toPreviewError(error));
    });
  });

  requestRepaint(initialSource);

  return editor;
}
