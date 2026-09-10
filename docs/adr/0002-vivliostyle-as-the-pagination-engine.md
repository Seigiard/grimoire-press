# Vivliostyle paginates the book, not Paged.js

Browsers cannot divide a document into pages well enough on their own, so the editor
needs a pagination engine. The two candidates are Paged.js and Vivliostyle. We chose
Vivliostyle, accepting its AGPL-3.0 licence because this editor is open source.

## Why not the browser alone

Chrome 131 and later render `@page` size, margins and margin boxes natively. It still
does not support `string-set` or `target-counter()`, which are what produce running
headers and page numbers in cross-references and a table of contents. Both are
requirements here, so an engine is not optional.

## Why not Paged.js

Paged.js is MIT-licensed and simpler to embed, and that made it the default expectation.
Two problems decided against it, and both sit on features this project uses every day.

Multi-column layout has several open, unresolved defects: columns across a page boundary,
`break-inside: avoid-page` being ignored, and a list's final item moving to the next page
instead of the next column. A referee's cheat sheet in three columns is the first real
workload this editor will carry.

Since Chrome 131 renders `@page` margin boxes natively, and Paged.js also renders that
same content into the DOM, printing produces every running header twice. The fix is known
and is not merged upstream, so we would carry a patch of our own.

Its npm package has also been sitting on a beta from October 2024 while its source has
moved on, which means installing from a git reference to get current fixes.

## Consequences

The AGPL obliges us to offer the editor's source to anyone using it over the network.
That is the intended shape of this project, so it costs nothing here. It does close the
door on ever making the editor closed source without replacing the engine.

Vivliostyle has an open performance defect where a table of contents built on
`target-counter()` multiplies layout time several-fold on a document of roughly 150
pages. The books this editor is built for are short, tens of pages at most, so the defect
is out of reach. Should long books ever come into scope, measure before committing.

Neither engine composes margin notes, and the specification does not yet cover them. The
base stylesheet offers them, so authors will ask. Treat margin notes as work of our own
whenever they are scheduled.
