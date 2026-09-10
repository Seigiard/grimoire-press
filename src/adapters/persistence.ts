/**
 * Browser persistence adapter for the editor's draft.
 */

/**
 * Reads the stored draft from localStorage.
 * Returns undefined if no draft is stored, or if the value is corrupt/unreadable.
 * Gracefully handles localStorage being unavailable (private browsing, full storage).
 */
export function readDraft(): string | undefined {
  try {
    const stored = localStorage.getItem("grimoire:draft");
    if (typeof stored === "string") {
      return stored;
    }
  } catch {
    // localStorage is unavailable or inaccessible (private browsing, quota exceeded, etc.)
  }
  return undefined;
}

/**
 * Writes the draft to localStorage.
 * Gracefully handles localStorage being unavailable or full.
 */
export function writeDraft(source: string): void {
  try {
    localStorage.setItem("grimoire:draft", source);
  } catch {
    // localStorage is unavailable or full; silently fail.
    // The author can still work in the current session; the draft just won't persist.
  }
}
