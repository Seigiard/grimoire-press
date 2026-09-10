# A book may contain raw HTML and inline CSS

A book's source is Markdown prose plus a small closed vocabulary: `<Book>`, `<Section>`,
`<PageBreak>`, `<ColumnBreak>`. Anything else that is tag-shaped raises an unknown-tag
error the author can act on. That is the vocabulary the editor promises to understand.

It has never been the whole truth. The unknown-tag check matches only a **capitalized**
element alone on its own line, so `<div>` is not tag-shaped as far as the parser is
concerned, and Markdown rendering passes an HTML block through unescaped. An author can
already write `<div style="position: absolute; top: 40mm">` today and have it land in the
finished document verbatim. Verified against `renderBook`: the raw element survives and
nothing is escaped.

We are keeping that open, deliberately, and this ADR is the decision rather than the
accident.

## Why

A `Page` is a canvas: exactly one physical page whose arrangement the author composes,
for a character sheet or a reference card, where the arrangement itself is the content.
Composing a layout is what HTML and CSS are for. Inventing a tag vocabulary for
placement would reinvent CSS, worse, and would have to grow a new tag every time an
author wanted something it had not anticipated.

Closing the door instead would break books already written against the behaviour, and
would buy a guarantee we would then immediately have to sell back to make `Page` useful.

## What it costs

The vocabulary stops being closed, and that property was worth something. An author who
mistypes a lowercase element gets whatever the browser makes of it rather than an error
naming the line. The unknown-tag error stays a capitalized-element check, which now reads
as a deliberate boundary rather than an oversight.

A book file loaded from disk carries whatever markup its author put there, straight into
the preview. The editor is local and single-user, so today this is latent rather than
live, but a book is a file people can send each other, and the day that starts happening
this decision is what makes it a question.

`Component` in `CONTEXT.md` has to be designed knowing this. If an author can already
write HTML and CSS, a component earns its keep by having a name and being reusable, not
by making an arrangement possible in the first place.

## Not decided here, deliberately

How an author writes styles without repeating `style="..."` on every element. For now
they repeat it. We measured the alternatives first rather than deferring blindly, and the
measurement is why we are waiting.

UnoCSS fits mechanically: it is DOM-free, its arbitrary-value syntax expresses `top: 40mm`
exactly, and the millimetres survive both Vivliostyle and the print path to within 0.04%.
It costs 182.61 kB of bundle (49.70 kB gzipped), turns `renderBook` into an async
function, and its named spacing and type scale means something other than its
documentation says, because this theme sets `html { font-size: 62.5% }`. Its
`break-before-page` and `columns-3` utilities also give an author a second way to break a
page and set a column count, beside `<PageBreak />` and `<Section columns>`, which the
parser does not see.

And it does not buy what it was wanted for. Measured on the same elements, a positioned
canvas is 104 characters as inline style, 89 with UnoCSS classes, and 91 with a
hand-written sheet of named classes plus custom properties for the numbers. The saving is
in property *names*. The numbers are what a rulebook varies from element to element, and
`top-[40mm]` is no shorter than `--y:40mm`.

So no vocabulary ships until books have been written with the raw form and we know which
repetitions actually hurt. Designing a vocabulary before that is guessing at what an
author will run out of.

A hand-written sheet remains the cheapest route if one is wanted later: 18 lines, 1237
bytes, verified through the real engine to compute identically to UnoCSS on every value
tested.
