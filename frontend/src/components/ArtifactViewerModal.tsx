"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  Key,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  Download,
  X,
  Loader2,
  HelpCircle,
  BookOpen,
} from "lucide-react";
import { api } from "@/lib/api";

export interface ArtifactViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  examId: string;
  examTitle: string;
  examSubject?: string;
  initialArtifact?: "question-paper" | "answer-key";
  hasQuestionPaper?: boolean;
  hasAnswerKey?: boolean;
  isExamDocumentPurged?: boolean;
}

export function ArtifactViewerModal({
  isOpen,
  onClose,
  examId,
  examTitle,
  examSubject,
  initialArtifact = "question-paper",
  hasQuestionPaper = true,
  hasAnswerKey = true,
  isExamDocumentPurged = false,
}: ArtifactViewerModalProps) {
  // Active artifact tab
  const [activeArtifact, setActiveArtifact] = useState<"question-paper" | "answer-key">(
    initialArtifact
  );

  // Viewer state
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.0);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const panRef = useRef(pan);
  panRef.current = pan;

  const [loadingMeta, setLoadingMeta] = useState<boolean>(true);
  const [pageImgLoading, setPageImgLoading] = useState<boolean>(true);
  const [hasDoc, setHasDoc] = useState<boolean>(true);
  const [isPurged, setIsPurged] = useState<boolean>(isExamDocumentPurged);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Measure viewport container dimensions dynamically
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeSheetRef = useRef<HTMLDivElement>(null);
  const [containerDims, setContainerDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerDims({ width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasDoc, loadingMeta]);

  // Keep pan bounded when zoomed in on active sheet
  const clampPan = useCallback(
    (targetX: number, targetY: number, scale: number) => {
      const cW = containerDims.width > 0 ? containerDims.width : 800;
      const cH = containerDims.height > 0 ? containerDims.height : 600;

      const sW = activeSheetRef.current?.clientWidth || cW * 0.8;
      const sH = activeSheetRef.current?.clientHeight || cH * 0.9;

      const renderW = sW * scale;
      const renderH = sH * scale;

      const maxPanX = Math.max(30, (renderW - cW) / 2 + 40);
      const maxPanY = Math.max(30, (renderH - cH) / 2 + 40);

      return {
        x: Math.round(Math.max(-maxPanX, Math.min(maxPanX, targetX))),
        y: Math.round(Math.max(-maxPanY, Math.min(maxPanY, targetY))),
      };
    },
    [containerDims.width, containerDims.height]
  );

  // Reset zoom & pan on page or activeArtifact changes so sheet is cleanly framed
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1.0);
    setTouchOffset(0);
    setIsSwiping(false);
  }, [page, activeArtifact]);

  const handleZoomIn = () => {
    setZoom((z) => Math.min(3.5, Number((z + 0.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((z) => {
      const next = Math.max(1.0, Number((z - 0.25).toFixed(2)));
      if (next <= 1.05) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleResetZoom = useCallback(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, []);

  // Mobile / Desktop sliding & touch panning state
  const [touchOffset, setTouchOffset] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);
  const [slideDirection, setSlideDirection] = useState<"left" | "right" | null>(null);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef<number>(0);
  const lastTapTimeRef = useRef<number>(0);
  const isPinchingRef = useRef<boolean>(false);
  const initialPinchDistRef = useRef<number>(0);
  const initialZoomRef = useRef<number>(1);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const isSwipingRef = useRef<boolean>(false);
  isSwipingRef.current = isSwiping;
  const touchOffsetRef = useRef<number>(0);
  touchOffsetRef.current = touchOffset;
  const pageRef = useRef<number>(page);
  pageRef.current = page;
  const totalPagesRef = useRef<number>(totalPages);
  totalPagesRef.current = totalPages;

  // Native non-passive touch listeners on viewportRef to prevent page / backdrop scrolling when zoomed in
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (loadingMeta || !hasDoc || isPurged) return;

      if (e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();
        isPinchingRef.current = true;
        setIsSwiping(false);
        isSwipingRef.current = false;
        setTouchOffset(0);
        touchOffsetRef.current = 0;
        initialPinchDistRef.current = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialZoomRef.current = zoomRef.current;
        return;
      }

      if (e.touches.length === 1) {
        touchStartXRef.current = e.touches[0].clientX;
        touchStartYRef.current = e.touches[0].clientY;
        touchStartTimeRef.current = Date.now();
        panStartRef.current = { ...panRef.current };
        setIsSwiping(false);
        isSwipingRef.current = false;
        setTouchOffset(0);
        touchOffsetRef.current = 0;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isPinchingRef.current && e.touches.length === 2 && initialPinchDistRef.current > 0) {
        if (e.cancelable) e.preventDefault();
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = currentDist / initialPinchDistRef.current;
        const targetScale = Math.min(3.5, Math.max(1.0, Number((initialZoomRef.current * factor).toFixed(2))));
        setZoom(targetScale);
        if (targetScale <= 1.05) {
          setPan({ x: 0, y: 0 });
        }
        return;
      }

      if (touchStartXRef.current === null || touchStartYRef.current === null || e.touches.length !== 1) {
        return;
      }

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const deltaX = currentX - touchStartXRef.current;
      const deltaY = currentY - touchStartYRef.current;

      if (zoomRef.current > 1.05) {
        // Zoomed in: pan sheet without scrolling modal/page behind
        if (e.cancelable) e.preventDefault();
        const newX = panStartRef.current.x + deltaX;
        const newY = panStartRef.current.y + deltaY;
        setPan(clampPan(newX, newY, zoomRef.current));
      } else {
        // Fit mode: slide carousel
        if (!isSwipingRef.current && Math.abs(deltaX) > 8) {
          if (Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
            setIsSwiping(true);
            isSwipingRef.current = true;
          }
        }

        if (isSwipingRef.current) {
          if (e.cancelable) e.preventDefault();
          const isAtStart = pageRef.current <= 1 && deltaX > 0;
          const isAtEnd = pageRef.current >= totalPagesRef.current && deltaX < 0;
          const damped = isAtStart || isAtEnd ? deltaX * 0.25 : deltaX;
          setTouchOffset(damped);
          touchOffsetRef.current = damped;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (isPinchingRef.current) {
        if (e.touches.length < 2) {
          isPinchingRef.current = false;
          initialPinchDistRef.current = 0;
          if (zoomRef.current <= 1.05) {
            setZoom(1.0);
            setPan({ x: 0, y: 0 });
          }
        }
        return;
      }

      if (e.touches.length === 0) {
        const now = Date.now();
        const elapsed = now - touchStartTimeRef.current;

        // Double tap toggle: 1.0x <-> 2.0x
        if (e.changedTouches.length === 1 && touchStartXRef.current !== null && touchStartYRef.current !== null) {
          const movedDist = Math.hypot(
            e.changedTouches[0].clientX - touchStartXRef.current,
            e.changedTouches[0].clientY - touchStartYRef.current
          );

          if (movedDist < 10 && elapsed < 300) {
            if (now - lastTapTimeRef.current < 300) {
              if (zoomRef.current > 1.05) {
                handleResetZoom();
              } else {
                setZoom(2.0);
              }
              lastTapTimeRef.current = 0;
              touchStartXRef.current = null;
              touchStartYRef.current = null;
              return;
            } else {
              lastTapTimeRef.current = now;
            }
          }
        }

        // Swipe release
        if (isSwipingRef.current) {
          const threshold = 45;
          const offset = touchOffsetRef.current;
          if (offset < -threshold && pageRef.current < totalPagesRef.current) {
            setSlideDirection("left");
            setPageImgLoading(true);
            setPage((prev) => prev + 1);
          } else if (offset > threshold && pageRef.current > 1) {
            setSlideDirection("right");
            setPageImgLoading(true);
            setPage((prev) => prev - 1);
          }
          setTouchOffset(0);
          touchOffsetRef.current = 0;
          setIsSwiping(false);
          isSwipingRef.current = false;
        }

        touchStartXRef.current = null;
        touchStartYRef.current = null;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [clampPan, handleResetZoom, hasDoc, isPurged, loadingMeta]);

  // Desktop mouse dragging & wheel handlers
  const isMouseDownRef = useRef<boolean>(false);
  const mouseStartXRef = useRef<number | null>(null);
  const mouseStartYRef = useRef<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || loadingMeta || !hasDoc || isPurged) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a") || target.closest("input")) return;

    isMouseDownRef.current = true;
    mouseStartXRef.current = e.clientX;
    mouseStartYRef.current = e.clientY;
    panStartRef.current = { ...panRef.current };
    setIsSwiping(false);
    setTouchOffset(0);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseDownRef.current || mouseStartXRef.current === null || mouseStartYRef.current === null) {
        return;
      }

      const deltaX = e.clientX - mouseStartXRef.current;
      const deltaY = e.clientY - mouseStartYRef.current;

      if (zoomRef.current > 1.05) {
        const newX = panStartRef.current.x + deltaX;
        const newY = panStartRef.current.y + deltaY;
        setPan(clampPan(newX, newY, zoomRef.current));
      } else {
        if (!isSwiping && Math.abs(deltaX) > 8) {
          if (Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
            setIsSwiping(true);
          }
        }

        if (isSwiping) {
          const isAtStart = page <= 1 && deltaX > 0;
          const isAtEnd = page >= totalPages && deltaX < 0;
          const damped = isAtStart || isAtEnd ? deltaX * 0.25 : deltaX;
          setTouchOffset(damped);
        }
      }
    };

    const handleMouseUp = () => {
      if (!isMouseDownRef.current) return;
      isMouseDownRef.current = false;

      if (isSwiping) {
        const threshold = 45;
        if (touchOffset < -threshold && page < totalPages) {
          setPageImgLoading(true);
          setPage((prev) => prev + 1);
        } else if (touchOffset > threshold && page > 1) {
          setPageImgLoading(true);
          setPage((prev) => prev - 1);
        }
        setTouchOffset(0);
        setIsSwiping(false);
      }

      mouseStartXRef.current = null;
      mouseStartYRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [clampPan, isSwiping, page, totalPages, touchOffset]);

  // Wheel zoom with Ctrl, or pan when zoomed in
  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.85;
        const newScale = Math.min(3.5, Math.max(1.0, Number((zoomRef.current * factor).toFixed(2))));
        setZoom(newScale);
        if (newScale <= 1.05) {
          setPan({ x: 0, y: 0 });
        }
      } else if (zoomRef.current > 1.05) {
        e.preventDefault();
        const rawX = panRef.current.x - e.deltaX;
        const rawY = panRef.current.y - e.deltaY;
        setPan(clampPan(rawX, rawY, zoomRef.current));
      }
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [clampPan]);

  // Sync initial tab when modal opens or initialArtifact changes
  useEffect(() => {
    if (isOpen) {
      if (!hasQuestionPaper && hasAnswerKey) {
        setActiveArtifact("answer-key");
      } else if (hasQuestionPaper && !hasAnswerKey) {
        setActiveArtifact("question-paper");
      } else {
        setActiveArtifact(initialArtifact);
      }
      setPage(1);
      setZoom(1.0);
    }
  }, [isOpen, initialArtifact, hasQuestionPaper, hasAnswerKey]);

  // Load artifact metadata whenever examId or activeArtifact changes
  const fetchMetadata = useCallback(async () => {
    if (!isOpen || !examId) return;
    setLoadingMeta(true);
    setErrorNotice(null);
    setPage(1);
    setPageImgLoading(true);

    try {
      const meta = await api.getExamArtifactMeta(examId, activeArtifact);
      setHasDoc(Boolean(meta.has_document));
      setTotalPages(Math.max(1, meta.page_count || 1));
      setIsPurged(Boolean(meta.is_purged || isExamDocumentPurged));
      if (meta.is_purged) {
        setErrorNotice("Document unavailable: This document is no longer accessible.");
      }
    } catch (err: any) {
      console.warn("Failed to fetch document metadata:", err);
      // If 410 Gone, it was purged
      if (err?.message?.includes("410") || err?.message?.toLowerCase().includes("purged")) {
        setIsPurged(true);
        setHasDoc(false);
        setErrorNotice("Document unavailable: This document is no longer accessible.");
      } else {
        setHasDoc(false);
        setErrorNotice(err.message || "Failed to load document preview.");
      }
    } finally {
      setLoadingMeta(false);
    }
  }, [isOpen, examId, activeArtifact, isExamDocumentPurged]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  // Keyboard navigation: Escape to close, Left/Right arrows for page
  const [mounted, setMounted] = useState(false);
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      setIsExiting(false);
    } else if (isRendered) {
      setIsExiting(true);
      const timer = setTimeout(() => {
        setIsRendered(false);
        setIsExiting(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isRendered]);

  const handleRequestClose = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      onClose();
      setIsRendered(false);
      setIsExiting(false);
    }, 200);
  }, [isExiting, onClose]);

  useEffect(() => {
    if (!isRendered) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleRequestClose();
      } else if (e.key === "ArrowLeft" && !loadingMeta && hasDoc && !isPurged) {
        setPage((prev) => (prev > 1 ? prev - 1 : prev));
      } else if (e.key === "ArrowRight" && !loadingMeta && hasDoc && !isPurged) {
        setPage((prev) => (prev < totalPages ? prev + 1 : prev));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRendered, handleRequestClose, loadingMeta, hasDoc, isPurged, totalPages]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isRendered) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isRendered]);

  if (!isRendered || !mounted) return null;

  const pdfUrl = api.getExamArtifactPdfUrl(examId, activeArtifact);

  return createPortal(
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs ${
        isExiting ? "animate-modal-backdrop-out" : "animate-modal-backdrop-in"
      }`}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={handleRequestClose} aria-hidden="true" />

      {/* Main Container */}
      <div className={`relative w-full max-w-5xl h-full sm:h-[90vh] max-h-[100dvh] sm:max-h-[90vh] flex flex-col bg-surface rounded-none sm:rounded-2xl shadow-notion-modal border-0 sm:border sm:border-hairline z-10 overflow-hidden ${
        isExiting ? "animate-modal-content-out" : "animate-modal-content-in"
      }`}>
        {/* Top Header Bar */}
        <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-hairline bg-surface shrink-0 pt-[max(0.625rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-2.5">
            {/* Exam info (Left) */}
            <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial">
              <h3 className="text-xs sm:text-sm font-bold text-ink truncate max-w-[170px] xs:max-w-[220px] sm:max-w-xs md:max-w-sm">
                {examTitle || "Examination Paper"}
              </h3>
              {examSubject && (
                <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded bg-canvas-soft border border-hairline text-ink-muted shrink-0">
                  {examSubject}
                </span>
              )}
            </div>

            {/* Artifact Tabs (Desktop sm+ inline in center/header) */}
            <div className="hidden sm:inline-flex items-center p-0.5 bg-canvas-soft rounded-lg border border-hairline shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (activeArtifact !== "question-paper") {
                    setActiveArtifact("question-paper");
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeArtifact === "question-paper"
                    ? "bg-surface text-ink shadow-2xs font-bold"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Question Paper</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activeArtifact !== "answer-key") {
                    setActiveArtifact("answer-key");
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeArtifact === "answer-key"
                    ? "bg-surface text-ink shadow-2xs font-bold"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                <Key className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span>Answer Key</span>
              </button>
            </div>

            {/* Close button (Always anchored to top right of modal) */}
            <div className="flex items-center shrink-0 -mr-1">
              <button
                type="button"
                onClick={handleRequestClose}
                className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
                title="Close viewer (Esc)"
                aria-label="Close viewer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Artifact Tabs (Mobile view: rendered on their own row beneath the title, never shifting the close button) */}
          <div className="sm:hidden mt-2 pt-2 border-t border-hairline/60">
            <div className="inline-flex items-center p-0.5 bg-canvas-soft rounded-lg border border-hairline w-full">
              <button
                type="button"
                onClick={() => {
                  if (activeArtifact !== "question-paper") {
                    setActiveArtifact("question-paper");
                  }
                }}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeArtifact === "question-paper"
                    ? "bg-surface text-ink shadow-2xs font-bold"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Question Paper</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activeArtifact !== "answer-key") {
                    setActiveArtifact("answer-key");
                  }
                }}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeArtifact === "answer-key"
                    ? "bg-surface text-ink shadow-2xs font-bold"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                <Key className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span>Answer Key</span>
              </button>
            </div>
          </div>
        </div>

        {/* Toolbar: Page Navigation, Zoom, Direct Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-2 border-b border-hairline bg-surface-raised shrink-0 text-xs">
          {/* Left: Page Navigation */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (page > 1) {
                  setPageImgLoading(true);
                  setPage((p) => p - 1);
                }
              }}
              disabled={page <= 1 || loadingMeta || !hasDoc || isPurged}
              className="inline-flex p-1 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer border border-hairline"
              title="Previous Page (Left Arrow)"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <span className="px-2 py-0.5 text-xs font-semibold text-ink font-mono min-w-[76px] text-center">
              {loadingMeta ? "..." : `Page ${page} / ${totalPages}`}
            </span>

            <button
              type="button"
              onClick={() => {
                if (page < totalPages) {
                  setPageImgLoading(true);
                  setPage((p) => p + 1);
                }
              }}
              disabled={page >= totalPages || loadingMeta || !hasDoc || isPurged}
              className="inline-flex p-1 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer border border-hairline"
              title="Next Page (Right Arrow)"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Center: Zoom Controls */}
          {hasDoc && !isPurged && !loadingMeta && (
            <div className="hidden sm:flex items-center gap-1 bg-surface border border-hairline rounded-lg p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 1.0}
                className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas-soft disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="px-1 text-[11px] font-mono text-ink-muted min-w-[38px] text-center select-none">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 3.5}
                className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas-soft disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              {zoom !== 1.0 && (
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
                  title="Reset Zoom"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5 shrink-0 justify-end">
            {hasDoc && !isPurged && (
              <>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md btn-glass-utility cursor-pointer"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Open in Tab</span>
                </a>
                <a
                  href={pdfUrl}
                  download={`${activeArtifact}_${examId}.pdf`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md btn-glass-primary cursor-pointer"
                >
                  <Download className="h-3 w-3" />
                  <span>Download PDF</span>
                </a>
              </>
            )}
          </div>
        </div>

        {/* Document Rendering Body */}
        <div className="relative flex-1 w-full overflow-hidden bg-canvas-soft flex flex-col items-center justify-center select-none">
          {loadingMeta ? (
            <div className="flex flex-col items-center justify-center m-auto py-16 gap-3">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-xs font-medium text-ink-secondary">
                Loading {activeArtifact === "question-paper" ? "question paper" : "answer key"}...
              </p>
            </div>
          ) : isPurged ? (
            <div className="flex flex-col items-center justify-center m-auto py-16 gap-3 max-w-sm text-center">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                <FileText className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-ink">Document Unavailable</h4>
              <p className="text-xs text-ink-muted leading-relaxed">
                The {activeArtifact === "question-paper" ? "question paper" : "official answer key"} is no longer available for preview or download in accordance with institutional policy.
              </p>
            </div>
          ) : !hasDoc ? (
            <div className="flex flex-col items-center justify-center m-auto py-16 gap-3 max-w-sm text-center">
              <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                <HelpCircle className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-ink">
                No {activeArtifact === "question-paper" ? "Question Paper" : "Answer Key"} Attached
              </h4>
              <p className="text-xs text-ink-muted leading-relaxed">
                Faculty has not uploaded a digital copy of the{" "}
                {activeArtifact === "question-paper" ? "question paper" : "answer key"} for this examination.
              </p>
            </div>
          ) : (
            <>
              {/* Connected Pages Carousel Track */}
              <div
                ref={viewportRef}
                onMouseDown={handleMouseDown}
                className={`w-full h-full flex-1 overflow-hidden relative select-none overscroll-contain ${
                  zoom > 1.05 ? "touch-none cursor-grab active:cursor-grabbing" : "touch-pan-y"
                }`}
                style={{
                  touchAction: zoom > 1.05 ? "none" : "pan-y",
                  overscrollBehavior: "contain",
                }}
              >
                <div
                  className="flex items-center h-full will-change-transform"
                  style={{
                    width: `${totalPages * 100}%`,
                    transform: `translateX(calc(-${((page - 1) / totalPages) * 100}% + ${touchOffset}px))`,
                    transition: isSwiping ? "none" : "transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1)",
                  }}
                >
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                    const isNearby = Math.abs(p - page) <= 1;
                    return (
                      <div
                        key={p}
                        className="h-full flex items-center justify-center p-2 sm:p-5 flex-shrink-0 overflow-hidden"
                        style={{ width: `${100 / totalPages}%` }}
                      >
                        <div
                          ref={p === page ? activeSheetRef : undefined}
                          className="relative bg-white rounded-lg sm:rounded-xl shadow-lg border border-hairline overflow-hidden flex items-center justify-center"
                          style={{
                            height: "100%",
                            maxHeight: "100%",
                            maxWidth: "100%",
                            aspectRatio: "1 / 1.414",
                            width: "auto",
                            transform: p === page && zoom > 1.05 ? `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` : "none",
                            transformOrigin: "center center",
                            willChange: "transform",
                            transition: isSwiping ? "none" : "transform 250ms cubic-bezier(0.16, 1, 0.3, 1)",
                          }}
                        >
                          <img
                            src={api.getExamArtifactPageUrl(examId, activeArtifact, p)}
                            alt={`${activeArtifact} page ${p}`}
                            className="w-full h-full object-contain pointer-events-none select-none block"
                            loading={isNearby ? "eager" : "lazy"}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
