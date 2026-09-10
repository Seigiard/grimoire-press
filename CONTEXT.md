# Context

Vocabulary for the rulebook editor: a browser tool where an author writes a tabletop
RPG rulebook on the left and sees the paginated result on the right.

## Book

The whole work an author is editing: one rulebook, from first page to last. A book
declares its page size and its theme. It is the root of a document.

Not to be confused with the **saved file**, which is what the author downloads. A saved
file carries a book together with its theme.

## Section

A run of pages that share one layout, above all a column count. The author declares a
section; the engine decides how many physical pages the section's content occupies.

A section is the unit that answers "how is this part of the book laid out", never "where
does this page end".

## Page

Exactly one physical page, composed by the author rather than filled by the engine. Used
where the arrangement itself is the content: a character sheet, a reference card, a
table meant to sit alone on its own page.

A page is the exception. Text in a book flows through sections; a page opts out of that
flow. It sits beside a section rather than inside one, because a section is the flow a
page opts out of.

"Exactly one" is a claim the editor checks, not a hope. A section between two page
breaks happens to occupy one page today and silently occupies two tomorrow when the
author adds a line. A page that no longer fits on a page is reported to the author.

A page may be turned landscape. It may not be a different size from the book: a book is
bound at one format, and a rotated sheet is still that format while a larger one is a
book nobody can bind.

A page carries no running header. The header names where the reader is in the flow, and
a page has left the flow, so on a page it would name somewhere the reader is not. The
page number stays, because it is an address and the address is still true.

## Page break

A point where the author forces the current page to end, even though content would
otherwise continue on it. Belongs inside a section.

## Column break

A point where the author forces the current column to end and the next one to begin.
Meaningful only inside a section with more than one column.

## Theme

The complete visual identity of a book: typefaces, sizes, spacing, rules, colours. A
theme also determines which scripts the book can be set in, because a theme's typefaces
either cover an alphabet or do not. A theme that covers only the Latin alphabet cannot
set a Russian book.

A book names one theme.

## Component

A named block an author uses instead of describing its arrangement each time: a move, a
stat block, a field to write in. Components are defined inside the book itself, so a book
opens complete on any machine.

## Component set

A group of components belonging to one family of games, such as Powered by the Apocalypse
or Old School Renaissance. The editor keeps ready-made sets and inserts one into a book
as a starting point; from that moment the definitions belong to the book and the author
may change them.

## Preview

The right-hand side of the editor: the book already divided into pages, shown as it will
be printed. The preview and the PDF are produced from the same marked-up book, so what
the author sees is what is printed.
