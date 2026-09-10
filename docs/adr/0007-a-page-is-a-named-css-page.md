# A page is a named CSS page, not a canvas element we size ourselves

A `Page` is one physical page whose arrangement the author composes: a character sheet, a
reference card, a table that must sit alone. Two routes were measured against the real
engine.

The obvious one is a block element sized to the page area with `position: relative`, given
`break-before: page` and `break-after: page`. The other is CSS Paged Media's own named
pages: a `@page <name>` rule, and `page: <name>` on the element.

We take the named page. This ADR records the measurements, because both routes work well
enough in a first test that the difference only shows under pressure.

## What the engine actually gave us

Driving `paginate()` with a book of flow text, a named page, and more flow text, no break
declared anywhere:

```
pageCount: 3      pageSizes: 559x794, 794x559, 559x794
margin boxes: [0] top=FLOW bottom=1   [1] none   [2] top=AFTER bottom=3
an absolute box declared top: 40mm; left: 20mm landed at exactly 20mm, 40mm
```

The named page broke the flow on both sides by itself, turned landscape on its own, took
its own zero margins, suppressed its own running header with `@top-center { content: none }`
while the neighbouring pages kept theirs, and let the page counter run through it. The
adapter reported the mixed page sizes correctly.

None of that had to be built. The hand-rolled canvas gets none of it: it needs the page
size restated in CSS, its own break declarations, and it cannot carry a size, a margin or
a margin box of its own at all.

## The trap that decided it

A canvas sized to the page area fragments when a child's top margin collapses through its
top edge. Measured: a canvas holding an `<h2>` with its default margin is pushed 5.24mm
down, no longer fits, splits across two pages, and the author's absolutely positioned
content lands on the **next** page, 4.24mm out of place. `break-inside: avoid` does not
prevent it. `margin: 0` on the child, `display: flow-root` and `overflow: hidden` each do.

So the hand-rolled route asks an author to know about margin collapsing to keep their
character sheet on one page. A named page's own geometry is never the thing that
overflows, so it cannot fail this way.

## What the named page does not give us

It is a page *style*, not a page *quota*. A named page holding fourteen paragraphs
produced two pages, both carrying the named page's own margin box. So "exactly one page"
remains ours to check, by counting the pages the content occupied, exactly as decided
before this measurement.

The renderer emits the `position: relative` wrapper that makes `top`/`left` inside a page
mean what the author expects. Leaving that to the author would make `Page` worth no more
than a `div`.

## Content pushed off the sheet is not reported

Measured: content positioned past the page box is laid out, gets real coordinates, and is
then clipped by the engine's bleed box. It is absent from the printed PDF and it does not
change the page count. Content that lands in the *margin* prints normally.

We are not detecting this. Overflow is caught by counting pages, which is cheap; clipping
would need the geometry of every element on every page, which is not, and an author who
placed a box past the edge of the sheet chose those coordinates deliberately. This is a
decision and not an oversight: the editor tells an author when a page became two, and says
nothing when a box was put off the paper.
