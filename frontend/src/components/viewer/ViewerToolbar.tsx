"use client";

import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  EyeOff,
  Sliders,
  Edit3,
  X,
} from "lucide-react";
import { GradedAnswer } from "@/lib/types";
import { AddBoxDropdown } from "./AddBoxDropdown";

interface ViewerToolbarProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  zoomScale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  showAnnotations: boolean;
  onToggleAnnotations: () => void;
  answers: GradedAnswer[];
  readOnly: boolean;
  editingRegionId: string | null;
  onExitEditMode: () => void;
  onSpawnDraftBox: (ansId: string) => void;
}

export function ViewerToolbar({
  currentPage,
  totalPages,
  onPageChange,
  zoomScale,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  showAnnotations,
  onToggleAnnotations,
  answers,
  readOnly,
  editingRegionId,
  onExitEditMode,
  onSpawnDraftBox,
}: ViewerToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-surface px-3 py-2 text-xs select-none">
      {/* Left: Page Navigation Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="inline-flex rounded-md p-1 sm:p-1.5 text-ink-muted btn-glass-utility disabled:opacity-35 transition-all cursor-pointer"
          title="Previous Page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-semibold text-ink px-1.5">
          Page <span className="text-primary font-bold font-mono">{currentPage}</span> of{" "}
          <span className="text-ink font-mono">{totalPages}</span>
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="inline-flex rounded-md p-1 sm:p-1.5 text-ink-muted btn-glass-utility disabled:opacity-35 transition-all cursor-pointer"
          title="Next Page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Quick page pills */}
        {totalPages > 1 && (
          <div className="hidden sm:flex items-center gap-1 ml-1.5">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPageChange(i + 1)}
                className={`h-6 w-6 rounded-md text-[11px] font-semibold transition-all cursor-pointer font-mono ${
                  currentPage === i + 1
                    ? "btn-glass-primary font-bold"
                    : "btn-glass-utility text-ink-secondary"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Center: "+ Add Box" quick dropdown */}
      {!readOnly && (
        <AddBoxDropdown
          answers={answers}
          currentPage={currentPage}
          onSpawnDraftBox={onSpawnDraftBox}
        />
      )}

      {/* Editing Mode or Instruction Notice */}
      {editingRegionId ? (
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-primary/10 border border-primary/30 text-[11px] text-primary font-medium shadow-2xs animate-in fade-in">
          <Sliders className="h-3 w-3 shrink-0" />
          <span>Editing mode: Drag corners to resize • Drag inside to move</span>
          <button
            type="button"
            onClick={onExitEditMode}
            className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface border border-primary/30 text-ink text-[10px] font-semibold hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors cursor-pointer"
            title="Exit edit mode"
          >
            <X className="h-2.5 w-2.5" />
            Exit Edit
          </button>
        </div>
      ) : readOnly ? (
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-hairline text-[11px] text-ink-secondary shadow-2xs">
          <Eye className="h-3 w-3 text-primary inline shrink-0" />
          <span>Click any question box to inspect marks &amp; review</span>
        </div>
      ) : (
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-hairline text-[11px] text-ink-secondary shadow-2xs">
          <span>Click box to inspect • Click <Edit3 className="h-2.5 w-2.5 inline text-primary mx-0.5" /> to adjust box</span>
        </div>
      )}

      {/* Status Legend */}
      <div className="hidden lg:flex items-center gap-3.5 text-[11px] text-ink-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600"></span> Full
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span> Partial
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#872323]"></span> Incorrect
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#553578]"></span> Review
        </span>
      </div>

      {/* Right: Annotations toggle & Zoom controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleAnnotations}
          className={`btn-glass-utility flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            showAnnotations ? "text-primary" : "text-ink-muted opacity-80"
          }`}
          title={showAnnotations ? "Hide bounding boxes & annotations" : "Show bounding boxes & annotations"}
        >
          {showAnnotations ? (
            <Eye className="h-3.5 w-3.5 text-primary" />
          ) : (
            <EyeOff className="h-3.5 w-3.5 text-ink-muted" />
          )}
          <span className="hidden sm:inline">
            {showAnnotations ? "Annotations On" : "Annotations Off"}
          </span>
        </button>

        {/* Zoom Controls */}
        <div className="hidden sm:flex items-center gap-0.5 bg-surface rounded-md p-0.5 border border-hairline shadow-2xs">
          <button
            onClick={onZoomOut}
            disabled={zoomScale <= 1.0}
            className="rounded p-1 text-ink-muted hover:bg-canvas-soft hover:text-ink disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="px-1.5 font-mono text-[11px] font-semibold text-ink min-w-[2.75rem] text-center select-none">
            {Math.round(zoomScale * 100)}%
          </span>
          <button
            onClick={onZoomIn}
            disabled={zoomScale >= 3.5}
            className="rounded p-1 text-ink-muted hover:bg-canvas-soft hover:text-ink disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          {zoomScale !== 1.0 && (
            <button
              onClick={onResetZoom}
              className="rounded p-1 text-ink-muted hover:bg-canvas-soft hover:text-ink transition-colors cursor-pointer"
              title="Reset Zoom"
            >
              <RotateCcw className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
