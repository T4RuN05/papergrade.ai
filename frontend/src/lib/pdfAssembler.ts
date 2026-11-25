import { PDFDocument } from "pdf-lib";

export interface AssemblyProgress {
  currentPage: number;
  totalPages: number;
  percent: number;
  stage: "optimizing" | "embedding" | "finalizing" | "ready";
  statusMessage: string;
}

export interface AssembleOptions {
  outputFilename?: string;
  maxPageDimension?: number;
  jpegQuality?: number;
  onProgress?: (progress: AssemblyProgress) => void;
}

export interface DownscaledImageResult {
  file: File;
  originalWidth: number;
  originalHeight: number;
  targetWidth: number;
  targetHeight: number;
  originalSizeBytes: number;
  downscaledSizeBytes: number;
  compressionRatio: number;
  bytesSavedPercent: number;
}

/**
 * Resizes and compresses an image file using HTML5 Canvas / createImageBitmap.
 * Caps the maximum dimension to `maxDimension` (1920px by default) which
 * guarantees crystal-clear handwriting readability (~200 DPI)
 * while dropping a 6-12MB camera photo down to ~200-300KB JPEG.
 */
export async function downscaleImageFile(
  file: File,
  options?: { maxDimension?: number; quality?: number }
): Promise<DownscaledImageResult> {
  const maxDimension = options?.maxDimension ?? 1920;
  const quality = options?.quality ?? 0.80;
  const originalSize = file.size;

  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && "createImageBitmap" in window) {
      createImageBitmap(file)
        .then((bitmap) => {
          try {
            const origW = bitmap.width;
            const origH = bitmap.height;
            let width = origW;
            let height = origH;

            if (width > maxDimension || height > maxDimension) {
              if (width > height) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
              } else {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
              }
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              throw new Error("Unable to obtain 2D canvas context.");
            }

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(bitmap, 0, 0, width, height);
            bitmap.close();

            canvas.toBlob(
              (blob) => {
                // Explicitly zero out dimensions to release unmanaged backing GPU/raster buffers immediately
                canvas.width = 0;
                canvas.height = 0;

                if (!blob) {
                  reject(new Error("Failed to render canvas to JPEG blob."));
                  return;
                }
                const downscaledFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                  type: "image/jpeg",
                });
                const downscaledSize = downscaledFile.size;
                const ratio = originalSize > 0 ? downscaledSize / originalSize : 1;
                const savedPercent = originalSize > 0 ? ((originalSize - downscaledSize) / originalSize) * 100 : 0;

                resolve({
                  file: downscaledFile,
                  originalWidth: origW,
                  originalHeight: origH,
                  targetWidth: width,
                  targetHeight: height,
                  originalSizeBytes: originalSize,
                  downscaledSizeBytes: downscaledSize,
                  compressionRatio: Number(ratio.toFixed(4)),
                  bytesSavedPercent: Number(savedPercent.toFixed(2)),
                });
              },
              "image/jpeg",
              quality
            );
          } catch (err) {
            reject(err);
          }
        })
        .catch(() => {
          fallbackCanvasCompress(file, maxDimension, quality)
            .then((jpegBytes) => {
              const blob = new Blob([jpegBytes as unknown as BlobPart], { type: "image/jpeg" });
              const downscaledFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                type: "image/jpeg",
              });
              resolve({
                file: downscaledFile,
                originalWidth: 0,
                originalHeight: 0,
                targetWidth: 0,
                targetHeight: 0,
                originalSizeBytes: originalSize,
                downscaledSizeBytes: downscaledFile.size,
                compressionRatio: originalSize > 0 ? downscaledFile.size / originalSize : 1,
                bytesSavedPercent: originalSize > 0 ? ((originalSize - downscaledFile.size) / originalSize) * 100 : 0,
              });
            })
            .catch(reject);
        });
    } else {
      fallbackCanvasCompress(file, maxDimension, quality)
        .then((jpegBytes) => {
          const blob = new Blob([jpegBytes as unknown as BlobPart], { type: "image/jpeg" });
          const downscaledFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
            type: "image/jpeg",
          });
          resolve({
            file: downscaledFile,
            originalWidth: 0,
            originalHeight: 0,
            targetWidth: 0,
            targetHeight: 0,
            originalSizeBytes: originalSize,
            downscaledSizeBytes: downscaledFile.size,
            compressionRatio: originalSize > 0 ? downscaledFile.size / originalSize : 1,
            bytesSavedPercent: originalSize > 0 ? ((originalSize - downscaledFile.size) / originalSize) * 100 : 0,
          });
        })
        .catch(reject);
    }
  });
}

