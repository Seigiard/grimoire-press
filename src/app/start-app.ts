import { renderBook } from "../core/render-book";
import type { createEditor, EditorHandle } from "../adapters/editor";
import type { paginate } from "../adapters/pagination";
import type { printBook } from "../adapters/printing";
import { describePreviewError, describePrintError, toPreviewError, type PreviewError } from "./preview-error";

const INITIAL_SOURCE = "# Untitled book\n\nStart writing your book here.\n";

// How long the preview waits after the last keystroke before it repaints. Long
// enough that a normal typing cadence never triggers a repaint mid-word, short
// enough that a pause reads as "done for now" rather than a stall.
const REFRESH_DEBOUNCE_MS = 400;

/**
 * The DOM elements the app is wired to. Bundled as one named record rather than
 * six positional parameters: five of them share the same `HTMLElement` type, so
 * transposing two at a call site would compile cleanly and only fail at runtime.
 * This is a plain record of references, not a dependency container that resolves
 * anything -- ADR-0004 forbids the latter, not the former; the three adapter
 * functions below stay separate arguments.
 */
export interface AppElements {
  readonly editorContainer: HTMLElement;
  readonly previewContainer: HTMLElement;
  readonly printControl: HTMLElement;
  readonly refreshControl: HTMLElement;
  readonly autoRefreshControl: HTMLInputElement;
  readonly statusContainer: HTMLElement;
}

/**
 * Wires the editor, pagination, and printing adapters to core's pure rendering. Each
 * adapter arrives as its own parameter, not a bundled options object or a container:
 * three seams, three arguments (ADR-0004).
 *
 * Persistence is delegated to an adapter function that reads and writes the draft
 * to browser storage. The adapter is responsible for debouncing writes.
 *
 * The preview markup is derived whenever it is needed, to repaint and to print
 * alike, rather than stored -- ADR-0004's derived-state model, amended to record
 * the scheduling state this ticket adds (see the ADR itself for why the
 * conclusion still holds).
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
  elements: AppElements,
  createEditorAdapter: typeof createEditor,
  paginateAdapter: typeof paginate,
  printBookAdapter: typeof printBook,
  persistRead: () => string | undefined,
  persistWrite: (source: string) => void,
): EditorHandle {
  const { editorContainer, previewContainer, printControl, refreshControl, autoRefreshControl, statusContainer } = elements;

  // The preview's staleness and a print failure are two independent things an
  // author can be told about at once (issue #6's third handed-over defect: a
  // shared status sink let a repaint that succeeded silently erase a print
  // error nobody had acknowledged yet). Each is tracked and rendered on its own,
  // so clearing one never touches the other.
  let previewError: PreviewError | undefined;
  let printError: PreviewError | undefined;

  const renderStatus = (): void => {
    const parts: string[] = [];
    if (previewError !== undefined) parts.push(`Preview is out of date — ${describePreviewError(previewError)}`);
    if (printError !== undefined) parts.push(`Printing failed — ${describePrintError(printError)}`);
    statusContainer.textContent = parts.join(" ");
    statusContainer.hidden = parts.length === 0;
  };

  const setPreviewStatus = (error: PreviewError | undefined): void => {
    previewError = error;
    renderStatus();
  };

  const setPrintStatus = (error: PreviewError | undefined): void => {
    printError = error;
    renderStatus();
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
      setPreviewStatus(toPreviewError(error));
      afterRun();
      return;
    }
    void paginateAdapter(previewContainer, html)
      .then(() => setPreviewStatus(undefined))
      .catch((error: unknown) => setPreviewStatus(toPreviewError(error)))
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
  const clearScheduledRepaint = (): void => {
    if (debounceId !== undefined) {
      clearTimeout(debounceId);
      debounceId = undefined;
    }
  };
  const scheduleRepaint = (source: string): void => {
    clearScheduledRepaint();
    debounceId = setTimeout(() => {
      debounceId = undefined;
      requestRepaint(source);
    }, REFRESH_DEBOUNCE_MS);
  };

  const initialSource = persistRead() ?? INITIAL_SOURCE;

  // No separate copy of the source is kept: CodeMirror's own buffer is the one
  // copy, read back through `editor.getSource()` wherever the latest text is
  // needed (ADR-0004 -- nothing derivable from the editor's own state is stored
  // a second time).
  const onChange = (source: string): void => {
    persistWrite(source);
    if (autoRefreshControl.checked) {
      scheduleRepaint(source);
    }
  };

  const editor = createEditorAdapter(editorContainer, initialSource, onChange);

  refreshControl.addEventListener("click", () => {
    // A manual refresh acts on the latest source immediately -- a pending
    // automatic one would otherwise still fire moments later on the same source.
    clearScheduledRepaint();
    requestRepaint(editor.getSource());
  });

  autoRefreshControl.addEventListener("change", () => {
    if (autoRefreshControl.checked) {
      requestRepaint(editor.getSource());
    } else {
      // Otherwise a debounce armed the moment before the author switched
      // automatic refreshing off would still fire afterwards, repainting once
      // more despite being told not to.
      clearScheduledRepaint();
    }
  });

  printControl.addEventListener("click", () => {
    let html: string;
    try {
      html = renderBook({ source: editor.getSource() });
    } catch (error) {
      setPrintStatus(toPreviewError(error));
      return;
    }
    printBookAdapter(html)
      .then(() => setPrintStatus(undefined))
      .catch((error: unknown) => setPrintStatus(toPreviewError(error)));
  });

  requestRepaint(initialSource);

  return editor;
}
