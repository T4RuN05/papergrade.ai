import * as pdfjsLib from "pdfjs-dist";

// Configure worker to load from the same-origin static public folder
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
}

class PdfDocumentCache {
  private cache = new Map<string, Promise<pdfjsLib.PDFDocumentProxy>>();
  private pageCanvasCache = new Map<
    string,
    Promise<{ canvas: HTMLCanvasElement; width: number; height: number }>
  >();

  /**
   * Returns a cached PDFDocumentProxy or fetches and parses it from the given URL.
   * Concurrent requests for the same key share the exact same promise.
   */
  async getDocument(key: string, url: string): Promise<pdfjsLib.PDFDocumentProxy> {
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const loadPromise = (async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({
          url,
          withCredentials: false,
          cMapUrl: "/cmaps/",
          cMapPacked: true,
        });
        const doc = await loadingTask.promise;
        return doc;
      } catch (err) {
        // Remove failed promise so subsequent attempts can retry
        this.cache.delete(key);
        throw err;
      }
    })();

    this.cache.set(key, loadPromise);
    return loadPromise;
  }

  /**
   * Renders a specific page of a PDF document to an offscreen HTMLCanvasElement.
   * Useful for high-speed client-side cropping and thumbnail generation.
   */
  async renderPageToOffscreenCanvas(
    doc: pdfjsLib.PDFDocumentProxy,
    pageNumber: number,
    scale: number = 2.0
  ): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
    const clampedPage = Math.max(1, Math.min(doc.numPages, pageNumber));
    const page = await doc.getPage(clampedPage);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not acquire 2D canvas context");

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    });

    await renderTask.promise;
    return { canvas, width: canvas.width, height: canvas.height };
  }

  /**
   * Returns a memoized rendered page canvas across all question crops on the same page.
   */
  async getRenderedPageCanvas(
    doc: pdfjsLib.PDFDocumentProxy,
    docKey: string,
    pageNumber: number,
    scale: number = 2.0
  ): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
    const pageKey = `${docKey}_p${pageNumber}_s${scale}`;
    if (this.pageCanvasCache.has(pageKey)) {
      return this.pageCanvasCache.get(pageKey)!;
    }

    const renderPromise = this.renderPageToOffscreenCanvas(doc, pageNumber, scale).catch((err) => {
      this.pageCanvasCache.delete(pageKey);
      throw err;
    });

    this.pageCanvasCache.set(pageKey, renderPromise);
    return renderPromise;
  }

  /**
   * Destroys and evicts a cached document to reclaim memory.
   */
  evict(key: string): void {
    const existing = this.cache.get(key);
    if (existing) {
      existing
        .then((doc) => {
          try {
            doc.destroy();
          } catch {}
        })
        .catch(() => {});
      this.cache.delete(key);
    }

    // Evict all page canvases matching this doc key prefix
    Array.from(this.pageCanvasCache.keys()).forEach((k) => {
      if (k.startsWith(`${key}_`)) {
        this.pageCanvasCache.delete(k);
      }
    });
  }

  /**
   * Clears all cached documents and frees typed array memory.
   */
  clear(): void {
    this.cache.forEach((promise) => {
      promise
        .then((doc) => {
          try {
            doc.destroy();
          } catch {}
        })
        .catch(() => {});
    });
    this.cache.clear();
    this.pageCanvasCache.clear();
  }
}

export const pdfCache = new PdfDocumentCache();
export { pdfjsLib };
