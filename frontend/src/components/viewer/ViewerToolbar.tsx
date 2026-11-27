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
  Calendar,
} from "lucide-react";
import { GradedAnswer } from "@/lib/types";
import { formatExamDate } from "@/lib/dateFormat";
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
  examDate?: string | null;
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
  examDate,
}: ViewerToolbarProps) {
  const formattedExamDate = formatExamDate(examDate);
  return (
    <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 border-b border-hairline bg-surface px-2.5 sm:px-3 py-2 text-xs select-none w-full max-w-full">
      {/* Left: Page Navigation Controls */}
      <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="notion-btn-utility min-h-0 h-7 w-7 p-0 disabled:opacity-35"
          title="Previous Page"
          aria-label="Previous Page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs font-medium text-ink px-1 whitespace-nowrap tabular-nums">
          <span className="hidden xs:inline">Page </span>
          <span className="text-primary font-semibold font-mono">{currentPage}</span>
          <span className="text-ink-muted">/{totalPages}</span>
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="notion-btn-utility min-h-0 h-7 w-7 p-0 disabled:opacity-35"
          title="Next Page"
          aria-label="Next Page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>

        {/* Quick page pills */}
        {totalPages > 1 && (
          <div className="hidden sm:flex items-center gap-1 ml-1">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPageChange(i + 1)}
                className={`min-h-0 h-6 w-6 p-0 rounded-md text-[11px] font-mono ${
                  currentPage === i + 1
                    ? "notion-btn-primary font-semibold"
                    : "notion-btn-utility text-ink-secondary"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}

        {formattedExamDate && (
          <span
            className="hidden md:inline-flex items-center gap-1 ml-1.5 px-2 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-[11px] font-medium text-ink-secondary tabular-nums whitespace-nowrap"
            title="Exam Date"
          >
            <Calendar className="h-3 w-3 text-ink-muted shrink-0" />
            <span>{formattedExamDate}</span>
          </span>
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
        <div className="w-full sm:w-auto flex items-center justify-between gap-2 px-2.5 py-1 min-h-[28px] rounded-md bg-canvas-soft border border-primary/40 text-xs text-primary font-medium overflow-hidden">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <Sliders className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">
              <span className="sm:hidden">Drag handles to resize or move</span>
              <span className="hidden sm:inline">Editing mode: Drag corners to resize • Drag inside to move</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onExitEditMode}
            className="notion-btn-utility min-h-0 h-6 px-2 text-[11px] shrink-0"
            title="Exit edit mode"
          >
            <X className="h-3 w-3 text-ink-muted" />
            <span>Exit Edit</span>
          </button>
        </div>
      ) : readOnly ? (
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-canvas-soft border border-hairline text-[11px] text-ink-secondary">
          <Eye className="h-3 w-3 text-primary inline shrink-0" />
          <span>Click any question box to inspect marks &amp; review</span>
        </div>
      ) : (
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-canvas-soft border border-hairline text-[11px] text-ink-secondary">
          <span>Click box to inspect • Click <Edit3 className="h-2.5 w-2.5 inline text-primary mx-0.5" /> to adjust box</span>
        </div>
      )}

      {/* Status Legend */}
      <div className="hidden lg:flex items-center gap-3.5 text-[11px] text-ink-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#1aae39]"></span> Full
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#dd5b00]"></span> Partial
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#c93b3b]"></span> Incorrect
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#8b5cf6]"></span> Review
        </span>
      </div>

      {/* Right: Annotations toggle & Zoom controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {zoomScale > 1.05 && (
          <button
            type="button"
            onClick={onResetZoom}
            className="sm:hidden notion-btn-utility min-h-0 h-7 px-2 text-[11px] font-mono text-primary"
            title="Reset Zoom"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{Math.round(zoomScale * 100)}%</span>
          </button>
        )}
        <button
          type="button"
          onClick={onToggleAnnotations}
          className={`notion-btn-utility min-h-0 h-7 px-2.5 ${
            showAnnotations ? "text-primary" : "text-ink-muted"
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
        <div className="hidden sm:flex items-center gap-0.5 bg-canvas-soft rounded-md p-0.5 border border-hairline">
          <button
            onClick={onZoomOut}
            disabled={zoomScale <= 1.0}
            className="rounded-sm p-1 text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="px-1.5 font-mono text-[11px] font-semibold text-ink min-w-[2.75rem] text-center select-none tabular-nums">
            {Math.round(zoomScale * 100)}%
          </span>
          <button
            onClick={onZoomIn}
            disabled={zoomScale >= 3.5}
            className="rounded-sm p-1 text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          {zoomScale !== 1.0 && (
            <button
              onClick={onResetZoom}
              className="rounded-sm p-1 text-ink-muted hover:bg-surface hover:text-ink transition-colors cursor-pointer"
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
