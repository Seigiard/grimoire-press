import alegreya from "./fonts/alegreya/Alegreya.woff2?inline";
import alegreyaItalic from "./fonts/alegreya/Alegreya-Italic.woff2?inline";
import vollkorn from "./fonts/vollkorn/Vollkorn.woff2?inline";
import vollkornItalic from "./fonts/vollkorn/Vollkorn-Italic.woff2?inline";
import type { Theme } from "../theme";
import magickCss from "./magick.css?raw";

/**
 * Vollkorn (body) and Alegreya (headings), both variable fonts covering
 * Cyrillic and Latin in the same face -- see `magick.css`'s header for why
 * these replace magick.css's original two typefaces, and CONTEXT.md's Theme
 * entry for why one face per role, not one face per alphabet, is the point.
 *
 * `?inline` (Vite's own asset-import suffix, not a project convention) turns
 * each WOFF2 file into a base64 `data:` URI at import time. That is the
 * self-hosting: the finished document embeds the font bytes directly in its
 * `<style>`, so nothing -- preview, print, or a test loading this HTML
 * standalone -- ever issues a request for a typeface, to this host or any
 * other. `?raw` does the equivalent for magick.css: its text, unmodified by
 * any bundler transform, ends up verbatim in the theme's CSS.
 */
const FONT_FACES = `
@font-face {
  font-family: "Vollkorn";
  src: url("${vollkorn}") format("woff2");
  font-weight: 400 900;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Vollkorn";
  src: url("${vollkornItalic}") format("woff2");
  font-weight: 400 900;
  font-style: italic;
  font-display: swap;
}
@font-face {
  font-family: "Alegreya";
  src: url("${alegreya}") format("woff2");
  font-weight: 400 900;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Alegreya";
  src: url("${alegreyaItalic}") format("woff2");
  font-weight: 400 900;
  font-style: italic;
  font-display: swap;
}
`;

/**
 * `lang: "ru"` is this theme's own declared language, not a book's. There is
 * currently no `<Book>` attribute that lets an author set or override a
 * book's language -- CONTEXT.md's "a theme may supply a default so the
 * author need not write one" describes the other half of that design, the
 * override, which is deliberately not built here. Parsing "ru" out of the
 * theme's own *name* was considered and rejected: a theme name is a name,
 * not a data structure a future rename would silently break. This field is
 * the smallest thing that makes `<Book theme="default-ru">` hyphenate
 * correctly today; a book-level override is future work, flagged in this
 * ticket's report for the user to confirm rather than decided here.
 */
export const defaultRuTheme: Theme = {
  name: "default-ru",
  lang: "ru",
  css: FONT_FACES + magickCss,
};
