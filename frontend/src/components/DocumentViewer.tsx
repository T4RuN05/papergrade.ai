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

  // Render currentPage directly to client-side HTML5 canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let isCancelled = false;

    async function renderPage() {
      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch (_) {}
        }
        setIsPageImageLoading(true);
        const page = await pdfDoc.getPage(currentPage);
        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Viewport scale 1.5 provides crisp, tack-sharp retina handwriting on both mobile and desktop
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        if (viewport.width > 0 && viewport.height > 0) {
          setPageAspect(viewport.width / viewport.height);
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
        renderTaskRef.current = null;

        if (!isCancelled) {
          loadedPagesRef.current.add(`${submissionId}_p_${currentPage}`);
          setIsPageImageLoading(false);
        }
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.error("PDF page render error:", err);
          setIsPageImageLoading(false);
        }
      }
    }

    renderPage();
    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (_) {}
      }
    };
  }, [pdfDoc, currentPage, submissionId]);

  // Fallback image handling when PDF.js is unavailable
  useEffect(() => {
    if (!pdfError) return;
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
  }, [currentPage, submissionId, pdfError]);

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
  const [showAddBoxDropdown, setShowAddBoxDropdown] = useState<boolean>(false);

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
        setDraftCoords((prev) => ({
          ...prev,
          [newRegId]: {
            x: 0.15,
            y: 0.20,
            width: 0.70,
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

  const handleSpawnDraftBox = (ansId: string) => {
    setShowAnnotations(true);
    const match = answers.find((a) => a.id === ansId);
    if (!match) return;
    const newRegId = `draft-add-${match.id}-${currentPage}`;
    setDraftCoords((prev) => ({
      ...prev,
      [newRegId]: {
        x: 0.15,
        y: 0.20,
        width: 0.70,
        height: 0.15,
        page_number: currentPage,
        isModified: true,
      },
    }));
    setEditingRegionId(newRegId);
    if (onSetEditingAnswerId) {
      onSetEditingAnswerId(match.id);
    }
    onSelectAnswer(match);
  };

  // Ref to the zoomable image container and viewport
  const imageContainerRef = useRef<HTMLDivElement>(null);
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

  // Compute base display dimensions that fit BOTH width and height by default
  const baseDimensions = useMemo(() => {
    const cW = containerDims.width > 0 ? containerDims.width : 800;
    const cH = containerDims.height > 0 ? containerDims.height : 600;
    const isMobile = cW < 640;
    const pad = isMobile ? 8 : 20;

    const availW = Math.max(100, cW - pad * 2);
    const availH = Math.max(100, cH - pad * 2);

    let w = availW;
    let h = availW / pageAspect;

    if (h > availH) {
      h = availH;
      w = availH * pageAspect;
    }

    return {
      width: Math.round(w),
      height: Math.round(h),
      containerW: cW,
      containerH: cH,
    };
  }, [containerDims.width, containerDims.height, pageAspect]);

  // Keep pan bounded so the document can be slid freely in all directions without getting lost
  const clampPan = useCallback((targetX: number, targetY: number, scale: number) => {
    const cW = baseDimensions.containerW;
    const cH = baseDimensions.containerH;
    const curW = baseDimensions.width * scale;
    const curH = baseDimensions.height * scale;

    let minX: number;
    let maxX: number;
    if (curW > cW) {
      minX = cW - curW - 16;
      maxX = 16;
    } else {
      const cx = (cW - curW) / 2;
      minX = cx - 20;
      maxX = cx + 20;
    }

    let minY: number;
    let maxY: number;
    if (curH > cH) {
      minY = cH - curH - 16;
      maxY = 16;
    } else {
      const cy = (cH - curH) / 2;
      minY = cy - 20;
      maxY = cy + 20;
    }

    return {
      x: Math.round(Math.max(minX, Math.min(maxX, targetX))),
      y: Math.round(Math.max(minY, Math.min(maxY, targetY))),
    };
  }, [baseDimensions]);

  // Zoom centered on a specific focal client point (e.g. pinch midpoint, cursor, or viewport center)
  const updateZoomAtPoint = useCallback((targetScale: number, focalClientX: number, focalClientY: number) => {
    const container = viewportRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const focusX = focalClientX - rect.left;
    const focusY = focalClientY - rect.top;

    const currentScale = zoomScaleRef.current;
    const clampedScale = Math.min(3.5, Math.max(0.75, Number(targetScale.toFixed(2))));
    const scaleRatio = clampedScale / currentScale;

    const currentPan = panRef.current;
    const newX = focusX - (focusX - currentPan.x) * scaleRatio;
    const newY = focusY - (focusY - currentPan.y) * scaleRatio;

    const clampedPan = clampPan(newX, newY, clampedScale);
    setZoomScale(clampedScale);
    setPan(clampedPan);
  }, [clampPan]);

  const handleZoomIn = () => {
    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    updateZoomAtPoint(zoomScaleRef.current * 1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const handleZoomOut = () => {
    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    updateZoomAtPoint(zoomScaleRef.current * 0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const handleResetZoom = useCallback(() => {
    setZoomScale(1.0);
    const defX = Math.round((baseDimensions.containerW - baseDimensions.width) / 2);
    const defY = Math.round((baseDimensions.containerH - baseDimensions.height) / 2);
    setPan({ x: defX, y: defY });
  }, [baseDimensions]);

  // Auto-fit to viewport on page navigation or initial dimension measurement
  useEffect(() => {
    if (baseDimensions.containerW > 0 && baseDimensions.containerH > 0) {
      handleResetZoom();
    }
  }, [currentPage, baseDimensions.containerW, baseDimensions.containerH, handleResetZoom]);

  // Touch pinch-to-zoom, touch-to-slide, and desktop mouse drag handling
  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    let isPinching = false;
    let initialPinchDist = 0;
    let initialZoom = 1;

    let isTouchPanning = false;
    let touchStartClient = { x: 0, y: 0 };
    let panStart = { x: 0, y: 0 };
    let lastTapTime = 0;

    let isMousePanning = false;
    let mouseStartClient = { x: 0, y: 0 };
    let mousePanStart = { x: 0, y: 0 };

    const onTouchStart = (e: TouchEvent) => {
      didPanRef.current = false;
      if (e.touches.length === 2) {
        e.preventDefault();
        isPinching = true;
        isTouchPanning = false;
        initialPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialZoom = zoomScaleRef.current;
      } else if (e.touches.length === 1) {
        const target = e.target as HTMLElement;
        if (target.closest("[data-handle]") || target.closest("button") || target.closest("input")) {
          isTouchPanning = false;
          return;
        }
        isTouchPanning = true;
        touchStartClient = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        panStart = { ...panRef.current };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isPinching && e.touches.length === 2 && initialPinchDist > 0) {
        e.preventDefault();
        didPanRef.current = true;
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const targetScale = initialZoom * (currentDist / initialPinchDist);
        updateZoomAtPoint(targetScale, midX, midY);
      } else if (isTouchPanning && e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartClient.x;
        const dy = e.touches[0].clientY - touchStartClient.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          e.preventDefault();
          didPanRef.current = true;
          const rawX = panStart.x + dx;
          const rawY = panStart.y + dy;
          setPan(clampPan(rawX, rawY, zoomScaleRef.current));
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        isPinching = false;
        initialPinchDist = 0;
      }
      if (e.touches.length === 0) {
        isTouchPanning = false;
        if (e.changedTouches.length === 1) {
          const touch = e.changedTouches[0];
          const distMoved = Math.hypot(
            touch.clientX - touchStartClient.x,
            touch.clientY - touchStartClient.y
          );
          const now = Date.now();
          if (distMoved < 12 && now - lastTapTime < 300) {
            // Double-tap toggle: If zoomed, reset to fit; if fit, zoom to 2.0x
            if (zoomScaleRef.current > 1.2) {
              handleResetZoom();
            } else {
              updateZoomAtPoint(2.0, touch.clientX, touch.clientY);
            }
            lastTapTime = 0;
          } else {
            lastTapTime = now;
          }
        }
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-handle]") || target.closest("button") || target.closest("input")) {
        return;
      }
      didPanRef.current = false;
      isMousePanning = true;
      mouseStartClient = { x: e.clientX, y: e.clientY };
      mousePanStart = { ...panRef.current };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isMousePanning) return;
      const dx = e.clientX - mouseStartClient.x;
      const dy = e.clientY - mouseStartClient.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        didPanRef.current = true;
      }
      const rawX = mousePanStart.x + dx;
      const rawY = mousePanStart.y + dy;
      setPan(clampPan(rawX, rawY, zoomScaleRef.current));
    };

    const onMouseUp = () => {
      isMousePanning = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.85;
        updateZoomAtPoint(zoomScaleRef.current * factor, e.clientX, e.clientY);
      } else {
        e.preventDefault();
        const rawX = panRef.current.x - e.deltaX;
        const rawY = panRef.current.y - e.deltaY;
        setPan(clampPan(rawX, rawY, zoomScaleRef.current));
      }
    };

    container.addEventListener("touchstart", onTouchStart, { passive: false });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchcancel", onTouchEnd);
    container.addEventListener("wheel", onWheel, { passive: false });

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
      container.removeEventListener("wheel", onWheel);

      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [baseDimensions, clampPan, handleResetZoom, updateZoomAtPoint]);

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

    if (!imageContainerRef.current) return;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

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

  // If we are actively editing a draft region for an unallocated answer or multi-page continuation on this page, include it in pageRegions
  if (editingRegionId && (editingRegionId.startsWith("draft-new-") || editingRegionId.startsWith("draft-add-"))) {
    const ansId = editingRegionId.startsWith("draft-add-")
      ? editingRegionId.split("-")[2]
      : editingRegionId.replace("draft-new-", "");
    const match = answers.find((a) => a.id === ansId);
    if (match && !pageRegions.some((pr) => pr.region.id === editingRegionId)) {
      const draft = draftCoords[editingRegionId] || {
        x: 0.15,
        y: 0.20,
        width: 0.70,
        height: 0.15,
        page_number: currentPage,
      };
      pageRegions.push({
        region: {
          id: editingRegionId,
          page_number: currentPage,
          x: draft.x,
          y: draft.y,
          width: draft.width,
          height: draft.height,
        },
        answer: match,
      });
    }
  }


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

        {/* "+ Add Box on Sheet" Quick Dropdown for Multi-Page Continuation */}
        {!readOnly && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAddBoxDropdown((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-hairline hover:border-primary text-xs font-semibold text-ink hover:text-primary transition-all shadow-2xs cursor-pointer"
              title={`Add bounding box for any question on Page ${currentPage}`}
            >
              <Plus className="h-3.5 w-3.5 text-primary" />
              <span className="hidden sm:inline">+ Add Box to Page {currentPage}</span>
              <span className="sm:hidden">+ Box</span>
            </button>
            {showAddBoxDropdown && (
              <div className="absolute top-full left-0 mt-1 w-72 max-h-64 overflow-y-auto rounded-lg bg-surface border border-hairline shadow-lg z-50 p-1.5 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted px-2 py-1 border-b border-hairline flex items-center justify-between">
                  <span>Add Box on Page {currentPage}</span>
                  <button
                    type="button"
                    onClick={() => setShowAddBoxDropdown(false)}
                    className="text-ink-muted hover:text-ink cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="text-[11px] text-ink-muted px-2 py-0.5">
                  Select question to link continuation:
                </div>
                {answers.map((ans) => {
                  const hasRegionHere = (ans.regions || []).some((r) => r.page_number === currentPage);
                  const regionCount = (ans.regions || []).length;
                  return (
                    <button
                      key={ans.id}
                      type="button"
                      onClick={() => {
                        setShowAddBoxDropdown(false);
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
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span> Incorrect
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-600"></span> Review
          </span>
        </div>

        {/* Annotations Visibility Toggle Switch */}
        <button
          type="button"
          onClick={() => setShowAnnotations((prev) => !prev)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer shadow-2xs ${
            showAnnotations
              ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
              : "bg-surface border-hairline text-ink-muted hover:text-ink hover:bg-canvas-soft"
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

      {/* Canvas Viewport - Paper-on-Desk Soothing Neutral Background with Touch/Mouse Pan & Zoom */}
      <div
        ref={viewportRef}
        className="relative flex-1 overflow-hidden bg-[#f6f6f4] select-none cursor-grab active:cursor-grabbing touch-none overscroll-none"
      >
        <div
          ref={imageContainerRef}
          className="absolute top-0 left-0 shadow-md rounded-sm border border-hairline/80 bg-white"
          style={{
            width: `${baseDimensions.width}px`,
            height: `${baseDimensions.height}px`,
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${zoomScale})`,
            transformOrigin: "top left",
            willChange: "transform",
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
              {isPageImageLoading && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-white/95 rounded-sm shadow-2xs">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-xs animate-pulse">
                    <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin text-primary" />
                  </div>
                  <div className="space-y-1 max-w-xs">
                    <h3 className="text-xs sm:text-sm font-bold text-ink">
                      Fetching Examination Sheet...
                    </h3>
                    <p className="text-[11px] text-ink-muted leading-relaxed">
                      Rendering Page {currentPage} of {Math.max(1, pageCount)}.
                    </p>
                  </div>
                </div>
              )}

              {!pdfError ? (
                <canvas
                  ref={canvasRef}
                  className={`w-full h-full block rounded-sm select-none pointer-events-none transition-opacity duration-150 ${
                    isPageImageLoading ? "opacity-0" : "opacity-100"
                  }`}
                />
              ) : (
                <img
                  ref={imgRef}
                  src={pageImageUrl}
                  alt={`Student Page ${currentPage}`}
                  className={`w-full h-full block rounded-sm select-none pointer-events-none transition-opacity duration-150 ${
                    isPageImageLoading ? "opacity-0" : "opacity-100"
                  }`}
                  loading="eager"
                  decoding="async"
                  onLoad={() => {
                    if (imgRef.current && imgRef.current.naturalWidth > 0 && imgRef.current.naturalHeight > 0) {
                      setPageAspect(imgRef.current.naturalWidth / imgRef.current.naturalHeight);
                    }
                    loadedPagesRef.current.add(`${submissionId}_p_${currentPage}`);
                    setIsPageImageLoading(false);
                  }}
                  onError={() => {
                    setIsPageImageLoading(false);
                    setImageError(true);
                  }}
                />
              )}
            </>
          )}

          {/* Only render teacher score stamp and annotation overlays once the image has completely loaded */}
          {!isPageImageLoading && !imageError && (
            <>

          {/* Page 1 Teacher Score Stamp (Clean Red Ink Stamp Aesthetic) */}
          {showAnnotations && !hideScoreStamp && currentPage === 1 && totalMax > 0 && totalAwardedMarks !== undefined && totalAwardedMarks !== null && (
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
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors text-[11px] font-medium cursor-pointer ml-1"
                        title="Delete this bounding box region"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
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
