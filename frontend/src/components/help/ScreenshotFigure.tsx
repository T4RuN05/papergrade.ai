"use client";

import React, { useState } from "react";
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

  return (
    <>
      <figure className="my-3 sm:my-6 rounded-xl border border-hairline bg-surface/80 overflow-hidden shadow-2xs w-full mx-auto">
        {/* Figure Content Area */}
        {hasActualImage && src ? (
          <div className="relative group cursor-pointer" onClick={() => setLightboxOpen(true)}>
            <div className="relative w-full h-72 sm:h-88 md:h-[420px] bg-canvas-soft/80 flex items-center justify-center overflow-hidden">
              <Image
                src={src}
                alt={caption}
                fill
                unoptimized={isGif}
                sizes="(max-width: 768px) 100vw, 800px"
                className="object-contain p-2"
                onError={() => setImageError(true)}
              />
            </div>
            <div className="absolute inset-0 bg-ink/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface/90 text-ink text-xs font-semibold shadow-xs">
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Click to zoom</span>
              </span>
            </div>
          </div>
        ) : (
          /* High-Aesthetic Placeholder Card when image hasn't been uploaded yet */
          <div className="p-6 sm:p-8 bg-canvas-soft/40 border-b border-hairline flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="h-12 w-12 rounded-xl bg-surface border border-hairline flex items-center justify-center text-primary mb-3 shadow-2xs">
              <ImageIcon className="h-6 w-6" />
            </div>
            <h4 className="text-xs font-bold text-ink tracking-tight uppercase">
              Screenshot Reference Frame
            </h4>
            <p className="text-[11px] text-ink-muted max-w-sm mt-0.5 mb-4">
              Place image at <code className="font-mono text-[10px] bg-surface px-1.5 py-0.5 rounded border border-hairline">{src || "/docs/screenshot.png"}</code>
            </p>

            {pins.length > 0 && (
              <div className="w-full max-w-md bg-surface border border-hairline rounded-lg p-3 text-left space-y-1.5 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-ink-muted tracking-wider block mb-1">
                  Target Elements in this view:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {pins.map((pin) => (
                    <div key={pin.number} className="flex items-center gap-2 text-xs text-ink-secondary">
                      <span className="h-4 w-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {pin.number}
                      </span>
                      <span className="text-[11px] truncate">{pin.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Caption */}
        <figcaption className="p-3 text-center text-xs text-ink-muted border-t border-hairline bg-surface">
          {caption}
        </figcaption>
      </figure>

      {/* Lightbox Modal */}
      {lightboxOpen && hasActualImage && src && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative max-w-5xl w-full max-h-[90vh] bg-surface rounded-xl overflow-hidden border border-hairline">
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-surface/80 text-ink hover:bg-surface transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="relative w-full h-[75vh]">
              <Image src={src} alt={caption} fill unoptimized={isGif} className="object-contain p-4" />
            </div>
            <div className="p-3 text-center text-xs text-ink-muted border-t border-hairline">
              {caption}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
