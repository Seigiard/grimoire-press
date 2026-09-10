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
 * Creates a debounced write function for the draft.
 * Delays writes to localStorage until 1 second after the last change,
 * reducing writes on rapid typing.
 * Gracefully handles localStorage being unavailable or full.
 */
export function createDebouncedPersist(): (source: string) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (source: string): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, source);
      } catch {
        // localStorage is unavailable or full; silently fail.
        // The author can still work in the current session; the draft just won't persist.
      }
      timeoutId = null;
    }, DEBOUNCE_MS);
  };
}
