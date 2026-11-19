"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  const [containerDims, setContainerDims] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [pageAspect, setPageAspect] = useState<number>(0.707); // Default A4 ratio
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
    return Math.min(1.2, 1 / zoomScale);
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
  const touchStartXRef = useRef<number | null>(null);
  const isPointerDownRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // Page change reset
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoomScale(1.0);
    setTouchOffset(0);
    setIsSwiping(false);
  }, [currentPage]);

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
  }, []);

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

  // Drag session ref
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

  // Window drag move and up listeners
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

    // Also include uncommitted draft continuation boxes
    Object.entries(draftCoords).forEach(([dId, dBox]) => {
      if (dBox.page_number === currentPage && dId.startsWith("draft-add-")) {
        const ansMatch = answers.find((a) => dId.includes(a.id));
        if (ansMatch && !list.some((item) => (item.region.id || item.answer.id) === dId)) {
          list.push({
            region: {
              id: dId,
              x: dBox.x,
              y: dBox.y,
              width: dBox.width,
              height: dBox.height,
              page_number: currentPage,
            },
            answer: ansMatch,
          });
        }
      }
    });

    return list;
  }, [answers, currentPage, draftCoords]);

  // Overall Score stamp math
  const totalScore = totalAwardedMarks ?? 0;
  const totalMax = maxMarks ?? 0;
  const scorePct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  return (
    <div className="flex h-full flex-col bg-surface select-none">
      {/* 1. Microcomponent: Top Controls Toolbar */}
      <ViewerToolbar
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
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

            return (
              <div
                key={p}
                className="flex items-center justify-center h-full px-2 sm:px-4"
                style={{ width: `${100 / totalPages}%` }}
              >
                {isAdjacent ? (
                  <div
                    ref={isCurrent ? activeSheetRef : undefined}
                    className="relative bg-white shadow-xl rounded-lg sm:rounded-xl overflow-hidden transition-transform ease-out"
                    style={{
                      height: "100%",
                      maxHeight: "100%",
                      maxWidth: "100%",
                      aspectRatio: `${pageAspect}`,
                      transform: isCurrent
                        ? `translate(${pan.x}px, ${pan.y}px) scale(${zoomScale})`
                        : undefined,
                      transformOrigin: "center center",
                    }}
                  >
                    {/* Client-Side Canvas Vector Renderer */}
                    <PdfPageView
                      pdfUrl={pdfUrl || api.getSubmissionPdfUrl(submissionId)}
                      cacheKey={`submission_${submissionId}`}
                      pageNumber={p}
                      targetWidth={1400}
                      onAspectCalculated={(aspect) => {
                        if (aspect > 0) setPageAspect(aspect);
                      }}
                    />

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
                      pageRegions.map(({ region, answer }, idx) => {
                        const regId = region.id || answer.id;
                        const isSelected = selectedAnswerId === answer.id;
                        const isHovered = hoveredAnswerId === answer.id;
                        const isEditing =
                          editingRegionId === regId ||
                          (Boolean(propEditingAnswerId) && propEditingAnswerId === answer.id);

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
                      })}
                  </div>
                ) : (
                  <div
                    aria-hidden="true"
                    className="bg-white/70 rounded-lg sm:rounded-xl border border-hairline/60"
                    style={{
                      height: "100%",
                      maxHeight: "100%",
                      maxWidth: "100%",
                      aspectRatio: `${pageAspect}`,
                      width: "auto",
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
