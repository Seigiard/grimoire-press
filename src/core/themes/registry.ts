import { defaultRuTheme } from "./default-ru/theme";
import type { Theme } from "./theme";

/**
 * Every theme a book's `<Book theme="…">` can name. One entry today
 * (CONTEXT.md's "multiple themes" is explicitly out of scope for this
 * version); `parse-book.ts` looks a declared name up here and rejects
 * anything this registry does not carry.
 */
const THEMES: Readonly<Record<string, Theme>> = {
  [defaultRuTheme.name]: defaultRuTheme,
};

export function getTheme(name: string): Theme | undefined {
  return THEMES[name];
}
