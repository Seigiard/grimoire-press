import { renderBook } from "../core/render-book";
import type { createEditor, EditorHandle } from "../adapters/editor";
import type { downloadBook, loadBookFile } from "../adapters/file";
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
 * positional parameters: most of them share the same `HTMLElement` type, so
 * transposing two at a call site would compile cleanly and only fail at runtime.
 * This is a plain record of references, not a dependency container that resolves
 * anything -- ADR-0004 forbids the latter, not the former; the adapter functions
 * below stay separate arguments.
 */
export interface AppElements {
  readonly editorContainer: HTMLElement;
  readonly previewContainer: HTMLElement;
  readonly printControl: HTMLElement;
  readonly refreshControl: HTMLElement;
  readonly autoRefreshControl: HTMLInputElement;
  readonly statusContainer: HTMLElement;
  readonly downloadControl: HTMLElement;
  readonly loadControl: HTMLInputElement;
}

/**
 * The draft store, bundled the same way `AppElements` bundles DOM references and
 * for the same reason: `read` and `write` are two functions that would otherwise
 * sit as adjacent, identically-shaped parameters next to `downloadBookAdapter`
 * below (both `(source: string) => void` -- or, for `read`, close enough that a
 * transposition still compiles). Naming the two fields is what makes the
 * compiler catch a swap instead of running it: an object isn't assignable where
 * a bare function is expected, so mixing this up with `downloadBookAdapter` or
 * `loadBookFileAdapter` fails to typecheck rather than silently downloading the
 * draft or saving the book into local storage.
 */
export interface PersistenceAdapter {
  readonly read: () => string | undefined;
  readonly write: (source: string) => void;
}

/**
 * Wires the editor, pagination, and printing adapters to core's pure rendering. Each
 * adapter arrives as its own parameter, not a bundled options object or a container:
 * three seams, three arguments (ADR-0004).
 *
 * Persistence is delegated to a `read`/`write` adapter pair that reads and writes
 * the draft to browser storage. `write` is responsible for debouncing.
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
 *
 * Downloading and loading a book (issue #8) are wired the same way: two more
 * adapter functions, each its own parameter. Loading replaces the editor's whole
 * buffer -- through `EditorHandle.setSource`, so it flows through the same
 * `onChange` a keystroke would and is persisted as the new draft the same way --
 * after the author confirms, since there is no way back from replacing a book
 * other than CodeMirror's own undo history. The confirmation is asked only once
 * the file has already been read and validated, so declining it is the only way a
 * load has any visible effect on a book that turns out fine; a file this editor
 * cannot read as a book never reaches the question at all.
 */
export function startApp(
  elements: AppElements,
  createEditorAdapter: typeof createEditor,
  paginateAdapter: typeof paginate,
  printBookAdapter: typeof printBook,
  persistenceAdapter: PersistenceAdapter,
  downloadBookAdapter: typeof downloadBook,
  loadBookFileAdapter: typeof loadBookFile,
): EditorHandle {
  const {
    editorContainer,
    previewContainer,
    printControl,
    refreshControl,
    autoRefreshControl,
    statusContainer,
    downloadControl,
    loadControl,
  } = elements;

  // The preview's staleness, a print failure, and a failed file load are three
  // independent things an author can be told about at once (issue #6's third
  // handed-over defect: a shared status sink let a repaint that succeeded
  // silently erase a print error nobody had acknowledged yet). Each is tracked
  // and rendered on its own, so clearing one never touches the others.
  let previewError: PreviewError | undefined;
  let printError: PreviewError | undefined;
  let loadError: PreviewError | undefined;

  const renderStatus = (): void => {
    const parts: string[] = [];
    if (previewError !== undefined) parts.push(`Preview is out of date — ${describePreviewError(previewError)}`);
    if (printError !== undefined) parts.push(`Printing failed — ${describePrintError(printError)}`);
    if (loadError !== undefined) parts.push(`Loading file failed — ${describePreviewError(loadError)}`);
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

  const setLoadStatus = (error: PreviewError | undefined): void => {
    loadError = error;
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

  const initialSource = persistenceAdapter.read() ?? INITIAL_SOURCE;

  // No separate copy of the source is kept: CodeMirror's own buffer is the one
  // copy, read back through `editor.getSource()` wherever the latest text is
  // needed (ADR-0004 -- nothing derivable from the editor's own state is stored
  // a second time).
  const onChange = (source: string): void => {
    persistenceAdapter.write(source);
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

  downloadControl.addEventListener("click", () => {
    downloadBookAdapter(editor.getSource());
  });

  // Picking a second file before the first has finished reading must never let
  // the first's result land after the second's and overwrite it -- the same
  // overlapping-async hazard issue #6 solved for repaints, reapplied here: each
  // selection gets its own token, and a result is only ever applied if its token
  // is still the most recent one requested. Unlike the repaint queue, a stale
  // result needs no replay -- there is nothing to coalesce into, since the
  // newer selection is already what the author meant to load -- so it is simply
  // discarded.
  let loadToken = 0;

  loadControl.addEventListener("change", () => {
    const file = loadControl.files?.[0];
    // Cleared unconditionally so choosing the very same file again still fires a
    // 'change' event -- the browser does not consider re-picking an unchanged
    // value a change otherwise.
    loadControl.value = "";
    if (!file) return;

    const token = ++loadToken;

    loadBookFileAdapter(file)
      .then((source) => {
        if (token !== loadToken) return; // superseded by a later selection

        // Asked only now that the file is known to be a genuine book: an author
        // who picks the wrong file entirely is told so without first being asked
        // whether to discard their current work over it.
        const proceed = window.confirm("Loading this file replaces the book you are currently editing. Continue?");
        if (!proceed) return;

        // `setSource` fires the same update listener a keystroke would, which
        // arms a debounced repaint of its own when auto-refresh is on -- cleared
        // here, after the fact, so the immediate repaint below is the only one
        // that runs. Clearing before `setSource` would not help: the debounce it
        // is meant to cancel is armed by `setSource` itself, one line later.
        editor.setSource(source);
        clearScheduledRepaint();
        requestRepaint(source);
        // Both belonged to the book this load just replaced.
        setPrintStatus(undefined);
        setLoadStatus(undefined);
      })
      .catch((error: unknown) => {
        if (token !== loadToken) return; // superseded by a later selection
        setLoadStatus(toPreviewError(error));
      });
  });

  requestRepaint(initialSource);

  return editor;
}
