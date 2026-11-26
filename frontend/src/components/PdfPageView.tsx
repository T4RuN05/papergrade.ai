"use client";

import React, { useEffect, useRef, useState } from "react";
import { pdfCache, pdfjsLib } from "@/lib/pdfCache";

interface PdfPageViewProps {
  pdfUrl: string;
  cacheKey: string;
  pageNumber: number;
  className?: string;
  targetWidth?: number;
  hideLoader?: boolean;
  onAspectCalculated?: (aspect: number) => void;
  onPageLoaded?: (pageNumber: number, totalPages: number) => void;
  onRenderSuccess?: () => void;
  onError?: (error: any) => void;
}

export function PdfPageView({
  pdfUrl,
  cacheKey,
  pageNumber,
  className = "",
  targetWidth = 1400,
  hideLoader = false,
  onAspectCalculated,
  onPageLoaded,
  onRenderSuccess,
  onError,
}: PdfPageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [aspect, setAspect] = useState<number | null>(null);

  const onAspectCalculatedRef = useRef(onAspectCalculated);
  const onPageLoadedRef = useRef(onPageLoaded);
  const onRenderSuccessRef = useRef(onRenderSuccess);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onAspectCalculatedRef.current = onAspectCalculated;
    onPageLoadedRef.current = onPageLoaded;
    onRenderSuccessRef.current = onRenderSuccess;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let isCancelled = false;
    let currentRenderTask: pdfjsLib.RenderTask | null = null;

    async function loadAndRender() {
      setIsLoading(true);
      setRenderError(null);

      try {
        const doc = await pdfCache.getDocument(cacheKey, pdfUrl);
        if (isCancelled) return;

        if (onPageLoadedRef.current) {
          onPageLoadedRef.current(pageNumber, doc.numPages);
        }

        const clampedPage = Math.max(1, Math.min(doc.numPages, pageNumber));
        const page = await doc.getPage(clampedPage);
        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) throw new Error("Could not acquire 2D canvas context");

        // 1. Calculate natural aspect ratio
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const naturalAspect = unscaledViewport.width / unscaledViewport.height;
        setAspect(naturalAspect);
        if (onAspectCalculatedRef.current) {
          onAspectCalculatedRef.current(naturalAspect);
        }

        // 2. High-DPI / Retina scale calculation
        const pixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const renderWidth = Math.max(800, targetWidth) * Math.min(2, pixelRatio);
        const scale = renderWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        // Set internal canvas resolution
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        // Render page
        currentRenderTask = page.render({
          canvasContext: ctx,
          viewport,
        });

        await currentRenderTask.promise;

        if (!isCancelled) {
          setIsLoading(false);
          if (onRenderSuccessRef.current) onRenderSuccessRef.current();
        }
      } catch (err: any) {
        if (err?.name === "RenderingCancelledException") {
          // Normal cancellation on rapid page flipping, ignore
          return;
        }
        if (!isCancelled) {
          console.error("PdfPageView render error:", err);
          setIsLoading(false);
          setRenderError(err?.message || "Failed to render PDF page");
          if (onErrorRef.current) onErrorRef.current(err);
        }
      }
    }

    loadAndRender();

    return () => {
      isCancelled = true;
      if (currentRenderTask) {
        try {
          currentRenderTask.cancel();
        } catch {}
      }
    };
  }, [pdfUrl, cacheKey, pageNumber, targetWidth]);

  return (
    <div
      className={`relative w-full h-full max-w-full max-h-full flex items-center justify-center ${className}`}
      style={{
        aspectRatio: aspect ? `${aspect}` : undefined,
      }}
    >
      {isLoading && !hideLoader && (
        <div className="absolute inset-0 flex items-center justify-center bg-canvas-soft/40 dark:bg-zinc-950/40 z-10">
          <div className="w-full h-full skeleton rounded-sm" />
        </div>
      )}

      {renderError ? (
        <div className="p-4 text-center space-y-1 bg-surface border border-hairline rounded-md">
          <p className="text-xs font-semibold text-[#c93b3b]">
            Error rendering page {pageNumber}
          </p>
          <p className="text-[11px] text-ink-muted font-mono">
            {renderError}
          </p>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="w-full h-full max-w-full max-h-full block object-contain rounded-sm select-none pointer-events-none"
          style={{
            display: "block",
            aspectRatio: aspect ? `${aspect}` : undefined,
          }}
        />
      )}
    </div>
  );
}
