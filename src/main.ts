import "./app/app.css";

import { createEditor } from "./adapters/editor";
import { paginate } from "./adapters/pagination";
import { printBook } from "./adapters/printing";
import { readDraft, createDebouncedPersist } from "./adapters/persistence";
import { startApp } from "./app/start-app";

const editorContainer = document.getElementById("editor");
const previewContainer = document.getElementById("preview");
const printControl = document.getElementById("print");

if (!editorContainer || !previewContainer || !printControl) {
  throw new Error("index.html is missing #editor, #preview, or #print");
}

startApp(
  editorContainer,
  previewContainer,
  printControl,
  createEditor,
  paginate,
  printBook,
  readDraft,
  createDebouncedPersist(),
);
