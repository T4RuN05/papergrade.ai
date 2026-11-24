"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Archive } from "lucide-react";
import { GradedAnswer, AnswerRegion } from "@/lib/types";
import { api } from "@/lib/api";
import { PdfPageView } from "@/components/PdfPageView";
import LogoLoader from "@/components/LogoLoader/LogoLoader";

// Extracted Leaf Microcomponents
import { ViewerToolbar } from "./viewer/ViewerToolbar";
import { PageScoreStamp } from "./viewer/PageScoreStamp";
import { AnnotationBoundingBox, RegionCoords } from "./viewer/AnnotationBoundingBox";
import { HandleType } from "./viewer/ResizeHandles";

const PAGE_IMAGE_SRCSET_WIDTHS = [480, 720, 1200, 1800];

interface DraftRegionCoord {
  x: number;
  y: number;
  width: number;
  height: number;
  page_number?: number;
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
  onDeleteRegion?: (regionId: string) => Promise<void>;
  totalAwardedMarks?: number;
  maxMarks?: number;
  readOnly?: boolean;
  hideScoreStamp?: boolean;
  isDocumentPurged?: boolean;
  initialShowAnnotations?: boolean;
  pdfUrl?: string;
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
  onDeleteRegion,
  totalAwardedMarks,
  maxMarks,
  readOnly = false,
  hideScoreStamp = false,
  isDocumentPurged = false,
  initialShowAnnotations = true,
  pdfUrl,
}: DocumentViewerProps) {
  const [internalPage, setInternalPage] = useState<number>(1);
  const [containerDims, setContainerDims] = useState<{ width: number; height: number }>(() => {
    if (typeof window !== "undefined") {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 0, height: 0 };
  });
  const [pageAspects, setPageAspects] = useState<Record<number, number>>({});
  const getPageAspect = useCallback(
    (pageNum: number) => pageAspects[pageNum] || pageAspects[1] || 0.707,
    [pageAspects]
  );
  const handleAspectCalculated = useCallback((pageNum: number, aspect: number) => {
    if (aspect > 0) {
      setPageAspects((prev) => {
        if (prev[pageNum] === aspect) return prev;
        return { ...prev, [pageNum]: aspect };
      });
    }
  }, []);

  const getPageDimensions = useCallback(
    (pageNum: number) => {
      const aspect = getPageAspect(pageNum);
      const isSm = typeof window !== "undefined" && window.innerWidth >= 640;
      const padX = isSm ? 32 : 16;
      const padY = isSm ? 32 : 16;
      const cW =
        containerDims.width > 0
          ? containerDims.width
          : typeof window !== "undefined"
          ? window.innerWidth
          : 800;
      const cH =
        containerDims.height > 0
          ? containerDims.height
          : typeof window !== "undefined"
          ? window.innerHeight - 100
          : 600;
      const availW = Math.max(100, cW - padX);
      const availH = Math.max(100, cH - padY);

      const containerAspect = availW / availH;
      let sheetWidth: number;
      let sheetHeight: number;

      if (containerAspect > aspect) {
        // Height is the constraint
        sheetHeight = availH;
        sheetWidth = Math.round(availH * aspect);
      } else {
        // Width is the constraint
        sheetWidth = availW;
        sheetHeight = Math.round(availW / aspect);
      }

      return {
        width: `${sheetWidth}px`,
        height: `${sheetHeight}px`,
        maxWidth: "100%",
        maxHeight: "100%",
        aspectRatio: `${aspect}`,
      };
    },
    [containerDims.width, containerDims.height, getPageAspect]
  );

  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [showAnnotations, setShowAnnotations] = useState<boolean>(initialShowAnnotations);
  const [hoveredAnswerId, setHoveredAnswerId] = useState<string | null>(null);
  const [failedPages, setFailedPages] = useState<Set<number>>(() => new Set());
  const [imageRetryNonce, setImageRetryNonce] = useState<number>(0);
  const [isPageImageLoading, setIsPageImageLoading] = useState<boolean>(true);
  const [isSnapping, setIsSnapping] = useState<boolean>(false);

  const totalPages = Math.max(1, pageCount || 1);
  const currentPage = propCurrentPage !== undefined ? propCurrentPage : internalPage;

  const invScale = useMemo(() => {
    return Math.max(0.35, Math.min(1.0, Number((1 / zoomScale).toFixed(3))));
  }, [zoomScale]);

  // Draft coordinates for locally dragged/resized regions
  const [draftCoords, setDraftCoords] = useState<Record<string, DraftRegionCoord>>({});
  const [activeDragRegionId, setActiveDragRegionId] = useState<string | null>(null);
  const [savingRegionId, setSavingRegionId] = useState<string | null>(null);
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);

  const activeSheetRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const loadedPagesRef = useRef<Set<string>>(new Set());

  // Carousel touch state
  const [touchOffset, setTouchOffset] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);

  // Gesture refs for zero-stale-closure native listeners
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const zoomScaleRef = useRef(zoomScale);
  const didPanRef = useRef(false);
  const currentPageRef = useRef(currentPage);
  const totalPagesRef = useRef(totalPages);
  const setCurrentPageRef = useRef<(p: number | ((prev: number) => number)) => void>(() => {});
  const isSwipingRef = useRef(isSwiping);
  const touchOffsetRef = useRef(touchOffset);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef<number>(0);
  const lastTapTimeRef = useRef<number>(0);
  const isPinchingRef = useRef<boolean>(false);
  const initialPinchDistRef = useRef<number>(0);
  const initialZoomRef = useRef<number>(1);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const isMouseDownRef = useRef<boolean>(false);
  const mouseStartXRef = useRef<number | null>(null);
  const mouseStartYRef = useRef<number | null>(null);

  const setCurrentPage = useCallback(
    (p: number | ((prev: number) => number)) => {
      const next = typeof p === "function" ? p(currentPage) : p;
      const clamped = Math.max(1, Math.min(totalPages, next));
      if (onPageChange) {
        onPageChange(clamped);
      } else {
        setInternalPage(clamped);
      }
    },
    [currentPage, onPageChange, totalPages]
  );

  useEffect(() => {
    panRef.current = pan;
    zoomScaleRef.current = zoomScale;
    currentPageRef.current = currentPage;
    totalPagesRef.current = totalPages;
    setCurrentPageRef.current = setCurrentPage;
    isSwipingRef.current = isSwiping;
    touchOffsetRef.current = touchOffset;
  });

  // Keep pan bounded when zoomed in on the active sheet so it can be explored freely without getting lost
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

  // Measure container dimensions dynamically
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
  }, []);

  // Sync editingAnswerId with parent
  useEffect(() => {
    if (propEditingAnswerId) {
      setShowAnnotations(true);
      const match = answers.find((a) => a.id === propEditingAnswerId);
      const regOnThisPage = (match?.regions || []).find((r) => r.page_number === currentPage);
      if (regOnThisPage) {
        setEditingRegionId(regOnThisPage.id || null);
      } else if (match) {
        const newRegId = `draft-add-${match.id}-${currentPage}`;
        setDraftCoords((prev) => ({
          ...prev,
          [newRegId]: {
            x: 0.15,
            y: 0.2,
            width: 0.7,
            height: 0.15,
            page_number: currentPage,
            isModified: true,
          },
        }));
        setEditingRegionId(newRegId);
      }
    } else if (propEditingAnswerId === null) {
      setEditingRegionId(null);
    }
  }, [propEditingAnswerId, answers, currentPage]);

  // Reset per-submission bookkeeping when the document changes
  useEffect(() => {
    setIsPageImageLoading(true);
    loadedPagesRef.current.clear();
    setFailedPages(new Set());
    setPageAspects({});
  }, [submissionId]);

  // Reset zoom & pan on page change so newly selected page is cleanly framed
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoomScale(1.0);
    setTouchOffset(0);
    setIsSwiping(false);
    if (!loadedPagesRef.current.has(`${submissionId}_p_${currentPage}`)) {
      setIsPageImageLoading(true);
    } else {
      setIsPageImageLoading(false);
    }
  }, [currentPage, submissionId]);

  // Zoom handlers
  const handleZoomIn = () => setZoomScale((z) => Math.min(3.5, Number((z + 0.25).toFixed(2))));
  const handleZoomOut = () => {
    const next = Math.max(1.0, Number((zoomScale - 0.25).toFixed(2)));
    setZoomScale(next);
    if (next <= 1.05) setPan({ x: 0, y: 0 });
  };
  const handleResetZoom = useCallback(() => {
    setZoomScale(1.0);
    setPan({ x: 0, y: 0 });
    setIsSnapping(true);
    setTimeout(() => setIsSnapping(false), 300);
  }, []);

  // Native non-passive touch listeners on viewportRef for mobile gestures
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest("[data-handle]") ||
        target.closest("button") ||
        target.closest("input") ||
        target.closest("[data-prevent-swipe]") ||
        dragSessionRef.current
      ) {
        return;
      }

      didPanRef.current = false;
      setIsSnapping(false);

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
        initialZoomRef.current = zoomScaleRef.current;
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
        didPanRef.current = true;
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = currentDist / initialPinchDistRef.current;
        const targetScale = Math.min(3.5, Math.max(1.0, Number((initialZoomRef.current * factor).toFixed(2))));
        setZoomScale(targetScale);
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

      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        didPanRef.current = true;
      }

      if (zoomScaleRef.current > 1.05) {
        // Zoomed in: pan within active sheet without scrolling parent page
        if (e.cancelable) e.preventDefault();
        const newX = panStartRef.current.x + deltaX;
        const newY = panStartRef.current.y + deltaY;
        setPan(clampPan(newX, newY, zoomScaleRef.current));
      } else {
        // Fit mode: slide between pages
        if (!isSwipingRef.current && Math.abs(deltaX) > 8) {
          if (Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
            setIsSwiping(true);
            isSwipingRef.current = true;
          }
        }

        if (isSwipingRef.current) {
          if (e.cancelable) e.preventDefault();
          const isAtStart = currentPageRef.current <= 1 && deltaX > 0;
          const isAtEnd = currentPageRef.current >= totalPagesRef.current && deltaX < 0;
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
          if (zoomScaleRef.current <= 1.05) {
            setZoomScale(1.0);
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
              if (zoomScaleRef.current > 1.05) {
                handleResetZoom();
              } else {
                setZoomScale(2.0);
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
          if (offset < -threshold && currentPageRef.current < totalPagesRef.current) {
            setIsPageImageLoading(true);
            setCurrentPageRef.current((p) => p + 1);
          } else if (offset > threshold && currentPageRef.current > 1) {
            setIsPageImageLoading(true);
            setCurrentPageRef.current((p) => p - 1);
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
  }, [clampPan, handleResetZoom]);

  // Desktop mouse dragging & panning handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest("[data-handle]") ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest("[data-prevent-swipe]") ||
      dragSessionRef.current
    ) {
      return;
    }

    didPanRef.current = false;
    setIsSnapping(false);
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

      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        didPanRef.current = true;
      }

      if (zoomScaleRef.current > 1.05) {
        const newX = panStartRef.current.x + deltaX;
        const newY = panStartRef.current.y + deltaY;
        setPan(clampPan(newX, newY, zoomScaleRef.current));
      } else {
        if (!isSwiping && Math.abs(deltaX) > 8) {
          if (Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
            setIsSwiping(true);
          }
        }

        if (isSwiping) {
          const isAtStart = currentPageRef.current <= 1 && deltaX > 0;
          const isAtEnd = currentPageRef.current >= totalPagesRef.current && deltaX < 0;
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
        if (touchOffset < -threshold && currentPageRef.current < totalPagesRef.current) {
          setIsPageImageLoading(true);
          setCurrentPageRef.current((p) => p + 1);
        } else if (touchOffset > threshold && currentPageRef.current > 1) {
          setIsPageImageLoading(true);
          setCurrentPageRef.current((p) => p - 1);
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
  }, [clampPan, isSwiping, touchOffset]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && currentPageRef.current > 1 && zoomScaleRef.current <= 1.05) {
        setIsPageImageLoading(true);
        setCurrentPageRef.current((p) => p - 1);
      } else if (e.key === "ArrowRight" && currentPageRef.current < totalPagesRef.current && zoomScaleRef.current <= 1.05) {
        setIsPageImageLoading(true);
        setCurrentPageRef.current((p) => p + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Wheel zoom with Ctrl, or pan when zoomed in
  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.85;
        const newScale = Math.min(3.5, Math.max(1.0, Number((zoomScaleRef.current * factor).toFixed(2))));
        setZoomScale(newScale);
        if (newScale <= 1.05) {
          setPan({ x: 0, y: 0 });
        }
      } else if (zoomScaleRef.current > 1.05) {
        e.preventDefault();
        const rawX = panRef.current.x - e.deltaX;
        const rawY = panRef.current.y - e.deltaY;
        setPan(clampPan(rawX, rawY, zoomScaleRef.current));
      }
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [clampPan]);

  const handleSpawnDraftBox = (ansId: string) => {
    setShowAnnotations(true);
    const match = answers.find((a) => a.id === ansId || a.question_id === ansId);
    if (!match) return;
    const newRegId = `draft-add-${match.id}-${currentPage}`;
    setDraftCoords((prev) => ({
      ...prev,
      [newRegId]: {
        x: 0.15,
        y: 0.2,
        width: 0.7,
        height: 0.15,
        page_number: currentPage,
        isModified: true,
      },
    }));
    setEditingRegionId(newRegId);
    if (onSetEditingAnswerId) onSetEditingAnswerId(match.id);
  };

  const handleExitEditMode = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingRegionId(null);
    if (onSetEditingAnswerId) onSetEditingAnswerId(null);
  };

  const handleSaveRegion = async (regId: string, coords: RegionCoords, answerId: string) => {
    if (!onUpdateRegion) return;
    setSavingRegionId(regId);
    try {
      await onUpdateRegion(regId, {
        x: coords.x,
        y: coords.y,
        width: coords.width,
        height: coords.height,
        page_number: currentPage,
      });
      setDraftCoords((prev) => {
        const next = { ...prev };
        delete next[regId];
        return next;
      });
      handleExitEditMode();
    } finally {
      setSavingRegionId(null);
    }
  };

  const handleRevertRegion = (regId: string) => {
    setDraftCoords((prev) => {
      const next = { ...prev };
      delete next[regId];
      return next;
    });
  };

  // Drag session ref for annotation bounding boxes
  const dragSessionRef = useRef<{
    handle: HandleType;
    regionId: string;
    answerId: string;
    startClientX: number;
    startClientY: number;
    initialBox: { x: number; y: number; width: number; height: number };
    containerW: number;
    containerH: number;
  } | null>(null);

  const handleStartDrag = (
    e: React.MouseEvent | React.TouchEvent,
    handle: HandleType,
    region: AnswerRegion,
    answer: GradedAnswer
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const sheetEl = activeSheetRef.current;
    if (!sheetEl) return;
    const sheetRect = sheetEl.getBoundingClientRect();
    const cW = sheetRect.width / zoomScale;
    const cH = sheetRect.height / zoomScale;

    const regId = region.id || answer.id;
    const currentBox = draftCoords[regId] || {
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
    };

    dragSessionRef.current = {
      handle,
      regionId: regId,
      answerId: answer.id,
      startClientX: clientX,
      startClientY: clientY,
      initialBox: { ...currentBox },
      containerW: cW,
      containerH: cH,
    };
    setActiveDragRegionId(regId);
  };

  // Window drag move and up listeners for bounding boxes
  useEffect(() => {
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const dxPx = (clientX - session.startClientX) / zoomScale;
      const dyPx = (clientY - session.startClientY) / zoomScale;

      const dx = dxPx / session.containerW;
      const dy = dyPx / session.containerH;

      const { initialBox, handle } = session;
      let nextX = initialBox.x;
      let nextY = initialBox.y;
      let nextW = initialBox.width;
      let nextH = initialBox.height;

      if (handle === "move") {
        nextX = Math.max(0, Math.min(1 - initialBox.width, initialBox.x + dx));
        nextY = Math.max(0, Math.min(1 - initialBox.height, initialBox.y + dy));
      } else {
        if (handle.includes("w")) {
          const maxLeft = initialBox.x + initialBox.width - 0.03;
          nextX = Math.max(0, Math.min(maxLeft, initialBox.x + dx));
          nextW = initialBox.width - (nextX - initialBox.x);
        }
        if (handle.includes("e")) {
          nextW = Math.max(0.03, Math.min(1 - initialBox.x, initialBox.width + dx));
        }
        if (handle.includes("n")) {
          const maxTop = initialBox.y + initialBox.height - 0.03;
          nextY = Math.max(0, Math.min(maxTop, initialBox.y + dy));
          nextH = initialBox.height - (nextY - initialBox.y);
        }
        if (handle.includes("s")) {
          nextH = Math.max(0.03, Math.min(1 - initialBox.y, initialBox.height + dy));
        }
      }

      setDraftCoords((prev) => ({
        ...prev,
        [session.regionId]: {
          x: Number(nextX.toFixed(4)),
          y: Number(nextY.toFixed(4)),
          width: Number(nextW.toFixed(4)),
          height: Number(nextH.toFixed(4)),
          page_number: currentPage,
          isModified: true,
        },
      }));
    };

    const handlePointerUp = () => {
      dragSessionRef.current = null;
      setActiveDragRegionId(null);
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchmove", handlePointerMove, { passive: false });
    window.addEventListener("touchend", handlePointerUp);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("touchend", handlePointerUp);
    };
  }, [zoomScale, currentPage]);

  // Filter regions on current page
  const pageRegions = useMemo(() => {
    const list: { region: AnswerRegion; answer: GradedAnswer }[] = [];
    answers.forEach((ans) => {
      (ans.regions || []).forEach((r) => {
        if (r.page_number === currentPage) {
          list.push({ region: r, answer: ans });
        }
      });
    });

    // Check for draft additions on this page
    Object.entries(draftCoords).forEach(([dId, dBox]) => {
      if (dBox.page_number === currentPage && dId.startsWith("draft-add-")) {
        const ansMatch = answers.find((a) => dId.includes(a.id));
        if (ansMatch && !list.some((item) => (item.region.id || item.answer.id) === dId)) {
          list.push({
            region: {
              id: dId,
              page_number: currentPage,
              x: dBox.x,
              y: dBox.y,
              width: dBox.width,
              height: dBox.height,
            },
            answer: ansMatch,
          });
        }
      }
    });

    return list;
  }, [answers, currentPage, draftCoords]);

  const totalScore = totalAwardedMarks ?? 0;
  const totalMax = maxMarks ?? 0;
  const scorePct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  return (
    <div className="flex h-full w-full max-w-full flex-col bg-surface select-none overflow-x-hidden">
      {/* 1. Header Toolbar */}
      <ViewerToolbar
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(p) => {
          setIsPageImageLoading(true);
          setCurrentPage(p);
        }}
        zoomScale={zoomScale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        showAnnotations={showAnnotations}
        onToggleAnnotations={() => setShowAnnotations((prev) => !prev)}
        answers={answers}
        readOnly={readOnly}
        editingRegionId={editingRegionId}
        onExitEditMode={handleExitEditMode}
        onSpawnDraftBox={handleSpawnDraftBox}
      />

      {/* 2. Vector Canvas Viewport Container (60 FPS Canvas Viewport Invariant preserved) */}
      <div
        ref={viewportRef}
        onMouseDown={handleMouseDown}
        className={`relative flex-1 w-full overflow-hidden bg-[#f6f6f4] select-none overscroll-contain ${
          zoomScale > 1.05 ? "touch-none cursor-grab active:cursor-grabbing" : "touch-pan-y"
        }`}
        style={{
          touchAction: zoomScale > 1.05 ? "none" : "pan-y",
          overscrollBehavior: "contain",
        }}
      >
        {/* Track Container */}
        <div
          className="flex items-center h-full"
          style={{
            width: `${totalPages * 100}%`,
            transform: `translateX(calc(-${((currentPage - 1) / totalPages) * 100}% + ${touchOffset}px))`,
            transition: isSwiping ? "none" : "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {Array.from({ length: totalPages }).map((_, sheetIdx) => {
            const p = sheetIdx + 1;
            const isCurrent = p === currentPage;
            const isAdjacent = Math.abs(p - currentPage) <= 1;
            const sheetDimStyle = getPageDimensions(p);

            return (
              <div
                key={p}
                className="flex items-center justify-center h-full px-2 sm:px-4 py-2 sm:py-4 box-border"
                style={{ width: `${100 / totalPages}%` }}
              >
                {isAdjacent ? (
                  <div
                    ref={isCurrent ? activeSheetRef : undefined}
                    className="relative bg-white shadow-xl rounded-lg sm:rounded-xl overflow-hidden flex items-center justify-center select-none"
                    style={{
                      ...sheetDimStyle,
                      transform:
                        isCurrent && zoomScale > 1.05
                          ? `translate(${pan.x}px, ${pan.y}px) scale(${zoomScale})`
                          : "none",
                      transformOrigin: "center center",
                      willChange: isCurrent && zoomScale > 1.05 ? "transform" : undefined,
                      transition: isSnapping ? "transform 300ms cubic-bezier(0.16, 1, 0.3, 1)" : "none",
                    }}
                  >
                    {/* Error / Purged Fallback Screen */}
                    {failedPages.has(p) ? (
                      <div className="flex flex-col items-center justify-center p-8 text-center w-full h-full space-y-3 bg-surface rounded-sm">
                        <div className="h-12 w-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mx-auto">
                          <Archive className="h-6 w-6" />
                        </div>
                        <h3 className="text-sm font-bold text-ink">
                          {isDocumentPurged ? "Page Image Unavailable" : "Page Loading Error"}
                        </h3>
                        <p className="text-xs text-ink-muted max-w-sm mx-auto leading-relaxed">
                          {isDocumentPurged
                            ? "Scanned answer sheet pages and crop previews for this paper have been purged in accordance with the 15-day storage retention policy. Question marks and evaluator rationales remain permanently archived."
                            : "Unable to render this page image. Please verify your connection or click retry below."}
                        </p>
                        {!isDocumentPurged && (
                          <button
                            type="button"
                            onClick={() => {
                              setFailedPages((prev) => {
                                const next = new Set(prev);
                                next.delete(p);
                                return next;
                              });
                              setImageRetryNonce((n) => n + 1);
                              setIsPageImageLoading(true);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-white hover:bg-primary-hover transition-colors"
                          >
                            Retry Loading
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* Paper Fetching Loading Screen with Animated Brand Logo */}
                        {isCurrent && isPageImageLoading && !loadedPagesRef.current.has(`${submissionId}_p_${p}`) && (
                          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-surface rounded-sm border border-hairline/60 shadow-2xs">
                            <LogoLoader size={42} duration={1.3} label="Rendering Examination Sheet" />
                            <div className="space-y-1 max-w-xs">
                              <h3 className="text-xs sm:text-sm font-bold text-ink">
                                Fetching Examination Sheet...
                              </h3>
                              <p className="text-[11px] text-ink-muted leading-relaxed">
                                Rendering Page {currentPage} of {totalPages}.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Client-Side Canvas Vector Renderer with hideLoader={true} to suppress raw skeleton */}
                        <PdfPageView
                          pdfUrl={pdfUrl || api.getSubmissionPdfUrl(submissionId)}
                          cacheKey={`submission_${submissionId}`}
                          pageNumber={p}
                          targetWidth={1400}
                          hideLoader={true}
                          onAspectCalculated={(aspect) => handleAspectCalculated(p, aspect)}
                          onRenderSuccess={() => {
                            loadedPagesRef.current.add(`${submissionId}_p_${p}`);
                            if (p === currentPage) {
                              setIsPageImageLoading(false);
                            }
                          }}
                          onError={() => {
                            if (p === currentPage) {
                              setIsPageImageLoading(false);
                            }
                            setFailedPages((prev) => {
                              const next = new Set(prev);
                              next.add(p);
                              return next;
                            });
                          }}
                        />
                      </>
                    )}

                    {/* Page 1 Teacher Score Stamp */}
                    {showAnnotations && !hideScoreStamp && p === 1 && totalMax > 0 && (
                      <PageScoreStamp
                        totalScore={totalScore}
                        totalMax={totalMax}
                        scorePct={scorePct}
                        invScale={invScale}
                      />
                    )}

                    {/* Co-located Bounding Box Overlays */}
                    {isCurrent &&
                      (() => {
                        const activeEditingId = editingRegionId || propEditingAnswerId;
                        const isAnyBoxEditing = Boolean(activeEditingId);

                        return pageRegions.map(({ region, answer }, idx) => {
                          const regId = region.id || answer.id;
                          const isSelected = selectedAnswerId === answer.id;
                          const isHovered = hoveredAnswerId === answer.id;
                          const isEditing =
                            editingRegionId === regId ||
                            (Boolean(propEditingAnswerId) && propEditingAnswerId === answer.id);
                          const isDimmed = isAnyBoxEditing && !isEditing;

                          if (!showAnnotations && !isEditing) return null;

                          const coords = draftCoords[regId] || {
                            x: region.x,
                            y: region.y,
                            width: region.width,
                            height: region.height,
                          };

                          return (
                            <AnnotationBoundingBox
                              key={regId}
                              region={region}
                              answer={answer}
                              idx={idx}
                              regId={regId}
                              coords={coords}
                              isSelected={isSelected}
                              isHovered={isHovered}
                              isEditing={isEditing}
                              isDimmed={isDimmed}
                              isActivelyDragging={activeDragRegionId === regId}
                              isModified={Boolean(draftCoords[regId]?.isModified)}
                              invScale={invScale}
                              readOnly={readOnly}
                              savingRegionId={savingRegionId}
                              onSelect={() => onSelectAnswer(answer)}
                              onInspect={onInspectAnswer ? () => onInspectAnswer(answer) : undefined}
                              onMouseEnter={() => setHoveredAnswerId(answer.id)}
                              onMouseLeave={() => setHoveredAnswerId(null)}
                              onStartDrag={(e, handle) => handleStartDrag(e, handle, region, answer)}
                              onEnterEditMode={(e) => {
                                e.stopPropagation();
                                setEditingRegionId(regId);
                                if (onSetEditingAnswerId) onSetEditingAnswerId(answer.id);
                              }}
                              onExitEditMode={handleExitEditMode}
                              onSaveRegion={handleSaveRegion}
                              onRevertRegion={handleRevertRegion}
                              onDeleteRegion={onDeleteRegion}
                            />
                          );
                        });
                      })()}
                  </div>
                ) : (
                  <div
                    aria-hidden="true"
                    className="bg-white/70 rounded-lg sm:rounded-xl border border-hairline/60"
                    style={{
                      ...sheetDimStyle,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