async function compressImageToJpeg(
  file: File,
  maxDimension: number = 1920,
  quality: number = 0.80
): Promise<Uint8Array> {
  const result = await downscaleImageFile(file, { maxDimension, quality });
  const buffer = await result.file.arrayBuffer();
  return new Uint8Array(buffer);
}

function fallbackCanvasCompress(
  file: File,
  maxDimension: number,
  quality: number
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Unable to obtain 2D canvas context."));
            return;
          }

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            async (blob) => {
              // Explicitly zero out dimensions to release backing buffers
              canvas.width = 0;
              canvas.height = 0;

              if (!blob) {
                reject(new Error("Failed to render canvas to JPEG blob."));
                return;
              }
              const buffer = await blob.arrayBuffer();
              resolve(new Uint8Array(buffer));
            },
            "image/jpeg",
            quality
          );
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error(`Failed to decode image: ${file.name}`));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * Attempts to assemble the PDF using a dedicated background Web Worker.
 * Offloading PDF assembly and compression keeps the main React UI thread
 * responsive at 60 FPS, preventing UI lockups and frozen countdown timers.
 */
async function assembleWithWorker(
  files: File[],
  options?: AssembleOptions
): Promise<File> {
  const outputFilename = options?.outputFilename || `answersheet_${Date.now()}.pdf`;
  const maxPageDimension = options?.maxPageDimension ?? 1920;
  const jpegQuality = options?.jpegQuality ?? 0.80;

  // Read file buffers BEFORE spawning Worker so read failures never leak a running Worker thread
  const filePayloads: Array<{ name: string; type: string; buffer: ArrayBuffer }> = [];
  const transferables: ArrayBuffer[] = [];

  for (const f of files) {
    const buf = await f.arrayBuffer();
    filePayloads.push({
      name: f.name,
      type: f.type,
      buffer: buf,
    });
    transferables.push(buf);
  }

  return new Promise((resolve, reject) => {
    let worker: Worker | null = null;
    const cleanupWorker = () => {
      if (worker) {
        worker.terminate();
        worker = null;
      }
    };

    try {
      worker = new Worker(new URL("../workers/pdfWorker.ts", import.meta.url));
    } catch (e) {
      cleanupWorker();
      reject(e);
      return;
    }

    worker.onmessage = (event) => {
      const { type, payload } = event.data;
      if (type === "PROGRESS" && options?.onProgress) {
        options.onProgress(payload);
      } else if (type === "SUCCESS") {
        cleanupWorker();
        const { pdfBuffer, filename } = payload;
        const blob = new Blob([pdfBuffer], { type: "application/pdf" });
        const finalFile = new File([blob], filename, { type: "application/pdf" });
        resolve(finalFile);
      } else if (type === "ERROR") {
        cleanupWorker();
        reject(new Error(payload.error || "Web Worker failed during assembly."));
      }
    };

    worker.onerror = (err) => {
      cleanupWorker();
      reject(new Error(`Web Worker error: ${err.message || "Unknown worker error"}`));
    };

    try {
      worker.postMessage(
        {
          type: "ASSEMBLE",
          payload: {
            files: filePayloads,
            options: {
              outputFilename,
              maxPageDimension,
              jpegQuality,
            },
          },
        },
        transferables
      );
    } catch (postErr) {
      cleanupWorker();
      reject(postErr);
    }
  });
}

