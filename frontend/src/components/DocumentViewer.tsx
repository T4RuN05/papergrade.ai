"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  EyeOff,
  Move,
  Check,
  Loader2,
  Sliders,
  Edit3,
  X,
  ShieldCheck,
  Archive,
  Plus,
  Trash2,
} from "lucide-react";
import { GradedAnswer, AnswerRegion } from "@/lib/types";
import { api, getAuthToken } from "@/lib/api";

type HandleType = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

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
  pdfUrl?: string;
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
}

// In-memory client LRU cache for loaded PDF documents across page changes & reopens
const pdfDocMemoryCache = new Map<string, any>();
const MAX_CACHED_PDFS = 5;

export function DocumentViewer({
  submissionId,
  pageCount,
  pdfUrl: propPdfUrl,
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
}: DocumentViewerProps) {
  const [internalPage, setInternalPage] = useState<number>(1);
  const [containerDims, setContainerDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [pageAspect, setPageAspect] = useState<number>(0.707); // Default A4 ratio (1 / 1.414)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  panRef.current = pan;

  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const zoomScaleRef = useRef(zoomScale);
  zoomScaleRef.current = zoomScale;

  // Counter-scaling factor: keeps annotations, badges, borders and tools crisp and constant in screen size
  const invScale = useMemo(() => {
    return Math.min(1.2, 1 / zoomScale);
  }, [zoomScale]);

  // Annotations visibility toggle (allows turning overlays on/off to view raw scans)
  const [showAnnotations, setShowAnnotations] = useState<boolean>(initialShowAnnotations);

  const didPanRef = useRef(false);
  const isInitialFitRef = useRef(false);

  const [hoveredAnswerId, setHoveredAnswerId] = useState<string | null>(null);
  const [imageError, setImageError] = useState<boolean>(false);
  const [isPageImageLoading, setIsPageImageLoading] = useState<boolean>(true);
  const [isSnapping, setIsSnapping] = useState<boolean>(false);

  const totalPages = Math.max(1, pageCount || 1);
  const PAGE_GAP = 28;

  // Client-Side PDF.js canvas state
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pdfError, setPdfError] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  // Set of loaded page keys to avoid re-triggering loading skeleton when flipping back & forth
  const loadedPagesRef = useRef<Set<string>>(new Set());
  const imgRef = useRef<HTMLImageElement>(null);

  // Active page is controlled if provided by parent, else local
  const currentPage = propCurrentPage !== undefined ? propCurrentPage : internalPage;

  // Clear cache if submission changes, or immediately restore from memory cache
  useEffect(() => {
    loadedPagesRef.current.clear();
    const targetUrl = propPdfUrl || (submissionId ? api.getSubmissionPdfUrl(submissionId) : "");
    if (targetUrl && pdfDocMemoryCache.has(targetUrl)) {
      setPdfDoc(pdfDocMemoryCache.get(targetUrl));
    } else {
      setPdfDoc(null);
    }
    setPdfError(false);
  }, [submissionId, propPdfUrl]);

  // Load the single PDF document into browser memory via pdfjs-dist (zero backend rendering RAM!)
  useEffect(() => {
    let isCancelled = false;
    async function initPdf() {
      if (!submissionId) return;
      setPdfError(false);
      const authToken = getAuthToken();
      const targetUrl = propPdfUrl || api.getSubmissionPdfUrl(submissionId);

      // Instant hit: document is already parsed and cached in browser memory
      if (pdfDocMemoryCache.has(targetUrl)) {
        setPdfDoc(pdfDocMemoryCache.get(targetUrl));
        return;
      }

      try {
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version || "3.11.174"}/pdf.worker.min.js`;
        }
        const loadingTask = pdfjs.getDocument({
          url: targetUrl,
          withCredentials: false,
        });
        const doc = await loadingTask.promise;
        if (!isCancelled) {
          if (pdfDocMemoryCache.size >= MAX_CACHED_PDFS) {
            const oldestKey = pdfDocMemoryCache.keys().next().value;
            if (oldestKey) pdfDocMemoryCache.delete(oldestKey);
          }
          pdfDocMemoryCache.set(targetUrl, doc);
          setPdfDoc(doc);
        }
      } catch (err: any) {
        console.warn("Client-side PDF.js could not load PDF directly, falling back to server page image:", err);
        pdfDocMemoryCache.delete(targetUrl);
        if (!isCancelled) {
          setPdfError(true);
        }
      }
    }
    initPdf();
    return () => {
      isCancelled = true;
    };
  }, [submissionId, propPdfUrl]);

  const setCurrentPage = (p: number | ((prev: number) => number)) => {
    const next = typeof p === "function" ? p(currentPage) : p;
    const clamped = Math.max(1, Math.min(totalPages, next));
    if (onPageChange) {
      onPageChange(clamped);
    } else {
      setInternalPage(clamped);
    }
  };

  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  const totalPagesRef = useRef(totalPages);
  totalPagesRef.current = totalPages;

  const setCurrentPageRef = useRef(setCurrentPage);
  setCurrentPageRef.current = setCurrentPage;

  // Draft coordinates for locally dragged/resized regions
  const [draftCoords, setDraftCoords] = useState<Record<string, DraftRegionCoord>>({});
  const [activeDragRegionId, setActiveDragRegionId] = useState<string | null>(null);
  const [savingRegionId, setSavingRegionId] = useState<string | null>(null);
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);
  const [showAddBoxDropdown, setShowAddBoxDropdown] = useState<boolean>(false);
  const [addBoxSearch, setAddBoxSearch] = useState<string>("");

  // Sync with propEditingAnswerId
  useEffect(() => {
    if (propEditingAnswerId) {
      setShowAnnotations(true);
      const match = answers.find((a) => a.id === propEditingAnswerId);
      const regOnThisPage = (match?.regions || []).find((r) => r.page_number === currentPage);
      if (regOnThisPage) {
        setEditingRegionId(regOnThisPage.id || null);
      } else if (match) {
        // Answer has 0 regions on this specific page: spawn a draft continuation box on THIS page!
        const newRegId = `draft-add-${match.id}-${currentPage}`;
        setDraftCoords((prev) => {
          const next = { ...prev };
          // Clean up any stale uncommitted drafts for this answer on other pages
          Object.keys(next).forEach((k) => {
            if (k.startsWith(`draft-add-${match.id}-`) || k.startsWith(`draft-new-${match.id}`)) {
              delete next[k];
            }
          });
          next[newRegId] = {
            x: 0.15,
            y: 0.20,
            width: 0.70,
            height: 0.15,
            page_number: currentPage,
            isModified: true,
          };
          return next;
        });
        setEditingRegionId(newRegId);
      }
    } else if (propEditingAnswerId === null) {
      setEditingRegionId(null);
    }
  }, [propEditingAnswerId, answers, currentPage]);

  const handleSpawnDraftBox = (ansId: string) => {
    setShowAnnotations(true);
    const match = answers.find((a) => a.id === ansId || a.question_id === ansId);
    if (!match) return;
    const newRegId = `draft-add-${match.id}-${currentPage}`;
    setDraftCoords((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (k.startsWith(`draft-add-${match.id}-`) || k.startsWith(`draft-new-${match.id}`)) {
          delete next[k];
        }
      });
      next[newRegId] = {
        x: 0.15,
        y: 0.20,
        width: 0.70,
        height: 0.15,
        page_number: currentPage,
        isModified: true,
      };
      return next;
    });
    setEditingRegionId(newRegId);
    if (onSetEditingAnswerId) {
      onSetEditingAnswerId(match.id);
    }
  };

  // Ref to the active page sheet and viewport
  const activeSheetRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Measure viewport container dimensions dynamically
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

  // Mobile / Desktop carousel sliding state
  const [touchOffset, setTouchOffset] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState<boolean>(false);

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

  // Reset zoom & pan on page change so newly selected page is cleanly framed
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoomScale(1.0);
    setTouchOffset(0);
    setIsSwiping(false);
  }, [currentPage]);

  const handleZoomIn = () => {
    setZoomScale((z) => Math.min(3.5, Number((z + 0.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoomScale((z) => {
      const next = Math.max(1.0, Number((z - 0.25).toFixed(2)));
      if (next <= 1.05) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleResetZoom = useCallback(() => {
    setZoomScale(1.0);
    setPan({ x: 0, y: 0 });
    setIsSnapping(true);
    const timer = setTimeout(() => setIsSnapping(false), 300);
    return () => clearTimeout(timer);
  }, []);

  // Touch gesture handling: 1:1 carousel swiping when scale <= 1.05, 2D pan when zoomed, pinch-to-zoom & double-tap
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef<number>(0);
  const lastTapTimeRef = useRef<number>(0);
  const isPinchingRef = useRef<boolean>(false);
  const initialPinchDistRef = useRef<number>(0);
  const initialZoomRef = useRef<number>(1);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest("[data-handle]") ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest("[data-prevent-swipe]")
    ) {
      return;
    }

    didPanRef.current = false;
    setIsSnapping(false);

    if (e.touches.length === 2) {
      e.preventDefault();
      isPinchingRef.current = true;
      setIsSwiping(false);
      setTouchOffset(0);
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
      setTouchOffset(0);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isPinchingRef.current && e.touches.length === 2 && initialPinchDistRef.current > 0) {
      e.preventDefault();
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
      // Zoomed in: pan within active sheet
      e.preventDefault();
      const newX = panStartRef.current.x + deltaX;
      const newY = panStartRef.current.y + deltaY;
      setPan(clampPan(newX, newY, zoomScaleRef.current));
    } else {
      // Fit mode: slide between pages
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

  const handleTouchEnd = (e: React.TouchEvent) => {
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

      touchStartXRef.current = null;
      touchStartYRef.current = null;
    }
  };

  // Desktop mouse dragging & wheel handlers
  const isMouseDownRef = useRef<boolean>(false);
  const mouseStartXRef = useRef<number | null>(null);
  const mouseStartYRef = useRef<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest("[data-handle]") ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest("[data-prevent-swipe]")
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

  // Keyboard navigation: Left/Right arrows for page switching when in fit mode
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

  // Global mousemove and mouseup listeners for dragging/resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const { handle, startClientX, startClientY, initialBox, containerW, containerH, regionId } =
        drag;
      if (!regionId) return;

      const deltaX_px = (e.clientX - startClientX) / zoomScale;
      const deltaY_px = (e.clientY - startClientY) / zoomScale;

      if (Math.abs(deltaX_px) > 2 || Math.abs(deltaY_px) > 2) {
        drag.hasMoved = true;
      }

      const dx = deltaX_px / (containerW || 1);
      const dy = deltaY_px / (containerH || 1);

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

      const updatedCoords = {
        x: Math.round(newX * 1000) / 1000,
        y: Math.round(newY * 1000) / 1000,
        width: Math.round(newW * 1000) / 1000,
        height: Math.round(newH * 1000) / 1000,
        isModified: true,
      };

      setDraftCoords((prev) => {
        if (!regionId) return prev;
        return {
          ...prev,
          [regionId]: updatedCoords,
        };
      });
    };

    const handleEnd = () => {
      if (dragStateRef.current) {
        dragStateRef.current = null;
        setActiveDragRegionId(null);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!dragStateRef.current || e.touches.length !== 1) return;
      handleMouseMove({
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY,
      } as any);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleEnd);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [zoomScale]);

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

    // Use active sheet dimensions divided by zoomScale to get unscaled base resolution
    const containerW = activeSheetRef.current?.clientWidth || 600;
    const containerH = activeSheetRef.current?.clientHeight || 800;

    const regId = region.id || answer.id;
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
      startClientX: clientX,
      startClientY: clientY,
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
    setShowAnnotations(true);
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

  const handleSaveRegion = async (
    regionId: string,
    coords: DraftRegionCoord,
    targetAnswerId?: string
  ) => {
    if (!onUpdateRegion) return;
    setSavingRegionId(regionId);
    try {
      await onUpdateRegion(regionId, {
        answer_id: targetAnswerId,
        page_number: currentPage,
        x: coords.x,
        y: coords.y,
        width: coords.width,
        height: coords.height,
      } as any);
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
    } catch (e) {
      console.error("Failed to save region:", e);
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

  // Helper to retrieve all regions for any specific page sheet (including active drafts)
  const getPageRegions = useCallback(
    (pageNum: number) => {
      const list: { region: AnswerRegion; answer: GradedAnswer }[] = [];
      answers.forEach((ans) => {
        (ans.regions || []).forEach((reg) => {
          if (reg.page_number === pageNum) {
            list.push({ region: reg, answer: ans });
          }
        });
      });

      // If we are actively editing a draft region for an unallocated answer or multi-page continuation on this page, include it
      if (editingRegionId && (editingRegionId.startsWith("draft-new-") || editingRegionId.startsWith("draft-add-"))) {
        const draft = draftCoords[editingRegionId];
        if (draft && draft.page_number === pageNum) {
          const ansId = (() => {
            if (editingRegionId.startsWith("draft-add-")) {
              const m = editingRegionId.match(/^draft-add-(.+)-(\d+)$/);
              return m ? m[1] : editingRegionId.replace("draft-add-", "");
            }
            return editingRegionId.replace("draft-new-", "");
          })();
          const match = answers.find((a) => a.id === ansId || a.question_id === ansId);
          if (match && !list.some((pr) => pr.region.id === editingRegionId)) {
            list.push({
              region: {
                id: editingRegionId,
                page_number: pageNum,
                x: draft.x,
                y: draft.y,
                width: draft.width,
                height: draft.height,
              },
              answer: match,
            });
          }
        }
      }
      return list;
    },
    [answers, editingRegionId, draftCoords]
  );


  const getStatusColor = (ans: GradedAnswer) => {
    if (ans.needs_review) {
      return {
        border: "border-[#553578] dark:border-[#bf9fe3]",
        bg: "bg-[#f4f0f8]/40 hover:bg-[#f4f0f8]/70 dark:bg-[#1f162a]/30 dark:hover:bg-[#1f162a]/50",
        badge: "bg-[#553578] text-white dark:bg-[#1f162a] dark:text-[#bf9fe3] dark:border dark:border-[#38264e] shadow-2xs",
        text: "text-[#553578] dark:text-[#bf9fe3]",
        icon: Flag,
        statusLabel: "Needs Review",
      };
    }
    if (ans.awarded_marks >= ans.max_marks && ans.max_marks > 0) {
      return {
        border: "border-[#1e613b] dark:border-[#86d4a4]",
        bg: "bg-[#edf5f0]/40 hover:bg-[#edf5f0]/70 dark:bg-[#13231a]/30 dark:hover:bg-[#13231a]/50",
        badge: "bg-[#1e613b] text-white dark:bg-[#13231a] dark:text-[#86d4a4] dark:border dark:border-[#1d3d2a] shadow-2xs",
        text: "text-[#1e613b] dark:text-[#86d4a4]",
        icon: CheckCircle2,
        statusLabel: "Full Marks",
      };
    }
    if (ans.awarded_marks > 0) {
      return {
        border: "border-[#7a4e18] dark:border-[#e5ad68]",
        bg: "bg-[#faf4ec]/40 hover:bg-[#faf4ec]/70 dark:bg-[#241a10]/30 dark:hover:bg-[#241a10]/50",
        badge: "bg-[#7a4e18] text-white dark:bg-[#241a10] dark:text-[#e5ad68] dark:border dark:border-[#422c17] shadow-2xs",
        text: "text-[#7a4e18] dark:text-[#e5ad68]",
        icon: AlertTriangle,
        statusLabel: "Partial Marks",
      };
    }
    return {
      border: "border-[#872323] dark:border-[#e87878]",
      bg: "bg-[#fbf0f0]/40 hover:bg-[#fbf0f0]/70 dark:bg-[#261212]/30 dark:hover:bg-[#261212]/50",
      badge: "bg-[#872323] text-white dark:bg-[#261212] dark:text-[#e87878] dark:border dark:border-[#491f1f] shadow-2xs",
      text: "text-[#872323] dark:text-[#e87878]",
      icon: XCircle,
      statusLabel: "Incorrect",
    };
  };

  const pageImageUrl = api.getPageImageUrl(submissionId, currentPage);

  return (
    <div className="relative flex flex-col h-full rounded-lg border border-hairline bg-surface overflow-hidden shadow-notion-card select-none">
      {/* Top Toolbar - Clean Notion Aesthetic */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 border-b border-hairline bg-canvas-soft px-3 sm:px-4 py-2 sm:py-2.5">
        {/* Page selector */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
                  onClick={() => setCurrentPage(i + 1)}
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

        {/* "+ Add Box on Sheet" Quick Dropdown for Multi-Page Continuation */}
        {!readOnly && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAddBoxDropdown((prev) => !prev)}
              className="btn-glass-utility inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-ink transition-all cursor-pointer"
              title={`Add bounding box for any question on Page ${currentPage}`}
            >
              <Plus className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">Add Box to Page {currentPage}</span>
              <span className="sm:hidden">Add Box</span>
            </button>
            {showAddBoxDropdown && (
              <div className="absolute top-full left-0 mt-1 w-80 max-h-80 overflow-y-auto rounded-lg bg-surface border border-hairline shadow-lg z-50 p-2 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted px-1 py-1 border-b border-hairline flex items-center justify-between">
                  <span>Add Box on Page {currentPage}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddBoxDropdown(false);
                      setAddBoxSearch("");
                    }}
                    className="text-ink-muted hover:text-ink cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="px-0.5">
                  <input
                    type="text"
                    value={addBoxSearch}
                    onChange={(e) => setAddBoxSearch(e.target.value)}
                    placeholder="Search question (e.g. Q4.2)..."
                    className="w-full px-2 py-1 text-xs rounded border border-hairline bg-canvas-soft text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
                    autoFocus
                  />
                </div>
                <div className="text-[10px] text-ink-muted px-1">
                  Select question to link continuation:
                </div>
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {answers
                    .filter((ans) => {
                      if (!addBoxSearch.trim()) return true;
                      const q = addBoxSearch.toLowerCase();
                      return (
                        ans.question_id.toLowerCase().includes(q) ||
                        (ans.question_text || "").toLowerCase().includes(q)
                      );
                    })
                    .map((ans) => {
                      const hasRegionHere = (ans.regions || []).some((r) => r.page_number === currentPage);
                      const regionCount = (ans.regions || []).length;
                      return (
                        <button
                          key={ans.id}
                          type="button"
                          onClick={() => {
                            setShowAddBoxDropdown(false);
                            setAddBoxSearch("");
                            handleSpawnDraftBox(ans.id);
                          }}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-xs hover:bg-canvas-soft transition-colors cursor-pointer group"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-mono font-bold text-ink group-hover:text-primary block truncate">
                              {ans.question_id}
                            </span>
                            <span className="text-[10px] text-ink-muted block truncate">
                              {ans.question_text ? ans.question_text.slice(0, 30) + "..." : `${ans.awarded_marks}/${ans.max_marks} marks`}
                            </span>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium shrink-0 ${
                            hasRegionHere
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : regionCount > 0
                              ? "bg-teal-50 text-teal-700 border border-teal-200"
                              : "bg-canvas-soft text-ink-muted border border-hairline"
                          }`}>
                            {hasRegionHere ? "On Sheet" : regionCount > 0 ? `+ Spans (${regionCount})` : "+ Add New"}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

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
            <span className="h-2 w-2 rounded-full bg-[#872323]"></span> Incorrect
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#553578]"></span> Review
          </span>
        </div>

        {/* Annotations Visibility Toggle Switch */}
        <button
          type="button"
          onClick={() => setShowAnnotations((prev) => !prev)}
          className={`btn-glass-utility flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            showAnnotations
              ? "text-primary"
              : "text-ink-muted opacity-80"
          }`}
          title={showAnnotations ? "Hide bounding boxes & annotations" : "Show bounding boxes & annotations"}
          aria-label={showAnnotations ? "Hide annotations" : "Show annotations"}
        >
          {showAnnotations ? (
            <Eye className="h-3.5 w-3.5 text-primary" />
          ) : (
            <EyeOff className="h-3.5 w-3.5 text-ink-muted" />
          )}
          <span className="hidden sm:inline">{showAnnotations ? "Annotations On" : "Annotations Off"}</span>
        </button>

        {/* Zoom Controls (hidden on mobile, visible on desktop) */}
        <div className="hidden sm:flex items-center gap-0.5 bg-surface rounded-md p-0.5 border border-hairline shadow-2xs">
          <button
            onClick={handleZoomOut}
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
            onClick={handleZoomIn}
            disabled={zoomScale >= 3.5}
            className="rounded p-1 text-ink-muted hover:bg-canvas-soft hover:text-ink disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          {zoomScale !== 1.0 && (
            <button
              onClick={handleResetZoom}
              className="rounded p-1 text-ink-muted hover:bg-canvas-soft hover:text-ink transition-colors cursor-pointer"
              title="Reset Zoom"
            >
              <RotateCcw className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Canvas Viewport - Fixed Frame Viewer with Smooth Horizontal Carousel */}
      <div
        ref={viewportRef}
        className="relative flex-1 w-full overflow-hidden bg-[#f6f6f4] select-none touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {/* Connected Pages Carousel Track */}
        <div
          className="flex items-center h-full will-change-transform"
          style={{
            width: `${totalPages * 100}%`,
            transform: `translateX(calc(-${((currentPage - 1) / totalPages) * 100}% + ${touchOffset}px))`,
            transition: isSwiping ? "none" : "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const isNearby = Math.abs(p - currentPage) <= 1;
            const pageRegions = getPageRegions(p);

            return (
              <div
                key={p}
                className="h-full flex items-center justify-center p-2 sm:p-4 flex-shrink-0 overflow-hidden"
                style={{ width: `${100 / totalPages}%` }}
              >
                {/* Fixed Frame Page Sheet with Dynamic Bounding Box Zoom */}
                <div
                  ref={p === currentPage ? activeSheetRef : undefined}
                  className="relative bg-white rounded-lg sm:rounded-xl shadow-lg border border-hairline overflow-hidden flex items-center justify-center select-none"
                  style={{
                    height: "100%",
                    maxHeight: "100%",
                    maxWidth: "100%",
                    aspectRatio: `${pageAspect}`,
                    width: "auto",
                    transform:
                      p === currentPage && zoomScale > 1.05
                        ? `translate(${pan.x}px, ${pan.y}px) scale(${zoomScale})`
                        : "none",
                    transformOrigin: "center center",
                    willChange: "transform",
                    transition: isSnapping ? "transform 300ms cubic-bezier(0.16, 1, 0.3, 1)" : "none",
                  }}
                >
                {/* Base Page Image, Loading Spinner, or Retention Purged Notice */}
                {imageError ? (
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
                        : "Unable to render this page image or document stream. Please verify your connection or click retry below."}
                    </p>
                    {!isDocumentPurged && (
                      <button
                        type="button"
                        onClick={() => {
                          setImageError(false);
                          setPdfError(false);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-white hover:bg-primary-hover transition-colors"
                      >
                        Retry Loading
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Paper Fetching Loading Screen */}
                    {p === currentPage && isPageImageLoading && !loadedPagesRef.current.has(`${submissionId}_p_${p}`) && (
                      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-white/95 rounded-sm shadow-2xs">
                        <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-xs animate-pulse">
                          <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin text-primary" />
                        </div>
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

                    <img
                      src={api.getPageImageUrl(submissionId, p)}
                      alt={`Student Page ${p}`}
                      className="w-full h-full block rounded-sm select-none pointer-events-none"
                      loading={isNearby ? "eager" : "lazy"}
                      decoding="async"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                          setPageAspect(img.naturalWidth / img.naturalHeight);
                        }
                        loadedPagesRef.current.add(`${submissionId}_p_${p}`);
                        if (p === currentPage) {
                          setIsPageImageLoading(false);
                        }
                      }}
                      onError={() => {
                        if (p === currentPage) {
                          setIsPageImageLoading(false);
                          setImageError(true);
                        }
                      }}
                    />
                  </>
                )}

                {/* Page 1 Teacher Score Stamp (Clean Red Ink Stamp Aesthetic) */}
                {showAnnotations && !hideScoreStamp && p === 1 && totalMax > 0 && totalAwardedMarks !== undefined && totalAwardedMarks !== null && (
            <div
              className="absolute top-2 right-2 sm:top-4 sm:right-4 z-20 pointer-events-none select-none rounded-md sm:rounded-lg border sm:border-2 border-red-600/90 bg-white/95 backdrop-blur-xs px-2 py-1 sm:px-4 sm:py-2 shadow-sm text-left border-dashed"
              style={{
                transformOrigin: "top right",
                transform: `scale(${invScale})`,
              }}
            >
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
            const regId = region.id || answer.id;
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

            // Hide bounding box if annotations are toggled off and this box is not actively being edited
            if (!showAnnotations && !isEditing) return null;

            const allRegions = answer.regions || [];
            const regionIndex = allRegions.findIndex(
              (r) =>
                r.id === region.id ||
                (r.page_number === region.page_number && r.x === region.x && r.y === region.y)
            );
            const isMultiRegion = allRegions.length > 1;
            const isNearPageTop = coords.y < 0.035;
            const isNearRightEdge = coords.x + coords.width > 0.95;
            const isNearBottom = coords.y + coords.height > 0.85;

            return (
              <div
                key={regId}
                onClick={(e) => {
                  e.stopPropagation();
                  if (didPanRef.current || isEditing) return;
                  if (onInspectAnswer) {
                    onInspectAnswer(answer);
                  } else {
                    onSelectAnswer(answer);
                  }
                }}
                onMouseEnter={() => setHoveredAnswerId(answer.id)}
                onMouseLeave={() => setHoveredAnswerId(null)}
                className={`absolute rounded-xs box-border transition-colors ${
                  isModified ? "border-dashed border-primary bg-primary/10 shadow-sm" : `${style.border} ${style.bg}`
                } ${
                  isEditing
                    ? "z-30 cursor-move"
                    : isSelected
                    ? "z-20 cursor-pointer"
                    : "z-10 hover:z-20 cursor-pointer"
                }`}
                style={{
                  left: `${coords.x * 100}%`,
                  top: `${coords.y * 100}%`,
                  width: `${coords.width * 100}%`,
                  height: `${coords.height * 100}%`,
                  borderWidth: `${Math.max(1, Number((2 * invScale).toFixed(2)))}px`,
                  boxShadow: isEditing
                    ? `0 0 0 ${Math.max(1, Number((2 * invScale).toFixed(2)))}px #2563eb`
                    : isSelected
                    ? `0 0 0 ${Math.max(1, Number((1.5 * invScale).toFixed(2)))}px rgba(37, 99, 235, 0.6)`
                    : undefined,
                }}
                onMouseDown={(e) => {
                  // Drag inside box to move only when in edit mode
                  if (isEditing) {
                    handleStartDrag(e, "move", region, answer);
                  }
                }}
              >
                {/* Score badge at top-left of box - Counter-scaled with zoom */}
                <div
                  className={`absolute flex items-center gap-1.5 whitespace-nowrap rounded-xs px-2 py-0.5 text-[10px] font-bold shadow-xs transition-all pointer-events-none select-none ${
                    style.badge
                  }`}
                  style={{
                    bottom: isNearPageTop ? undefined : "100%",
                    top: isNearPageTop ? 0 : undefined,
                    left: 0,
                    transformOrigin: isNearPageTop ? "top left" : "bottom left",
                    transform: `scale(${invScale}) translateY(${isNearPageTop ? "2px" : "-2px"})`,
                  }}
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

                {/* Revaluation Flag on Question (Admin & Student) - Counter-scaled with zoom */}
                {answer.revaluation && (
                  <div
                    className={`absolute flex items-center gap-1 whitespace-nowrap rounded-xs px-2 py-0.5 text-[10px] font-bold shadow-xs select-none z-30 ${
                      answer.revaluation.status === "SUBMITTED" || answer.revaluation.status === "UNDER_REVIEW"
                        ? "bg-amber-500 text-white animate-pulse border border-amber-600"
                        : answer.revaluation.decision === "MARKS_REVISED"
                        ? "bg-emerald-600 text-white border border-emerald-700"
                        : "bg-slate-600 text-white border border-slate-700"
                    }`}
                    style={{
                      bottom: isNearPageTop ? undefined : "100%",
                      top: isNearPageTop ? 0 : undefined,
                      right: 0,
                      transformOrigin: isNearPageTop ? "top right" : "bottom right",
                      transform: `scale(${invScale}) translateY(${isNearPageTop ? "2px" : "-2px"})`,
                    }}
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

                {/* Live Dimensions Tooltip during Drag - Counter-scaled with zoom */}
                {isActivelyDragging && (
                  <div
                    className="absolute top-1/2 left-1/2 pointer-events-none bg-black/80 text-white font-mono text-[10px] px-2 py-0.5 rounded-full shadow-md z-50 whitespace-nowrap"
                    style={{
                      transformOrigin: "center",
                      transform: `translate(-50%, -50%) scale(${invScale})`,
                    }}
                  >
                    {Math.round(coords.width * 100)}% × {Math.round(coords.height * 100)}%
                  </div>
                )}

                {/* Action Buttons Cluster + Notion Hover Tooltip - Counter-scaled with zoom */}
                {(() => {
                  const isNearLeft = coords.x + coords.width < 0.35;
                  return (
                    <div
                      className="absolute z-40 flex items-center"
                      style={{
                        top: 0,
                        right: 0,
                        transformOrigin: "top right",
                        transform: `scale(${invScale}) translate(${isNearRightEdge ? "-2px" : "6px"}, ${isNearPageTop ? "4px" : "-6px"})`,
                      }}
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

                {/* 8 Interactive Drag Resize Handles (Visible ONLY when in edit mode and NOT readOnly) - Counter-scaled with zoom */}
                {!readOnly && isEditing && (
                  <>
                    {/* NW Corner */}
                    <div
                      data-handle="nw"
                      onMouseDown={(e) => handleStartDrag(e, "nw", region, answer)}
                      onTouchStart={(e) => handleStartDrag(e, "nw", region, answer)}
                      className="absolute w-3.5 h-3.5 bg-white border-2 border-primary rounded-xs shadow-xs cursor-nwse-resize z-40 before:absolute before:-inset-2 before:content-['']"
                      style={{
                        top: 0,
                        left: 0,
                        transformOrigin: "center",
                        transform: `translate(-50%, -50%) scale(${invScale})`,
                      }}
                      title="Drag to resize top-left"
                    />
                    {/* N Edge */}
                    <div
                      data-handle="n"
                      onMouseDown={(e) => handleStartDrag(e, "n", region, answer)}
                      onTouchStart={(e) => handleStartDrag(e, "n", region, answer)}
                      className="absolute w-4 h-2.5 bg-white border-2 border-primary rounded-xs shadow-xs cursor-ns-resize z-40 before:absolute before:-inset-2 before:content-['']"
                      style={{
                        top: 0,
                        left: "50%",
                        transformOrigin: "center",
                        transform: `translate(-50%, -50%) scale(${invScale})`,
                      }}
                      title="Drag to resize top"
                    />
                    {/* NE Corner */}
                    <div
                      data-handle="ne"
                      onMouseDown={(e) => handleStartDrag(e, "ne", region, answer)}
                      onTouchStart={(e) => handleStartDrag(e, "ne", region, answer)}
                      className="absolute w-3.5 h-3.5 bg-white border-2 border-primary rounded-xs shadow-xs cursor-nesw-resize z-40 before:absolute before:-inset-2 before:content-['']"
                      style={{
                        top: 0,
                        right: 0,
                        transformOrigin: "center",
                        transform: `translate(50%, -50%) scale(${invScale})`,
                      }}
                      title="Drag to resize top-right"
                    />
                    {/* E Edge */}
                    <div
                      data-handle="e"
                      onMouseDown={(e) => handleStartDrag(e, "e", region, answer)}
                      onTouchStart={(e) => handleStartDrag(e, "e", region, answer)}
                      className="absolute w-2.5 h-4 bg-white border-2 border-primary rounded-xs shadow-xs cursor-ew-resize z-40 before:absolute before:-inset-2 before:content-['']"
                      style={{
                        top: "50%",
                        right: 0,
                        transformOrigin: "center",
                        transform: `translate(50%, -50%) scale(${invScale})`,
                      }}
                      title="Drag to resize right"
                    />
                    {/* SE Corner */}
                    <div
                      data-handle="se"
                      onMouseDown={(e) => handleStartDrag(e, "se", region, answer)}
                      onTouchStart={(e) => handleStartDrag(e, "se", region, answer)}
                      className="absolute w-3.5 h-3.5 bg-white border-2 border-primary rounded-xs shadow-xs cursor-nwse-resize z-40 before:absolute before:-inset-2 before:content-['']"
                      style={{
                        bottom: 0,
                        right: 0,
                        transformOrigin: "center",
                        transform: `translate(50%, 50%) scale(${invScale})`,
                      }}
                      title="Drag to resize bottom-right"
                    />
                    {/* S Edge */}
                    <div
                      data-handle="s"
                      onMouseDown={(e) => handleStartDrag(e, "s", region, answer)}
                      onTouchStart={(e) => handleStartDrag(e, "s", region, answer)}
                      className="absolute w-4 h-2.5 bg-white border-2 border-primary rounded-xs shadow-xs cursor-ns-resize z-40 before:absolute before:-inset-2 before:content-['']"
                      style={{
                        bottom: 0,
                        left: "50%",
                        transformOrigin: "center",
                        transform: `translate(-50%, 50%) scale(${invScale})`,
                      }}
                      title="Drag to resize bottom"
                    />
                    {/* SW Corner */}
                    <div
                      data-handle="sw"
                      onMouseDown={(e) => handleStartDrag(e, "sw", region, answer)}
                      onTouchStart={(e) => handleStartDrag(e, "sw", region, answer)}
                      className="absolute w-3.5 h-3.5 bg-white border-2 border-primary rounded-xs shadow-xs cursor-nesw-resize z-40 before:absolute before:-inset-2 before:content-['']"
                      style={{
                        bottom: 0,
                        left: 0,
                        transformOrigin: "center",
                        transform: `translate(-50%, 50%) scale(${invScale})`,
                      }}
                      title="Drag to resize bottom-left"
                    />
                    {/* W Edge */}
                    <div
                      data-handle="w"
                      onMouseDown={(e) => handleStartDrag(e, "w", region, answer)}
                      onTouchStart={(e) => handleStartDrag(e, "w", region, answer)}
                      className="absolute w-2.5 h-4 bg-white border-2 border-primary rounded-xs shadow-xs cursor-ew-resize z-40 before:absolute before:-inset-2 before:content-['']"
                      style={{
                        top: "50%",
                        left: 0,
                        transformOrigin: "center",
                        transform: `translate(-50%, -50%) scale(${invScale})`,
                      }}
                      title="Drag to resize left"
                    />
                  </>
                )}

                {/* Floating Save / Revert / Exit Action Bar on Modified or Editing Box - Counter-scaled with zoom */}
                {(isModified || isEditing) && (
                  <div
                    className="absolute flex items-center gap-1.5 bg-surface border border-hairline shadow-lg px-2.5 py-1 rounded-md text-xs z-50 animate-in fade-in zoom-in-95 pointer-events-auto select-none whitespace-nowrap"
                    style={{
                      [isNearBottom ? "bottom" : "top"]: "100%",
                      left: "50%",
                      transformOrigin: isNearBottom ? "bottom center" : "top center",
                      transform: `translateX(-50%) translateY(${
                        isNearBottom ? `-${8 * invScale}px` : `${8 * invScale}px`
                      }) scale(${invScale})`,
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {isModified ? (
                      <>
                        <span className="text-[10px] text-ink-muted font-medium">Box adjusted</span>
                        <button
                          type="button"
                          onClick={() => handleSaveRegion(region.id || answer.id, coords, answer.id)}
                          disabled={savingRegionId === (region.id || answer.id)}
                          className="btn-glass-primary flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold transition-all disabled:opacity-50 cursor-pointer"
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
                          className="btn-glass-utility flex items-center gap-1 px-2 py-0.5 rounded text-ink-secondary text-[11px] cursor-pointer"
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
                    {onDeleteRegion && region.id && !region.id.startsWith("draft-") && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const targetRegId = region.id;
                          if (!targetRegId) return;
                          if (confirm(`Remove this bounding box region on Page ${currentPage} for ${answer.question_id}?`)) {
                            await onDeleteRegion(targetRegId);
                            handleExitEditMode();
                          }
                        }}
                        className="btn-glass-utility flex items-center gap-1 px-2 py-0.5 rounded text-rose-600 hover:text-rose-700 transition-colors text-[11px] font-medium cursor-pointer ml-1"
                        title="Delete this bounding box region"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleExitEditMode(e, regId)}
                      className="btn-glass-utility flex items-center gap-1 px-2 py-0.5 rounded text-ink-muted hover:text-ink transition-colors text-[11px] font-medium cursor-pointer ml-1"
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
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
