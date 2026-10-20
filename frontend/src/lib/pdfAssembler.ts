import { PDFDocument } from "pdf-lib";

export interface AssemblyProgress {
  currentPage: number;
  totalPages: number;
  percent: number;
  stage: "optimizing" | "embedding" | "finalizing" | "ready";
  statusMessage: string;
}

/**
 * Resizes and compresses an image file using off-screen HTML5 Canvas.
 * Caps the maximum dimension to `maxDimension` (1600px by default) which
 * guarantees crystal-clear handwriting readability (~150-200 DPI)
 * while dropping a 6-12MB camera photo down to ~150-250KB JPEG.
 */
async function compressImageToJpeg(
  file: File,
  maxDimension: number = 1600,
  quality: number = 0.82
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    // Check for createImageBitmap support (faster and lower memory on mobile)
    if (typeof window !== "undefined" && "createImageBitmap" in window) {
      createImageBitmap(file)
        .then((bitmap) => {
          try {
            let width = bitmap.width;
            let height = bitmap.height;

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

            // Fill white background (protects against transparent PNG backgrounds)
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(bitmap, 0, 0, width, height);
            bitmap.close();

            canvas.toBlob(
              async (blob) => {
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
        })
        .catch(() => {
          // Fallback to standard Image() if createImageBitmap fails
          fallbackCanvasCompress(file, maxDimension, quality)
            .then(resolve)
            .catch(reject);
        });
    } else {
      fallbackCanvasCompress(file, maxDimension, quality)
        .then(resolve)
        .catch(reject);
    }
  });
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
 * Compiles a list of uploaded files (photos, camera captures, or existing PDFs)
 * into a single canonical, upright, optimized PDF on the student's device.
 * 
 * Benefits:
 * - 0% server RAM consumed for rasterization / image decoding.
 * - Reduces total upload payload from ~35MB down to ~1.5-2MB.
 * - Protects Render from peak concurrent OOM crashes.
 */
export async function assembleFilesToCanonicalPdf(
  files: File[],
  options?: {
    outputFilename?: string;
    maxPageDimension?: number;
    jpegQuality?: number;
    onProgress?: (progress: AssemblyProgress) => void;
  }
): Promise<File> {
  const total = files.length;
  if (total === 0) {
    throw new Error("No files provided for PDF assembly.");
  }

  // Fast-path: single pre-existing PDF requires no re-compilation
  if (total === 1 && files[0].name.toLowerCase().endsWith(".pdf")) {
    return files[0];
  }

  const onProgress = options?.onProgress;
  const maxDimension = options?.maxPageDimension ?? 1600;
  const quality = options?.jpegQuality ?? 0.82;

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