/**
 * Main-thread fallback for PDF assembly when Web Worker is unsupported or throws.
 */
async function assembleOnMainThread(
  files: File[],
  options?: AssembleOptions
): Promise<File> {
  const total = files.length;
  if (total === 0) {
    throw new Error("No files provided for PDF assembly.");
  }

  const onProgress = options?.onProgress;
  const maxDimension = options?.maxPageDimension ?? 1920;
  const quality = options?.jpegQuality ?? 0.80;

  const pdfDoc = await PDFDocument.create();

  for (let idx = 0; idx < total; idx++) {
    const file = files[idx];
    const pageNum = idx + 1;
    const isPdf =
      file.name.toLowerCase().endsWith(".pdf") ||
      file.type === "application/pdf";

    const basePercent = Math.round((idx / total) * 90);

    if (onProgress) {
      onProgress({
        currentPage: pageNum,
        totalPages: total,
        percent: basePercent,
        stage: "optimizing",
        statusMessage: `Optimizing page ${pageNum} of ${total}...`,
      });
    }

    if (isPdf) {
      const existingBytes = await file.arrayBuffer();
      const existingPdf = await PDFDocument.load(existingBytes);
      const copiedPages = await pdfDoc.copyPages(
        existingPdf,
        existingPdf.getPageIndices()
      );
      copiedPages.forEach((page) => pdfDoc.addPage(page));
    } else {
      // 1. Compress image to clean document JPEG
      const jpegBytes = await compressImageToJpeg(file, maxDimension, quality);

      if (onProgress) {
        onProgress({
          currentPage: pageNum,
          totalPages: total,
          percent: basePercent + Math.round((1 / total) * 45),
          stage: "embedding",
          statusMessage: `Assembling page ${pageNum} of ${total}...`,
        });
      }

      // 2. Embed into PDFDocument
      const embeddedJpg = await pdfDoc.embedJpg(jpegBytes);
      const page = pdfDoc.addPage([embeddedJpg.width, embeddedJpg.height]);
      page.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width: embeddedJpg.width,
        height: embeddedJpg.height,
      });
    }
  }

  if (onProgress) {
    onProgress({
      currentPage: total,
      totalPages: total,
      percent: 95,
      stage: "finalizing",
      statusMessage: "Finalizing PDF on device...",
    });
  }

  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  const filename = options?.outputFilename || `answersheet_${Date.now()}.pdf`;

  if (onProgress) {
    onProgress({
      currentPage: total,
      totalPages: total,
      percent: 100,
      stage: "ready",
      statusMessage: "Document ready for upload!",
    });
  }

  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
  return new File([blob], filename, { type: "application/pdf" });
}

/**
 * Compiles a list of uploaded files (photos, camera captures, or existing PDFs)
 * into a single canonical, upright, optimized PDF on the student's device.
 *
 * Utilizes a background Web Worker when available for non-blocking UI performance,
 * with automatic fallback to the main thread.
 */
export async function assembleFilesToCanonicalPdf(
  files: File[],
  options?: AssembleOptions
): Promise<File> {
  const total = files.length;
  if (total === 0) {
    throw new Error("No files provided for PDF assembly.");
  }

  // Fast-path: single pre-existing PDF requires no re-compilation
  if (total === 1 && files[0].name.toLowerCase().endsWith(".pdf")) {
    return files[0];
  }

  // Try Web Worker first for non-blocking performance
  if (typeof Worker !== "undefined" && typeof window !== "undefined") {
    try {
      return await assembleWithWorker(files, options);
    } catch (workerErr) {
      console.warn("Web Worker PDF assembly failed, falling back to main thread:", workerErr);
      return await assembleOnMainThread(files, options);
    }
  }

  return await assembleOnMainThread(files, options);
}
