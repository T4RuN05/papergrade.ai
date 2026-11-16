import * as pdfjsLib from "pdfjs-dist";

// Configure worker to load from the same-origin static public folder
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
}

const MAX_DOCS = 2;
const MAX_PAGE_CANVASES = 6;

class PdfDocumentCache {
  // Ordered Map for LRU eviction of PDF documents
  private cache = new Map<string, Promise<pdfjsLib.PDFDocumentProxy>>();

  // Ordered Map for LRU eviction of offscreen canvases
  private pageCanvasCache = new Map<
    string,
    Promise<{ canvas: HTMLCanvasElement; width: number; height: number }>
  >();

  /**
   * Returns a cached PDFDocumentProxy or fetches and parses it from the given URL.
   * Evicts the oldest document when the cache exceeds MAX_DOCS.
   */
  async getDocument(key: string, url: string): Promise<pdfjsLib.PDFDocumentProxy> {
    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!;
      // Refresh LRU order
      this.cache.delete(key);
      this.cache.set(key, existing);
      return existing;
    }

    // Evict oldest document if over capacity
    while (this.cache.size >= MAX_DOCS) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.evict(oldestKey);
      } else {
        break;
      }
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
        this.cache.delete(key);
        throw err;
      }
    })();

    this.cache.set(key, loadPromise);
    return loadPromise;
  }

  /**
   * Renders a specific page of a PDF document to an offscreen HTMLCanvasElement.
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
   * Automatically enforces LRU bounding to MAX_PAGE_CANVASES, explicitly releasing
   * unmanaged GPU buffers (canvas.width = 0; canvas.height = 0) upon eviction.
   */
  async getRenderedPageCanvas(
    doc: pdfjsLib.PDFDocumentProxy,
    docKey: string,
    pageNumber: number,
    scale: number = 2.0
  ): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
    const pageKey = `${docKey}_p${pageNumber}_s${scale}`;
    if (this.pageCanvasCache.has(pageKey)) {
      const existing = this.pageCanvasCache.get(pageKey)!;
      // Refresh LRU order
      this.pageCanvasCache.delete(pageKey);
      this.pageCanvasCache.set(pageKey, existing);
      return existing;
    }

    // Evict oldest page canvas if over capacity
    while (this.pageCanvasCache.size >= MAX_PAGE_CANVASES) {
      const oldestKey = this.pageCanvasCache.keys().next().value;
      if (oldestKey) {
        this._evictCanvas(oldestKey);
      } else {
        break;
      }
    }

    const renderPromise = this.renderPageToOffscreenCanvas(doc, pageNumber, scale).catch((err) => {
      this.pageCanvasCache.delete(pageKey);
      throw err;
    });

    this.pageCanvasCache.set(pageKey, renderPromise);
    return renderPromise;
  }

  private _evictCanvas(key: string): void {
    const promise = this.pageCanvasCache.get(key);
    if (promise) {
      this.pageCanvasCache.delete(key);
      promise
        .then((res) => {
          if (res?.canvas) {
            // Explicitly zero dimensions to release GPU/raster backing buffer
            res.canvas.width = 0;
            res.canvas.height = 0;
          }
        })
        .catch(() => {});
    }
  }

  /**
   * Destroys and evicts a cached document and all associated page canvases to reclaim memory.
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
        this._evictCanvas(k);
      }
    });
  }

  /**
   * Clears all cached documents and frees all typed array and GPU backing memory.
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

    Array.from(this.pageCanvasCache.keys()).forEach((k) => {
      this._evictCanvas(k);
    });
    this.pageCanvasCache.clear();
  }
}

export const pdfCache = new PdfDocumentCache();
export { pdfjsLib };
