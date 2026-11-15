"use client";

import React, { useState } from "react";
import { api } from "@/lib/api";
import { FileText, ZoomIn } from "lucide-react";

export interface RegionCoords {
  id?: string;
  page_number?: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ClippedAnswerCropProps {
  submissionId: string;
  pageNumber?: number;
  region?: RegionCoords | null;
  fallbackCropUrl?: string;
  alt?: string;
  className?: string;
  maxContainerHeight?: string;
}

/**
 * Client-Side CSS/Canvas Cropper (Alternative 1).
 * 
 * Instead of generating and fetching individual cropped image files from Cloudinary,
 * this component projects the already-cached full-page scan through an overflow-hidden
 * viewport using normalized bounding coordinates (x, y, width, height).
 * 
 * Benefits:
 * - 0ms instant rendering with zero network delay or spinners.
 * - Zero extra files uploaded to Cloudinary storage.
 * - 60 FPS real-time updates when teachers drag bounding boxes.
 */
export function ClippedAnswerCrop({
  submissionId,
  pageNumber = 1,
  region,
  fallbackCropUrl,
  alt = "Student handwriting crop",
  className = "",
  maxContainerHeight = "260px",
}: ClippedAnswerCropProps) {
  const [imgError, setImgError] = useState(false);

  // If valid normalized coordinates are present (0 <= x, y, width, height <= 1)
  const hasValidRegion =
    region &&
    typeof region.x === "number" &&
    typeof region.y === "number" &&
    typeof region.width === "number" &&
    typeof region.height === "number" &&
    region.width > 0.01 &&
    region.height > 0.01;

  const targetPage = region?.page_number || pageNumber || 1;
  const pageImageUrl = api.getPageImageUrl(submissionId, targetPage);

  if (hasValidRegion && !imgError) {
    const { x, y, width, height } = region!;
    const aspectRatioPct = Math.min(100, Math.max(15, (height / width) * 100));

    return (
      <div
        className={`relative w-full overflow-hidden rounded-md border border-hairline bg-white dark:bg-zinc-900 shadow-xs ${className}`}
        style={{ maxHeight: maxContainerHeight }}
      >
        <div
          className="relative w-full"
          style={{
            paddingBottom: `${aspectRatioPct}%`,
          }}
        >
          <img
            src={pageImageUrl}
            alt={alt}
            onError={() => setImgError(true)}
            className="absolute select-none pointer-events-none"
            style={{
              position: "absolute",
              left: `-${(x / width) * 100}%`,
              top: `-${(y / height) * 100}%`,
              width: `${(1 / width) * 100}%`,
              height: `${(1 / height) * 100}%`,
              maxWidth: "none",
              maxHeight: "none",
            }}
          />
        </div>
      </div>
    );
  }

  // Fallback to legacy crop URL if available
  if (fallbackCropUrl) {
    return (
      <img
        src={fallbackCropUrl}
        alt={alt}
        className={`w-auto object-contain rounded shadow-xs ${className}`}
        style={{ maxHeight: maxContainerHeight }}
      />
    );
  }

  // Empty state when no crop or region is available
  return (
    <div className="text-center py-6 px-4">
      <FileText className="h-8 w-8 text-ink-muted mx-auto mb-1.5 opacity-60" />
      <span className="text-xs text-ink font-semibold block">
        Handwriting crop not available
      </span>
      <span className="text-[11px] text-ink-muted block mt-0.5">
        Check transcription or view the document page.
      </span>
    </div>
  );
}
