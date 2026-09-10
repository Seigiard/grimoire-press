import alegreya400 from "./fonts/alegreya/Alegreya-400.woff2?inline";
import alegreya600 from "./fonts/alegreya/Alegreya-600.woff2?inline";
import alegreyaItalic400 from "./fonts/alegreya/Alegreya-Italic-400.woff2?inline";
import alegreyaItalic600 from "./fonts/alegreya/Alegreya-Italic-600.woff2?inline";
import vollkorn400 from "./fonts/vollkorn/Vollkorn-400.woff2?inline";
import vollkorn600 from "./fonts/vollkorn/Vollkorn-600.woff2?inline";
import vollkornItalic400 from "./fonts/vollkorn/Vollkorn-Italic-400.woff2?inline";
import vollkornItalic600 from "./fonts/vollkorn/Vollkorn-Italic-600.woff2?inline";
import type { Theme } from "../theme";
import magickCss from "./magick.css?raw";

/**
 * Vollkorn (body) and Alegreya (headings), both covering Cyrillic and Latin in
 * the same face -- see `magick.css`'s header for why these replace magick.css's
 * original two typefaces, and CONTEXT.md's Theme entry for why one face per
 * role, not one face per alphabet, is the point.
 *
 * `?inline` (Vite's own asset-import suffix, not a project convention) turns
 * each WOFF2 file into a base64 `data:` URI at import time. That is the
 * self-hosting: the finished document embeds the font bytes directly in its
 * `<style>`, so nothing -- preview, print, or a test loading this HTML
 * standalone -- ever issues a request for a typeface, to this host or any
 * other. `?raw` does the equivalent for magick.css: its text, unmodified by
 * any bundler transform, ends up verbatim in the theme's CSS.
 *
 * Eight files, one per weight and style, rather than the two variable files
 * per family these used to be (issue #9). Both families ship upstream as
 * variable fonts with a 400-900 weight axis, and Chromium's PDF backend
 * refuses to embed any typeface whose file declares variation axes: it writes
 * every glyph as a Type 3 drawing procedure instead of embedding the outline
 * font program, so the printed book carried no real typeface at all. The test
 * is for the presence of the `fvar` table, not for a non-default coordinate,
 * so no `@font-face` declaration can avoid it -- narrowing `font-weight` to a
 * single value was measured and made the PDF 84% larger, because the missing
 * weight was then faked by synthetic emboldening. The only fix is files with
 * no axes, which is what `scripts/build-static-fonts.py` produces from the
 * variable sources kept beside them under each family's `upstream` directory.
 *
 * Every weight and style the theme's own CSS can ask for needs a real file
 * here. A weight with no file is either synthesised by the browser or matched
 * against a file that does not carry it, and either way the face on the page
 * is not the face this theme chose. That is also why none of these declares a
 * weight *range*: a leftover `400 900` is an exact match for 600 and would win
 * over the real 600 file, quietly putting the variable file -- and Type 3 --
 * back on the page.
 */
const FONT_FACES = `
@font-face {
  font-family: "Vollkorn";
  src: url("${vollkorn400}") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Vollkorn";
  src: url("${vollkorn600}") format("woff2");
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Vollkorn";
  src: url("${vollkornItalic400}") format("woff2");
  font-weight: 400;
  font-style: italic;
  font-display: swap;
}
@font-face {
  font-family: "Vollkorn";
  src: url("${vollkornItalic600}") format("woff2");
  font-weight: 600;
  font-style: italic;
  font-display: swap;
}
@font-face {
  font-family: "Alegreya";
  src: url("${alegreya400}") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Alegreya";
  src: url("${alegreya600}") format("woff2");
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: "Alegreya";
  src: url("${alegreyaItalic400}") format("woff2");
  font-weight: 400;
  font-style: italic;
  font-display: swap;
}
@font-face {
  font-family: "Alegreya";
  src: url("${alegreyaItalic600}") format("woff2");
  font-weight: 600;
  font-style: italic;
  font-display: swap;
}
`;

/**
 * Margin-box typography for the running header and page number (issue #5).
 * Margin boxes are part of a book's visual identity -- the running header
 * sits in the same display face as a heading, the page number in the same
 * body face as running text -- so this theme owns it exactly the way it
 * owns `h1`/`h2` and body typefaces below, rather than render-book.ts
 * hardcoding one look for every theme. render-book.ts's own `@page` block
 * only sets the plain-fallback face and size a themeless book keeps; this
 * `@page` block cascades on top of it by the same append-last rule as
 * every other themed CSS in this file.
 */
const MARGIN_BOX_CSS = `
@page {
  @top-center {
    font-family: "Alegreya", cursive;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  @bottom-center {
    font-family: "Vollkorn", serif;
  }
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
  css: FONT_FACES + magickCss + MARGIN_BOX_CSS,
};
