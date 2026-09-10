import { CoreViewer, type Payload } from "@vivliostyle/core";

export interface PaginationResult {
  readonly pageCount: number;
}

/**
 * Paginates an HTML document (as produced by `core/render-book`) into `container`
 * using the real Vivliostyle engine (ADR-0002). Resolves once the whole book has laid
 * out, carrying the resulting page count — Vivliostyle's own pagination, never ours.
 *
 * Loads the document from a blob URL rather than a served path: the document is a
 * string the app just built in memory, not a resource that lives at a URL.
 */
export function paginate(container: HTMLElement, html: string): Promise<PaginationResult> {
  return new Promise((resolve, reject) => {
    const viewer = new CoreViewer({ viewportElement: container });
    const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));

    const onLoaded = (payload: Payload): void => {
      cleanup();
      resolve({ pageCount: payload.epageCount });
    };
    const onError = (payload: Payload): void => {
      cleanup();
      reject(new Error(`Vivliostyle failed to paginate the book: ${JSON.stringify(payload.content)}`));
    };
    const cleanup = (): void => {
      URL.revokeObjectURL(blobUrl);
      viewer.removeListener("loaded", onLoaded);
      viewer.removeListener("error", onError);
    };

    viewer.addListener("loaded", onLoaded);
    viewer.addListener("error", onError);
    viewer.loadDocument(blobUrl);
  });
}
