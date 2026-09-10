import "./app/app.css";

import { createEditor } from "./adapters/editor";
import { downloadBook, loadBookFile } from "./adapters/file";
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
const downloadControl = document.getElementById("download");
const loadControl = document.getElementById("load");

if (
  !editorContainer ||
  !previewContainer ||
  !printControl ||
  !refreshControl ||
  !(autoRefreshControl instanceof HTMLInputElement) ||
  !statusContainer ||
  !downloadControl ||
  !(loadControl instanceof HTMLInputElement)
) {
  throw new Error(
    "index.html is missing #editor, #preview, #print, #refresh, #auto-refresh, #status, #download, or #load",
  );
}

startApp(
  {
    editorContainer,
    previewContainer,
    printControl,
    refreshControl,
    autoRefreshControl,
    statusContainer,
    downloadControl,
    loadControl,
  },
  createEditor,
  paginate,
  printBook,
  { read: readDraft, write: createDebouncedPersist() },
  downloadBook,
  loadBookFile,
);
