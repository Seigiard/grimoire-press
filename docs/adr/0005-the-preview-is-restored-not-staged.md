# A failed repaint restores the preview rather than staging into a detached container

When the pagination engine fails, the author must keep seeing the last book that
paginated successfully. Broken markup already behaves that way, because parsing throws
before the engine is ever asked to lay anything out; the engine's own failure did not,
because the pagination adapter emptied the preview as its first statement and only then
handed the document over.

The attractive fix was to lay the next book out in a staging container held outside the
document and swap it into the preview only once pagination resolved. That never empties
the preview at all, so it would also remove the flash of empty space a slow repaint
shows on the way to succeeding. We measured whether the engine can work that way, and it
cannot.

## What a detached container actually produces

Driving the real engine through the real adapter, in a real browser, once into the
visible preview and once into a `div` that was never appended to the document:

| book | pages, in the preview | pages, detached |
| --- | --- | --- |
| one short paragraph, A5 | 1 | 1 |
| six paragraphs, two columns, A5 | 2 | 1 |
| thirty sections of prose, A5 | 19 | 1 |

The page sizes were the only part that survived: both containers reported the same
559.37 × 793.70 for A5 and the same 793.70 × 1122.52 for A4. That is not a measurement —
it is the book's declared `@page size` resolved from CSS, which needs no layout to
compute. Everything that *is* a measurement collapsed. A detached element has no
geometry at all, so nothing the engine lays out ever overflows, so no page ever ends: the
whole book piles onto page one, and the content simply runs off it. Swapping that result
into the document afterwards does not repair it, because the fragmentation decisions were
already made and baked into the DOM.

So the risk this decision was gated on turned out to be worse than expected. The concern
was that page sizes would come back as zero; instead the sizes are right and the
pagination is wrong, which is the failure that would have shipped quietly.

## The decision

`paginate` remembers the container's children *and its attributes* before it empties it,
and puts both back when the engine's error event fires. The adapter is all-or-nothing
about the container it is given: when the call settles, the container holds either a
newly paginated book or exactly what it held on the way in. A first-ever failure needs no
special handling — it restores an empty container into an empty container.

The attributes are part of that promise and not a detail. The engine marks the container
`data-vivliostyle-viewer-status="loading"` when it starts and never marks it back on the
error path, so restoring only the child nodes leaves the container itself describing the
run that failed. Nothing styles off those attributes today, which is why this is not a
visible defect — it is the difference between the guarantee being true and being nearly
true, and a nearly-true guarantee is the kind a later change quietly relies on.

## Consequences

The failure case is fixed and the flash is not. A slow repaint still blanks the preview
while the engine works, so the author keeps the one signal they currently have that the
editor is doing something, and this ticket therefore adds no repaint-in-progress signal
to the status surface. If the flash is ever removed, that signal has to arrive with it.

A staging container attached to the document but positioned out of sight does paginate
correctly — the same three books produced 1, 2 and 19 pages there, page for page
identical to the visible preview. That is the route to reopen if the flash becomes worth
removing. It costs a second full copy of the book in the document for the duration of
every repaint, which is why it was not taken on the strength of a flash alone.
