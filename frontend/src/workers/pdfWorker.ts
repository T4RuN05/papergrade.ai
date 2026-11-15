import { PDFDocument } from "pdf-lib";

export interface WorkerFilePayload {
  name: string;
  type: string;
  buffer: ArrayBuffer;
}

export interface WorkerAssembleOptions {
  outputFilename?: string;
  maxPageDimension?: number;
  jpegQuality?: number;
}

export interface WorkerInputMessage {
  type: "ASSEMBLE";
  payload: {
    files: WorkerFilePayload[];
    options?: WorkerAssembleOptions;
  };
}

/**
 * Resizes and converts an image ArrayBuffer into a downscaled JPEG Uint8Array using OffscreenCanvas.
 */
async function compressImageInWorker(
  buffer: ArrayBuffer,
  type: string,
  maxDimension: number,
  quality: number
): Promise<Uint8Array> {
  const blob = new Blob([buffer], { type: type || "image/jpeg" });
  const bitmap = await createImageBitmap(blob);

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

    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Unable to obtain 2D OffscreenCanvas context in worker.");
      }

      // Fill white background for alpha channel compatibility
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);

      const compressedBlob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: quality,
      });

      const ab = await compressedBlob.arrayBuffer();
      return new Uint8Array(ab);
    } else {
      // If OffscreenCanvas is not present in worker context, return original bytes
      return new Uint8Array(buffer);
    }
  } finally {
    bitmap.close();
  }
}

const ctx: Worker = self as any;

ctx.onmessage = async (event: MessageEvent<WorkerInputMessage>) => {
  const { type, payload } = event.data;
  if (type !== "ASSEMBLE" || !payload || !payload.files) {
    return;
  }

  const { files, options } = payload;
  const total = files.length;
  const maxDimension = options?.maxPageDimension ?? 1920;
  const quality = options?.jpegQuality ?? 0.80;
  const outputFilename = options?.outputFilename || `answersheet_${Date.now()}.pdf`;

  try {
    const pdfDoc = await PDFDocument.create();

    for (let idx = 0; idx < total; idx++) {
      const fileData = files[idx];
      const pageNum = idx + 1;
      const isPdf =
        fileData.name.toLowerCase().endsWith(".pdf") ||
        fileData.type === "application/pdf";

      const basePercent = Math.round((idx / total) * 90);

      // Post progress
      ctx.postMessage({
        type: "PROGRESS",
        payload: {
          currentPage: pageNum,
          totalPages: total,
          percent: basePercent,
          stage: "optimizing",
          statusMessage: `Optimizing page ${pageNum} of ${total}...`,
        },
      });

      if (isPdf) {
        const existingPdf = await PDFDocument.load(fileData.buffer);
        const copiedPages = await pdfDoc.copyPages(
          existingPdf,
          existingPdf.getPageIndices()
        );
        copiedPages.forEach((page) => pdfDoc.addPage(page));
      } else {
        // Compress and downscale image
        const jpegBytes = await compressImageInWorker(
          fileData.buffer,
          fileData.type,
          maxDimension,
          quality
        );

        ctx.postMessage({
          type: "PROGRESS",
          payload: {
            currentPage: pageNum,
            totalPages: total,
            percent: basePercent + Math.round((1 / total) * 45),
            stage: "embedding",
            statusMessage: `Assembling page ${pageNum} of ${total}...`,
          },
        });

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

    ctx.postMessage({
      type: "PROGRESS",
      payload: {
        currentPage: total,
        totalPages: total,
        percent: 95,
        stage: "finalizing",
        statusMessage: "Finalizing PDF document...",
      },
    });

    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });

    ctx.postMessage({
      type: "PROGRESS",
      payload: {
        currentPage: total,
        totalPages: total,
        percent: 100,
        stage: "ready",
        statusMessage: "Document ready for upload!",
      },
    });

    // Transfer the pdfBytes buffer back to main thread
    (ctx as any).postMessage(
      {
        type: "SUCCESS",
        payload: {
          pdfBuffer: pdfBytes.buffer,
          filename: outputFilename,
        },
      },
      [pdfBytes.buffer]
    );
  } catch (err: any) {
    ctx.postMessage({
      type: "ERROR",
      payload: {
        error: err?.message || "Failed to assemble PDF in Web Worker.",
      },
    });
  }
};
