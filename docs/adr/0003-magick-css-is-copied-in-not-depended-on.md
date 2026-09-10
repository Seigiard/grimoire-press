# The base stylesheet is copied into this repository, not depended on

The look of the default theme starts from magick.css, a classless stylesheet whose
book-like measure, restrained ornament and margin notes suit a rulebook. We copied the
file into this repository under its MIT licence and edit it directly, rather than
installing it as a dependency.

## Why copying is the right shape here

Three of its properties would each force us to override it, and together they leave
little of the original intact.

It has no print support of any kind. There is no `@page` rule, no print media block, no
control over page or column breaks, and no widow or orphan handling. It also carries
constructs that misbehave on paper: margin notes floated with negative offsets, hidden
vertical overflow on preformatted text and quotations, and a dark colour scheme that
follows the reader's system preference and would invert a printed page.

Its two principal typefaces, used for body text and for every heading, cover the Latin
alphabet only. A Russian book cannot be set in them, and the typefaces are written into
the stylesheet as literals rather than exposed as variables, so replacing them means
rewriting selectors.

Its theming surface is five custom properties, all of them colours. Sizes, spacing and
the width of the text column are literals, and the author notes that the column width is
duplicated in a media query and cannot be changed in one place.

The project has also had no commits since June 2024.

## Consequences

We own the file. Updates from upstream will not arrive, and we do not expect any.

The stylesheet loads its typefaces from Google Fonts through an `@import`, which is a
blocking request to another host. We remove it and serve the typefaces ourselves. This
also removes three families the theme never uses.

Typefaces ship in this repository under the SIL Open Font License, which requires their
licence file to travel with them.
