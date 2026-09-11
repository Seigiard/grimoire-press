/**
 * A book's complete visual identity (CONTEXT.md's Theme): the typefaces --
 * and therefore which alphabets a book can be set in -- plus every rule that
 * gives the printed page its look. `css` is embedded verbatim into the
 * document `render-book.ts` builds; nothing here reaches out to the browser,
 * so a theme is exactly as portable as the rest of core. Page size is not part
 * of that identity: the renderer puts the Book's declaration in a higher-priority
 * ownership layer than any conflicting `@page size` in this CSS (issue #28).
 *
 * `lang` is the theme's own declared language, used only to pick a
 * hyphenation dictionary (`html[lang="…"]` in `render-book.ts`) -- a
 * different job from `css`, which is what actually selects typefaces. A
 * theme names one language because nothing yet lets a book override it; see
 * `default-ru/theme.ts` for why that is deliberately not solved here.
 */
export interface Theme {
  readonly name: string;
  readonly css: string;
  readonly lang: string;
}
