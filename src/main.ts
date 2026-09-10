import "./app/app.css";

import { createEditor } from "./adapters/editor";
import { paginate } from "./adapters/pagination";
import { printBook } from "./adapters/printing";
import { readDraft, createDebouncedPersist } from "./adapters/persistence";
import { startApp } from "./app/start-app";

const editorContainer = document.getElementById("editor");
const previewContainer = document.getElementById("preview");
const printControl = document.getElementById("print");
const refreshControl = document.getElementById("refresh");
const autoRefreshControl = document.getElementById("auto-refresh");
const statusContainer = document.getElementById("status");

if (
  !editorContainer ||
  !previewContainer ||
  !printControl ||
  !refreshControl ||
  !(autoRefreshControl instanceof HTMLInputElement) ||
  !statusContainer
) {
  throw new Error("index.html is missing #editor, #preview, #print, #refresh, #auto-refresh, or #status");
}

startApp(
  { editorContainer, previewContainer, printControl, refreshControl, autoRefreshControl, statusContainer },
  createEditor,
  paginate,
  printBook,
  readDraft,
  createDebouncedPersist(),
);
