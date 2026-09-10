import { marked } from "marked";

import { Book, DEFAULT_PAGE_SIZE } from "./book";

/**
 * Turns a book's source into a standalone HTML document that a pagination engine can
 * lay out and the browser's print engine can print. Pure: no reference to the
 * browser, so a server can call the same function later (ADR-0001).
 */
export function renderBook(book: Book): string {
  const prose = marked.parse(book.source, { async: false }) as string;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Grimoire Press</title>
<style>
  @page { size: ${DEFAULT_PAGE_SIZE}; margin: 16mm; }
  body { font-family: serif; line-height: 1.5; }
</style>
</head>
<body>
${prose}
</body>
</html>
`;
}
