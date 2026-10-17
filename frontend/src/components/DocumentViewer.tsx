"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Flag,
  Eye,
  Move,
  Check,
  Loader2,
  Sliders,
  Edit3,
  X,
  ShieldCheck,
  Archive,
} from "lucide-react";
import { GradedAnswer, AnswerRegion } from "@/lib/types";
import { api } from "@/lib/api";

type HandleType = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface DraftRegionCoord {
  x: number;
  y: number;
  width: number;
  height: number;
  isModified?: boolean;
}

interface DocumentViewerProps {
  submissionId: string;
  pageCount: number;
  answers: GradedAnswer[];
  onSelectAnswer: (answer: GradedAnswer) => void;
  onInspectAnswer?: (answer: GradedAnswer) => void;
  selectedAnswerId?: string;
  editingAnswerId?: string | null;
  onSetEditingAnswerId?: (id: string | null) => void;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onUpdateRegion?: (
    regionId: string,
    coords: { x: number; y: number; width: number; height: number; page_number: number }
  ) => Promise<void>;
  totalAwardedMarks?: number;
  maxMarks?: number;
  readOnly?: boolean;
  hideScoreStamp?: boolean;
}

export function DocumentViewer({
  submissionId,
  pageCount,
  answers,
  onSelectAnswer,
  onInspectAnswer,
  selectedAnswerId,
  editingAnswerId: propEditingAnswerId,
  onSetEditingAnswerId,
  currentPage: propCurrentPage,
  onPageChange,
  onUpdateRegion,
  totalAwardedMarks,
  maxMarks,
  readOnly = false,
  hideScoreStamp = false,
}: DocumentViewerProps) {
  const [internalPage, setInternalPage] = useState<number>(1);
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [hoveredAnswerId, setHoveredAnswerId] = useState<string | null>(null);
  const [imageError, setImageError] = useState<boolean>(false);
  const [isPageImageLoading, setIsPageImageLoading] = useState<boolean>(true);

  // Set of loaded page keys to avoid re-triggering loading skeleton when flipping back & forth
  const loadedPagesRef = useRef<Set<string>>(new Set());
  const imgRef = useRef<HTMLImageElement>(null);

  // Active page is controlled if provided by parent, else local
  const currentPage = propCurrentPage !== undefined ? propCurrentPage : internalPage;

  // Clear cache if submission changes
  useEffect(() => {
    loadedPagesRef.current.clear();
  }, [submissionId]);

  // Proactively preload document pages in background so flipping between pages is instant
  useEffect(() => {
    if (!submissionId || !pageCount || pageCount <= 0) return;
    const maxPreload = Math.min(pageCount, 50);
    for (let p = 1; p <= maxPreload; p++) {
      const url = api.getPageImageUrl(submissionId, p);
      const img = new Image();
      img.src = url;
      img.onload = () => {
        loadedPagesRef.current.add(`${submissionId}_p_${p}`);
      };
    }
  }, [submissionId, pageCount]);

  useEffect(() => {
    setImageError(false);
    const key = `${submissionId}_p_${currentPage}`;
    if (loadedPagesRef.current.has(key)) {
      setIsPageImageLoading(false);
    } else if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      loadedPagesRef.current.add(key);
      setIsPageImageLoading(false);
    } else {
      setIsPageImageLoading(true);
    }
  }, [currentPage, submissionId]);

  const setCurrentPage = (p: number | ((prev: number) => number)) => {
    const next = typeof p === "function" ? p(currentPage) : p;
    const clamped = Math.max(1, Math.min(Math.max(1, pageCount), next));
    if (onPageChange) {
      onPageChange(clamped);
    } else {
      setInternalPage(clamped);
    }
  };

  // Draft coordinates for locally dragged/resized regions
  const [draftCoords, setDraftCoords] = useState<Record<string, DraftRegionCoord>>({});
  const [activeDragRegionId, setActiveDragRegionId] = useState<string | null>(null);
  const [savingRegionId, setSavingRegionId] = useState<string | null>(null);
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);

  // Sync with propEditingAnswerId
  useEffect(() => {
    if (propEditingAnswerId) {
      const match = answers.find((a) => a.id === propEditingAnswerId);
      const reg = match?.regions?.[0];
      if (reg) {
        setEditingRegionId(reg.id || match.id);
      }
    } else if (propEditingAnswerId === null) {
      setEditingRegionId(null);
    }
  }, [propEditingAnswerId, answers]);

  // Ref to the zoomable image container and viewport
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomScaleRef = useRef(zoomScale);
  zoomScaleRef.current = zoomScale;

  // Touch pinch-to-zoom and double-tap handling for mobile PWA
  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    let initialPinchDist = 0;
    let initialZoom = 1;
    let lastTapTime = 0;
    let touchStartPos = { x: 0, y: 0 };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        initialPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialZoom = zoomScaleRef.current;
      } else if (e.touches.length === 1) {
        touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialPinchDist > 0) {
        e.preventDefault();
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = currentDist / initialPinchDist;
        const targetZoom = Math.min(3.0, Math.max(0.5, Number((initialZoom * factor).toFixed(2))));
        setZoomScale(targetZoom);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialPinchDist = 0;
      }
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const distMoved = Math.hypot(
          touch.clientX - touchStartPos.x,
          touch.clientY - touchStartPos.y
        );
        const now = Date.now();
        // Double-tap zoom toggle (within 300ms and minimal finger travel)
        if (distMoved < 15 && now - lastTapTime < 300) {
          setZoomScale((prev) => (prev > 1.1 ? 1.0 : 1.8));
          lastTapTime = 0;
        } else {
          lastTapTime = now;
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setZoomScale((prev) =>
          Math.min(3.0, Math.max(0.5, Number((prev - e.deltaY * 0.005).toFixed(2))))
        );
      }
    };

    container.addEventListener("touchstart", onTouchStart, { passive: false });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchcancel", onTouchEnd);
    container.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
      container.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Ref tracking active mouse drag session
  const dragStateRef = useRef<{
    handle: HandleType;
    regionId: string;
    answerId: string;
    startClientX: number;
    startClientY: number;
    initialBox: { x: number; y: number; width: number; height: number };
    containerW: number;
    containerH: number;
    hasMoved: boolean;
  } | null>(null);

  // Auto-navigate to the page containing the selected answer when selection changes
  useEffect(() => {
    if (selectedAnswerId) {
      const selected = answers.find((a) => a.id === selectedAnswerId);
      const targetPage = selected?.page_number || selected?.regions?.[0]?.page_number;
      if (targetPage && targetPage !== currentPage) {
        setCurrentPage(targetPage);
      }
    }
  }, [selectedAnswerId]);

  // Global mousemove and mouseup listeners for dragging/resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current) return;
      const { handle, startClientX, startClientY, initialBox, containerW, containerH } =
        dragStateRef.current;

      const deltaX_px = (e.clientX - startClientX) / zoomScale;
      const deltaY_px = (e.clientY - startClientY) / zoomScale;

      if (Math.abs(deltaX_px) > 2 || Math.abs(deltaY_px) > 2) {
        dragStateRef.current.hasMoved = true;
      }

      const dx = deltaX_px / containerW;
      const dy = deltaY_px / containerH;

      let newX = initialBox.x;
      let newY = initialBox.y;
      let newW = initialBox.width;
      let newH = initialBox.height;

      const minSize = 0.02; // minimum 2% dimension

      switch (handle) {
        case "move": {
          newX = Math.max(0, Math.min(1 - initialBox.width, initialBox.x + dx));
          newY = Math.max(0, Math.min(1 - initialBox.height, initialBox.y + dy));
          break;
        }
        case "se": {
          newW = Math.max(minSize, Math.min(1 - initialBox.x, initialBox.width + dx));
          newH = Math.max(minSize, Math.min(1 - initialBox.y, initialBox.height + dy));
          break;
        }
        case "nw": {
          const right = initialBox.x + initialBox.width;
          const bottom = initialBox.y + initialBox.height;
          newX = Math.max(0, Math.min(right - minSize, initialBox.x + dx));
          newY = Math.max(0, Math.min(bottom - minSize, initialBox.y + dy));
          newW = right - newX;
          newH = bottom - newY;
          break;
        }
        case "ne": {
          const bottom = initialBox.y + initialBox.height;
          newY = Math.max(0, Math.min(bottom - minSize, initialBox.y + dy));
          newW = Math.max(minSize, Math.min(1 - initialBox.x, initialBox.width + dx));
          newH = bottom - newY;
          break;
        }
        case "sw": {
          const right = initialBox.x + initialBox.width;
          newX = Math.max(0, Math.min(right - minSize, initialBox.x + dx));
          newW = right - newX;
          newH = Math.max(minSize, Math.min(1 - initialBox.y, initialBox.height + dy));
          break;
        }
        case "n": {
          const bottom = initialBox.y + initialBox.height;
          newY = Math.max(0, Math.min(bottom - minSize, initialBox.y + dy));
          newH = bottom - newY;
          break;
        }
        case "s": {
          newH = Math.max(minSize, Math.min(1 - initialBox.y, initialBox.height + dy));
          break;
        }
        case "w": {
          const right = initialBox.x + initialBox.width;
          newX = Math.max(0, Math.min(right - minSize, initialBox.x + dx));
          newW = right - newX;
          break;
        }
        case "e": {
          newW = Math.max(minSize, Math.min(1 - initialBox.x, initialBox.width + dx));
          break;
        }
      }

      setDraftCoords((prev) => ({
        ...prev,
        [dragStateRef.current!.regionId]: {
          x: Math.round(newX * 1000) / 1000,
          y: Math.round(newY * 1000) / 1000,
          width: Math.round(newW * 1000) / 1000,
          height: Math.round(newH * 1000) / 1000,
          isModified: true,
        },
      }));
    };

    const handleMouseUp = () => {
      if (dragStateRef.current) {
        dragStateRef.current = null;
        setActiveDragRegionId(null);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [zoomScale]);

  const handleStartDrag = (
    e: React.MouseEvent,
    handle: HandleType,
    region: AnswerRegion,
    answer: GradedAnswer
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (!imageContainerRef.current) return;

    // Use container dimensions divided by zoomScale to get unscaled base resolution
    const containerRect = imageContainerRef.current.getBoundingClientRect();
    const containerW = containerRect.width / zoomScale;
    const containerH = containerRect.height / zoomScale;

    const regId = region.id || `${answer.id}`;
    const current = draftCoords[regId] || {
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
    };

    dragStateRef.current = {
      handle,
      regionId: regId,
      answerId: answer.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialBox: {
        x: current.x,
        y: current.y,
        width: current.width,
        height: current.height,
      },
      containerW,
      containerH,
      hasMoved: false,
    };

    setActiveDragRegionId(regId);
    onSelectAnswer(answer);
  };

  const handleEnterEditMode = (
    e: React.MouseEvent,
    region: AnswerRegion,
    answer: GradedAnswer
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const regId = region.id || answer.id;
    setEditingRegionId(regId);
    if (onSetEditingAnswerId) {
      onSetEditingAnswerId(answer.id);
    }
    onSelectAnswer(answer);
  };

  const handleExitEditMode = (e?: React.MouseEvent, regId?: string) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (regId && draftCoords[regId]) {
      setDraftCoords((prev) => {
        const copy = { ...prev };
        delete copy[regId];
        return copy;
      });
    }
    setEditingRegionId(null);
    if (onSetEditingAnswerId) {
      onSetEditingAnswerId(null);
    }
  };

  const handleSaveRegion = async (regionId: string, coords: DraftRegionCoord) => {
    if (!onUpdateRegion) return;
    setSavingRegionId(regionId);
    try {
      await onUpdateRegion(regionId, {
        page_number: currentPage,
        x: coords.x,
        y: coords.y,
        width: coords.width,
        height: coords.height,
      });
      // Clear draft coords on save so the server response updates the display
      setDraftCoords((prev) => {
        const copy = { ...prev };
        delete copy[regionId];
        return copy;
      });
      setEditingRegionId(null);
      if (onSetEditingAnswerId) {
        onSetEditingAnswerId(null);
      }
    } finally {
      setSavingRegionId(null);
    }
  };

  const handleRevertRegion = (regionId: string) => {
    setDraftCoords((prev) => {
      const copy = { ...prev };
      delete copy[regionId];
      return copy;
    });
    setEditingRegionId(null);
    if (onSetEditingAnswerId) {
      onSetEditingAnswerId(null);
    }
  };

  const totalScore =
    totalAwardedMarks !== undefined
      ? totalAwardedMarks
      : answers.filter((a) => !a.is_extra_attempt).reduce((s, a) => s + (a.awarded_marks || 0), 0);
  const totalMax =
    maxMarks !== undefined && maxMarks > 0
      ? maxMarks
      : answers.filter((a) => !a.is_extra_attempt).reduce((s, a) => s + (a.max_marks || 0), 0) || 25;
  const scorePct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  // Group all regions for the current page
  const pageRegions: { region: AnswerRegion; answer: GradedAnswer }[] = [];
  answers.forEach((ans) => {
    (ans.regions || []).forEach((reg) => {
      if (reg.page_number === currentPage) {
        pageRegions.push({ region: reg, answer: ans });
      }
    });
  });

  const handleZoomIn = () => setZoomScale((prev) => Math.min(3.0, Number((prev + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoomScale((prev) => Math.max(0.5, Number((prev - 0.25).toFixed(2))));
  const handleResetZoom = () => setZoomScale(1.0);

  const getStatusColor = (ans: GradedAnswer) => {
    if (ans.needs_review) {
      return {
        border: "border-purple-500",
        bg: "bg-purple-500/10 hover:bg-purple-500/20",
        badge: "bg-purple-600 text-white",
        text: "text-purple-700",
        icon: Flag,
        statusLabel: "Needs Review",
      };
    }
    if (ans.awarded_marks >= ans.max_marks && ans.max_marks > 0) {
      return {
        border: "border-emerald-600",
        bg: "bg-emerald-500/10 hover:bg-emerald-500/20",
        badge: "bg-emerald-600 text-white",
        text: "text-emerald-700",
        icon: CheckCircle2,
        statusLabel: "Full Marks",
      };
    }
    if (ans.awarded_marks > 0) {
      return {
        border: "border-amber-600",
        bg: "bg-amber-500/10 hover:bg-amber-500/20",
        badge: "bg-amber-600 text-white",
        text: "text-amber-800",
        icon: AlertTriangle,
        statusLabel: "Partial Marks",
      };
    }
    return {
      border: "border-rose-600",
      bg: "bg-rose-500/10 hover:bg-rose-500/20",
      badge: "bg-rose-600 text-white",
      text: "text-rose-700",
      icon: XCircle,
      statusLabel: "Incorrect",
    };
  };

  const pageImageUrl = api.getPageImageUrl(submissionId, currentPage);

  return (
    <div className="flex flex-col h-full rounded-lg border border-hairline bg-surface overflow-hidden shadow-notion-card select-none">
      {/* Top Toolbar - Clean Notion Aesthetic */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 border-b border-hairline bg-canvas-soft px-3 sm:px-4 py-2 sm:py-2.5">
        {/* Page selector */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="rounded p-1 sm:p-1.5 text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-40 transition-colors cursor-pointer"
            title="Previous Page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-semibold text-ink">
            Page <span className="text-primary font-bold">{currentPage}</span> of{" "}
            <span className="text-ink">{Math.max(1, pageCount)}</span>
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
            disabled={currentPage >= pageCount}
            className="rounded p-1 sm:p-1.5 text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-40 transition-colors cursor-pointer"
            title="Next Page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Quick page pills */}
          {pageCount > 1 && (
            <div className="hidden sm:flex items-center gap-1 ml-2">
              {Array.from({ length: pageCount }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`h-6 w-6 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                    currentPage === i + 1
                      ? "bg-primary text-white shadow-xs font-bold"
                      : "bg-surface border border-hairline text-ink-secondary hover:bg-canvas-soft hover:text-ink"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Drag & Resize Instruction Indicator */}
        {editingRegionId || propEditingAnswerId ? (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-primary/10 border border-primary/30 text-[11px] text-primary font-medium shadow-2xs animate-in fade-in">
            <Sliders className="h-3 w-3 shrink-0" />
            <span>Editing mode: Drag corners to resize • Drag inside to move</span>
            <button
              type="button"
              onClick={() => handleExitEditMode()}
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
            <span>Click any question box to inspect marks & review</span>
          </div>
        ) : (
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-hairline text-[11px] text-ink-secondary shadow-2xs">
            <span>Click box to inspect • Click <Edit3 className="h-2.5 w-2.5 inline text-primary mx-0.5" /> to adjust box</span>
          </div>
        )}

        {/* Legend */}
        <div className="hidden lg:flex items-center gap-3.5 text-[11px] text-ink-secondary">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600"></span> Full
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span> Partial
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span> Incorrect
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-600"></span> Review
          </span>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-surface rounded-md p-0.5 sm:p-1 border border-hairline shadow-2xs">
          <button
            onClick={handleZoomOut}
            className="rounded p-1 text-ink-muted hover:bg-canvas-soft hover:text-ink transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="px-1.5 sm:px-2 font-mono text-[11px] sm:text-xs font-medium text-ink min-w-[2.5rem] sm:min-w-[3rem] text-center">
            {Math.round(zoomScale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="rounded p-1 text-ink-muted hover:bg-canvas-soft hover:text-ink transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleResetZoom}
            className="rounded p-1 text-ink-muted hover:bg-canvas-soft hover:text-ink transition-colors cursor-pointer"
            title="Reset Zoom"
          >
            <RotateCcw className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas Viewport - Paper-on-Desk Soothing Neutral Background with Pinch-to-Zoom Support */}
      <div
        ref={viewportRef}
        className="relative flex-1 overflow-auto bg-[#f6f6f4] p-1.5 sm:p-6 md:p-8 flex items-start justify-center touch-pan-x touch-pan-y overscroll-contain select-none"
      >
        <div
          ref={imageContainerRef}
          className="relative transition-transform origin-top duration-150 shadow-md rounded-sm border border-hairline/80 inline-block bg-white max-w-full"
          style={{ transform: `scale(${zoomScale})` }}
        >
          {/* Base Page Image, Loading Spinner, or Retention Purged Notice */}
          {imageError ? (
            <div className="flex flex-col items-center justify-center p-10 sm:p-16 text-center max-w-[850px] w-full min-h-[480px] space-y-3 bg-surface rounded-sm">
              <div className="h-12 w-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mx-auto">
                <Archive className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-ink">Page Image Unavailable</h3>
              <p className="text-xs text-ink-muted max-w-sm mx-auto leading-relaxed">
                Scanned answer sheet pages and crop previews for this paper have been purged in accordance with the 15-day storage retention policy. Question marks and evaluator rationales remain permanently archived.
              </p>
            </div>
          ) : (
            <>
              {/* Cloudinary Paper Fetching Loading Screen */}
              {isPageImageLoading && (
                <div className="flex flex-col items-center justify-center p-8 sm:p-16 text-center max-w-[850px] w-[85vw] sm:w-[680px] md:w-[780px] min-h-[480px] sm:min-h-[640px] bg-white rounded-sm space-y-4 shadow-2xs">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-xs animate-pulse">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                  <div className="space-y-1.5 max-w-xs sm:max-w-sm">
                    <h3 className="text-sm sm:text-base font-bold text-ink">
                      Fetching Examination Sheet...
                    </h3>
                    <p className="text-xs text-ink-muted leading-relaxed">
                      Rendering Page {currentPage} of {Math.max(1, pageCount)} from secure paper vault. Please wait a moment.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1 text-[11px] font-mono text-ink-muted bg-canvas-soft px-3 py-1 rounded-full border border-hairline">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                    <span>Synchronizing evaluation overlays</span>
                  </div>
                </div>
              )}

              <img
                ref={imgRef}
                src={pageImageUrl}
                alt={`Student Page ${currentPage}`}
                className={`max-w-[850px] w-full h-auto select-none pointer-events-none rounded-sm transition-opacity duration-150 ${
                  isPageImageLoading ? "opacity-0 absolute top-0 left-0 pointer-events-none h-0" : "block opacity-100"
                }`}
                loading="eager"
                decoding="async"
                onLoad={() => {
                  loadedPagesRef.current.add(`${submissionId}_p_${currentPage}`);
                  setIsPageImageLoading(false);
                }}
                onError={() => {
                  setIsPageImageLoading(false);
                  setImageError(true);
                }}
              />
            </>
          )}

          {/* Only render teacher score stamp and annotation overlays once the image has completely loaded */}
          {!isPageImageLoading && !imageError && (
            <>

          {/* Page 1 Teacher Score Stamp (Clean Red Ink Stamp Aesthetic) */}
          {!hideScoreStamp && currentPage === 1 && totalMax > 0 && totalAwardedMarks !== undefined && totalAwardedMarks !== null && (
            <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-20 pointer-events-none select-none rounded-md sm:rounded-lg border sm:border-2 border-red-600/90 bg-white/95 backdrop-blur-xs px-2 py-1 sm:px-4 sm:py-2 shadow-sm text-left border-dashed">
              <div className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-red-700">
                Total Marks
              </div>
              <div className="text-sm sm:text-3xl font-black text-red-600 font-mono tracking-tight leading-none mt-0.5">
                {totalScore} <span className="text-[10px] sm:text-base text-red-600/70 font-normal">/ {totalMax}</span>
              </div>
              <div className="text-[8px] sm:text-[10px] font-bold text-red-700 mt-0.5">
                {scorePct}% Score
              </div>
            </div>
          )}

          {/* Bounding Box Overlays */}
          {pageRegions.map(({ region, answer }, idx) => {
            const regId = region.id || `${answer.id}-${idx}`;
            const isSelected = selectedAnswerId === answer.id;
            const isHovered = hoveredAnswerId === answer.id;
            const style = getStatusColor(answer);
            const StatusIcon = style.icon;

            // Use draft coordinates if user moved/resized, else base region
            const coords = draftCoords[regId] || {
              x: region.x,
              y: region.y,
              width: region.width,
              height: region.height,
            };
            const isModified = Boolean(draftCoords[regId]?.isModified);
            const isActivelyDragging = activeDragRegionId === regId;
            const isEditing =
              editingRegionId === regId ||
              (Boolean(propEditingAnswerId) && propEditingAnswerId === answer.id);

            const allRegions = answer.regions || [];
            const regionIndex = allRegions.findIndex(
              (r) =>
                r.id === region.id ||
                (r.page_number === region.page_number && r.x === region.x && r.y === region.y)
            );
            const isMultiRegion = allRegions.length > 1;

            return (
              <div
                key={regId}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isEditing) return;
                  if (onInspectAnswer) {
                    onInspectAnswer(answer);
                  } else {
                    onSelectAnswer(answer);
                  }
                }}
                onMouseEnter={() => setHoveredAnswerId(answer.id)}
                onMouseLeave={() => setHoveredAnswerId(null)}
                className={`absolute rounded-xs border-2 box-border transition-colors ${
                  isModified ? "border-dashed border-primary bg-primary/10 shadow-sm" : `${style.border} ${style.bg}`
                } ${
                  isEditing
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-white z-30 cursor-move"
                    : isSelected
                    ? "ring-1 ring-primary/60 z-20 cursor-pointer"
                    : "z-10 hover:z-20 cursor-pointer"
                }`}
                style={{
                  left: `${coords.x * 100}%`,
                  top: `${coords.y * 100}%`,
                  width: `${coords.width * 100}%`,
                  height: `${coords.height * 100}%`,
                }}
                onMouseDown={(e) => {
                  // Drag inside box to move only when in edit mode
                  if (isEditing) {
                    handleStartDrag(e, "move", region, answer);
                  }
                }}
              >
                {/* Score badge at top-left of box */}
                <div
                  className={`absolute -top-6 left-0 flex items-center gap-1.5 whitespace-nowrap rounded-xs px-2 py-0.5 text-[10px] font-bold shadow-xs transition-all pointer-events-none select-none ${
                    style.badge
                  } ${isEditing ? "scale-105" : ""}`}
                >
                  <StatusIcon className="h-3 w-3" />
                  <span>
                    {answer.question_id} — {answer.awarded_marks}/{answer.max_marks}
                    {isMultiRegion && (
                      <span className="ml-1 opacity-90 font-normal">
                        (Part {regionIndex >= 0 ? regionIndex + 1 : idx + 1}/{allRegions.length})
                      </span>
                    )}
                  </span>
                </div>

                {/* Revaluation Flag on Question (Admin & Student) */}
                {answer.revaluation && (
                  <div
                    className={`absolute -top-6 right-0 flex items-center gap-1 whitespace-nowrap rounded-xs px-2 py-0.5 text-[10px] font-bold shadow-xs select-none z-30 ${
                      answer.revaluation.status === "SUBMITTED" || answer.revaluation.status === "UNDER_REVIEW"
                        ? "bg-amber-500 text-white animate-pulse border border-amber-600"
                        : answer.revaluation.decision === "MARKS_REVISED"
                        ? "bg-emerald-600 text-white border border-emerald-700"
                        : "bg-slate-600 text-white border border-slate-700"
                    }`}
                  >
                    {answer.revaluation.status === "SUBMITTED" || answer.revaluation.status === "UNDER_REVIEW" ? (
                      <>
                        <Flag className="h-3 w-3 fill-current" />
                        <span>REVALUATION APPEAL</span>
                      </>
                    ) : answer.revaluation.decision === "MARKS_REVISED" ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        <span>MARKS REVISED</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3 w-3" />
                        <span>MARKS UPHELD</span>
                      </>
                    )}
                  </div>
                )}

                {/* Live Dimensions Tooltip during Drag */}
                {isActivelyDragging && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none bg-black/80 text-white font-mono text-[10px] px-2 py-0.5 rounded-full shadow-md z-50 whitespace-nowrap">
                    {Math.round(coords.width * 100)}% × {Math.round(coords.height * 100)}%
                  </div>
                )}

                {/* Action Buttons Cluster + Notion Hover Tooltip */}
                {(() => {
                  const isNearLeft = coords.x + coords.width < 0.35;
                  return (
                    <div
                      className="absolute -top-3.5 -right-3.5 z-40 flex items-center"
                      onMouseEnter={() => setHoveredAnswerId(answer.id)}
                    >
                      {/* Notion Tooltip Overlay beside Eye icon */}
                      {isHovered && !isEditing && !isActivelyDragging && (
                        <div
                          className={`absolute ${
                            isNearLeft ? "left-full ml-2" : "right-full mr-2"
                          } -top-1 w-64 rounded-lg border border-hairline bg-surface p-3 text-xs text-ink shadow-notion-modal z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-100`}
                        >
                          <div className="flex items-center justify-between font-semibold">
                            <span className="text-primary font-mono font-bold flex items-center gap-1.5">
                              <StatusIcon className="h-3.5 w-3.5" />
                              {answer.question_id}
                            </span>
                            <span className={`font-mono text-xs font-bold ${style.text}`}>
                              {answer.awarded_marks}/{answer.max_marks} Marks
                            </span>
                          </div>

                          {answer.revaluation && (
                            <div className={`mt-1.5 p-1.5 rounded flex items-center gap-1.5 text-[10px] font-medium ${
                              answer.revaluation.status === "RESOLVED"
                                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                                : "bg-amber-50 border border-amber-200 text-amber-800"
                            }`}>
                              {answer.revaluation.status === "RESOLVED" ? (
                                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
                              ) : (
                                <Flag className="h-3 w-3 shrink-0 text-amber-600 fill-amber-600" />
                              )}
                              <span>
                                Revaluation: {answer.revaluation.status.replace("_", " ")}
                                {answer.revaluation.decision && ` (${answer.revaluation.decision.replace("_", " ")})`}
                              </span>
                            </div>
                          )}

                          <p className="mt-1.5 line-clamp-2 text-ink-muted text-[11px] leading-relaxed">
                            {answer.grading_rationale || "Click to inspect answer."}
                          </p>

                          <div className="mt-2 pt-1.5 border-t border-hairline flex items-center justify-between text-[10px]">
                            <span className="text-primary font-semibold flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {readOnly ? "Click box to inspect & appeal" : "Click box to inspect"}
                            </span>
                            {!readOnly && (
                              <span className="text-ink-muted flex items-center gap-1">
                                <Edit3 className="h-3 w-3 text-primary" />
                                Edit box
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Pill container with Eye & Edit (or Editing & Cross button) - Hidden in readOnly */}
                      {!readOnly && (
                        <div
                          className={`flex items-center gap-0.5 rounded-full p-0.5 border shadow-xs transition-all ${
                            isEditing
                              ? "bg-surface border-primary shadow-md ring-2 ring-primary/20 scale-105"
                              : "bg-surface border-hairline hover:border-[#b0b0b0]"
                          }`}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          {isEditing ? (
                            <>
                              <span className="text-[10px] font-bold text-primary pl-1.5 pr-0.5 flex items-center gap-1 select-none">
                                <Sliders className="h-2.5 w-2.5" />
                                Editing
                              </span>
                              {/* Cross Button: Removes from edit mode */}
                              <button
                                type="button"
                                onClick={(e) => handleExitEditMode(e, regId)}
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 hover:text-rose-700 transition-colors cursor-pointer shadow-2xs"
                                title="Exit edit mode (remove handles)"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Eye button: Opens modal */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onInspectAnswer) {
                                    onInspectAnswer(answer);
                                  } else {
                                    onSelectAnswer(answer);
                                  }
                                }}
                                className="flex h-5 w-5 items-center justify-center rounded-full text-ink-muted hover:text-primary hover:bg-canvas-soft transition-colors cursor-pointer"
                                title="Inspect answer in modal"
                              >
                                <Eye className="h-3 w-3" />
                              </button>

                              {/* Small Edit button: Triggers edit mode */}
                              <button
                                type="button"
                                onClick={(e) => handleEnterEditMode(e, region, answer)}
                                className="flex h-5 w-5 items-center justify-center rounded-full text-ink-muted hover:text-primary hover:bg-canvas-soft transition-colors cursor-pointer"
                                title="Adjust & resize bounding box"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 8 Interactive Drag Resize Handles (Visible ONLY when in edit mode and NOT readOnly) */}
                {!readOnly && isEditing && (
                  <>
                    {/* NW Corner */}
                    <div
                      onMouseDown={(e) => handleStartDrag(e, "nw", region, answer)}
                      className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-primary rounded-xs shadow-xs cursor-nwse-resize z-40 hover:scale-125 transition-transform"
                      title="Drag to resize top-left"
                    />
                    {/* N Edge */}
                    <div
                      onMouseDown={(e) => handleStartDrag(e, "n", region, answer)}
                      className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-4 h-2 bg-white border-2 border-primary rounded-xs shadow-xs cursor-ns-resize z-40 hover:scale-125 transition-transform"
                      title="Drag to resize top"
                    />
                    {/* NE Corner */}
                    <div
                      onMouseDown={(e) => handleStartDrag(e, "ne", region, answer)}
                      className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-primary rounded-xs shadow-xs cursor-nesw-resize z-40 hover:scale-125 transition-transform"
                      title="Drag to resize top-right"
                    />
                    {/* E Edge */}
                    <div
                      onMouseDown={(e) => handleStartDrag(e, "e", region, answer)}
                      className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-2 h-4 bg-white border-2 border-primary rounded-xs shadow-xs cursor-ew-resize z-40 hover:scale-125 transition-transform"
                      title="Drag to resize right"
                    />
                    {/* SE Corner */}
                    <div
                      onMouseDown={(e) => handleStartDrag(e, "se", region, answer)}
                      className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-primary rounded-xs shadow-xs cursor-nwse-resize z-40 hover:scale-125 transition-transform"
                      title="Drag to resize bottom-right"
                    />
                    {/* S Edge */}
                    <div
                      onMouseDown={(e) => handleStartDrag(e, "s", region, answer)}
                      className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-2 bg-white border-2 border-primary rounded-xs shadow-xs cursor-ns-resize z-40 hover:scale-125 transition-transform"
                      title="Drag to resize bottom"
                    />
                    {/* SW Corner */}
                    <div
                      onMouseDown={(e) => handleStartDrag(e, "sw", region, answer)}
                      className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-primary rounded-xs shadow-xs cursor-nesw-resize z-40 hover:scale-125 transition-transform"
                      title="Drag to resize bottom-left"
                    />
                    {/* W Edge */}
                    <div
                      onMouseDown={(e) => handleStartDrag(e, "w", region, answer)}
                      className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-2 h-4 bg-white border-2 border-primary rounded-xs shadow-xs cursor-ew-resize z-40 hover:scale-125 transition-transform"
                      title="Drag to resize left"
                    />
                  </>
                )}

                {/* Floating Save / Revert / Exit Action Bar on Modified or Editing Box */}
                {(isModified || isEditing) && (
                  <div
                    className={`absolute ${
                      coords.y + coords.height > 0.88 ? "-top-10" : "-bottom-10"
                    } left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-surface border border-hairline shadow-lg px-2.5 py-1 rounded-md text-xs z-50 animate-in fade-in zoom-in-95 pointer-events-auto select-none whitespace-nowrap`}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {isModified ? (
                      <>
                        <span className="text-[10px] text-ink-muted font-medium">Box adjusted</span>
                        <button
                          type="button"
                          onClick={() => handleSaveRegion(region.id || answer.id, coords)}
                          disabled={savingRegionId === (region.id || answer.id)}
                          className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-primary text-white text-[11px] font-semibold hover:bg-primary-active transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                        >
                          {savingRegionId === (region.id || answer.id) ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          Save Box
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevertRegion(regId)}
                          className="flex items-center gap-1 p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors text-[11px] cursor-pointer"
                          title="Revert to original AI position"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Revert
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] text-ink-muted font-medium">
                        Drag handles to resize or body to move
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleExitEditMode(e, regId)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors text-[11px] font-medium cursor-pointer ml-1"
                      title="Exit edit mode"
                    >
                      <X className="h-3 w-3" />
                      Exit
                    </button>
                  </div>
                )}
              </div>
            );
          })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
