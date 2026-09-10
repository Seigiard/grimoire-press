/**
 * Browser persistence adapter for the editor's draft.
 */

const STORAGE_KEY = "grimoire:draft";
const DEBOUNCE_MS = 1000;

/**
 * Reads the stored draft from localStorage.
 * Returns undefined if no draft is stored, or if the value is corrupt/unreadable.
 * Gracefully handles localStorage being unavailable (private browsing, full storage).
 */
export function readDraft(): string | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (typeof stored === "string") {
      return stored;
    }
  } catch {
    // localStorage is unavailable or inaccessible (private browsing, quota exceeded, etc.)
  }
  return undefined;
}

/**
 * Creates a debounced write function for the draft. Writes land a second after the
 * last change rather than once per keystroke.
 *
 * The debounce opens a window in which the author's most recent edits exist only in
 * memory, so a pending write is also flushed on `pagehide`. That event fires when the
 * tab closes, when the author navigates away, and when the page enters the back
 * forward cache, which `unload` does not cover. Without the flush, closing the tab
 * within the debounce window loses up to a second of writing.
 */
export function createDebouncedPersist(): (source: string) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pending: string | undefined;

  const write = (source: string): void => {
    try {
      localStorage.setItem(STORAGE_KEY, source);
    } catch (error) {
      // Storage can be full, disabled by policy, or locked out in private browsing.
      // The author keeps working in this session; only persistence is lost, so this
      // is logged rather than raised. Telling the author is issue #6's error surface.
      console.error("Grimoire Press could not save the draft:", error);
    }
  };

  const flush = (): void => {
    if (timeoutId === null) return;
    clearTimeout(timeoutId);
    timeoutId = null;
    if (pending !== undefined) {
      write(pending);
      pending = undefined;
    }
  };

  window.addEventListener("pagehide", flush);

  return (source: string): void => {
    pending = source;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      pending = undefined;
      write(source);
    }, DEBOUNCE_MS);
  };
}
