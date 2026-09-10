import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { bookMarkupSyntax } from "./markup-syntax";

export interface EditorHandle {
  getSource(): string;
  destroy(): void;
}

/**
 * Wraps CodeMirror as the left pane. Imports the language and view packages
 * directly rather than the `codemirror` convenience bundle, which would pull in
 * embedded HTML/CSS/JS language support this project never uses (ADR-0004).
 *
 * Calls `onChange` with the buffer's full text on every edit; the app decides what
 * happens next. This is the whole of the state CodeMirror does not already own.
 */
export function createEditor(
  container: HTMLElement,
  initialSource: string,
  onChange: (source: string) => void,
): EditorHandle {
  const view = new EditorView({
    parent: container,
    state: EditorState.create({
      doc: initialSource,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ extensions: [bookMarkupSyntax] }),
        syntaxHighlighting(defaultHighlightStyle),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    }),
  });

  return {
    getSource: () => view.state.doc.toString(),
    destroy: () => view.destroy(),
  };
}
