"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { ImageIcon, Maximize2, X } from "lucide-react";

export interface ScreenshotPin {
  number: number;
  label: string;
}

export interface ScreenshotFigureProps {
  src?: string;
  caption: string;
  pins?: ScreenshotPin[];
}

export function ScreenshotFigure({ src, caption, pins = [] }: ScreenshotFigureProps) {
  const [imageError, setImageError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const hasActualImage = Boolean(src && !imageError);
  const isGif = Boolean(src?.toLowerCase().endsWith(".gif"));

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen]);

  return (
    <>
      <figure className="my-3 rounded-lg border border-hairline bg-surface overflow-hidden shadow-notion-card w-full">
        {hasActualImage && src ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="relative group block w-full text-left cursor-zoom-in focus:outline-none bg-canvas-soft p-3 sm:p-5"
            aria-label={`Zoom image: ${caption}`}
          >
            <div className="w-full flex items-center justify-center overflow-hidden">
              <Image
                src={src}
                alt={caption}
                width={1200}
                height={800}
                unoptimized={isGif}
                sizes="(max-width: 768px) 100vw, 768px"
                className="w-auto h-auto max-w-full max-h-64 sm:max-h-80 md:max-h-96 object-contain rounded-md border border-hairline bg-surface"
                onError={() => setImageError(true)}
              />
            </div>
            <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface/95 border border-hairline text-ink text-xs font-medium shadow-notion-card opacity-90 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100 transition-opacity">
              <Maximize2 className="h-3.5 w-3.5 text-ink-muted" />
              <span>Expand</span>
            </span>
          </button>
        ) : (
          <div className="p-6 sm:p-8 bg-canvas-soft flex flex-col items-center justify-center text-center">
            <div className="h-10 w-10 rounded-md bg-surface border border-hairline flex items-center justify-center text-ink-muted mb-3">
              <ImageIcon className="h-5 w-5" />
            </div>
            <p className="text-xs font-semibold text-ink">Screenshot Reference</p>
            <p className="text-xs text-ink-muted max-w-sm mt-1">
              Asset path:{" "}
              <code className="font-mono text-[11px] bg-surface px-1.5 py-0.5 rounded-xs border border-hairline">
                {src || "/docs/screenshot.png"}
              </code>
            </p>
          </div>
        )}

        {/* Caption */}
        <figcaption className="px-4 py-2.5 text-xs text-ink-muted border-t border-hairline bg-surface leading-relaxed">
          {caption}
        </figcaption>

        {/* Annotated Pin Legend */}
        {pins.length > 0 && (
          <div className="px-4 py-2.5 border-t border-hairline bg-canvas-soft/70 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {pins.map((pin) => (
              <div key={pin.number} className="flex items-center gap-2 text-xs text-ink-secondary min-w-0">
                <span className="h-4 w-4 rounded-xs bg-surface border border-hairline text-primary text-[11px] font-mono font-semibold flex items-center justify-center shrink-0 tabular-nums">
                  {pin.number}
                </span>
                <span className="truncate">{pin.label}</span>
              </div>
            ))}
          </div>
        )}
      </figure>

      {/* Lightbox Modal */}
      {lightboxOpen && hasActualImage && src && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={caption}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="relative max-w-5xl w-full max-h-[90vh] bg-surface rounded-lg overflow-hidden border border-hairline shadow-notion-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close image preview"
              className="absolute top-3 right-3 z-10 inline-flex items-center justify-center h-8 w-8 rounded-md bg-surface/95 border border-hairline text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="relative w-full h-[70vh] sm:h-[75vh] bg-canvas-soft">
              <Image
                src={src}
                alt={caption}
                fill
                unoptimized={isGif}
                className="object-contain p-3 sm:p-4"
              />
            </div>
            <div className="px-4 py-3 text-center text-xs text-ink-muted border-t border-hairline bg-surface">
              {caption}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
