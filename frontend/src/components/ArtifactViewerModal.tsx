"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  const [loadingMeta, setLoadingMeta] = useState<boolean>(true);
  const [pageImgLoading, setPageImgLoading] = useState<boolean>(true);
  const [hasDoc, setHasDoc] = useState<boolean>(true);
  const [isPurged, setIsPurged] = useState<boolean>(isExamDocumentPurged);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

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

  return (
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs ${
        isExiting ? "animate-modal-backdrop-out" : "animate-modal-backdrop-in"
      }`}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div className="fixed inset-0" onClick={handleRequestClose} aria-hidden="true" />

      {/* Main Container */}
      <div className={`relative w-full max-w-5xl h-[92vh] sm:h-[90vh] flex flex-col bg-surface rounded-xl sm:rounded-2xl shadow-notion-modal border border-hairline z-10 overflow-hidden ${
        isExiting ? "animate-modal-content-out" : "animate-modal-content-in"
      }`}>
        {/* Top Header Bar */}
        <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-hairline bg-surface shrink-0">
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
              className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer border border-hairline"
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
              className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer border border-hairline"
              title="Next Page (Right Arrow)"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Center: Zoom Controls */}
          {hasDoc && !isPurged && !loadingMeta && (
            <div className="flex items-center gap-1 bg-surface border border-hairline rounded-lg p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(1))))}
                className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="px-1 text-[11px] font-mono text-ink-muted min-w-[38px] text-center select-none">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.2).toFixed(1))))}
                className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              {zoom !== 1.0 && (
                <button
                  type="button"
                  onClick={() => setZoom(1.0)}
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
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:text-ink bg-surface border border-hairline rounded-lg hover:bg-canvas-soft transition-colors shadow-2xs cursor-pointer"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Open in Tab</span>
                </a>
                <a
                  href={pdfUrl}
                  download={`${activeArtifact}_${examId}.pdf`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 rounded-lg transition-colors shadow-2xs cursor-pointer"
                >
                  <Download className="h-3 w-3" />
                  <span>Download PDF</span>
                </a>
              </>
            )}
          </div>
        </div>

        {/* Document Rendering Body */}
        <div className="flex-1 w-full overflow-auto bg-canvas-soft p-3 sm:p-5 flex flex-col items-center justify-start relative select-none">
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
            <div className="w-full flex flex-col items-center justify-start transition-all duration-200">
              <div
                className="bg-white rounded-lg shadow-md border border-hairline overflow-hidden relative transition-transform duration-150 origin-top"
                style={{
                  width: `${Math.round(zoom * 100)}%`,
                  maxWidth: zoom <= 1 ? "100%" : "none",
                }}
              >
                {pageImgLoading && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center z-10 min-h-[300px]">
                    <Loader2 className="h-7 w-7 text-primary animate-spin" />
                  </div>
                )}
                <img
                  key={`${examId}_${activeArtifact}_${page}`}
                  src={api.getExamArtifactPageUrl(examId, activeArtifact, page)}
                  alt={`${activeArtifact} page ${page}`}
                  className="w-full h-auto block select-none pointer-events-auto"
                  onLoad={() => setPageImgLoading(false)}
                  onError={() => {
                    setPageImgLoading(false);
                    setErrorNotice("Failed to load page image. Please use 'Open in Tab' or 'Download PDF'.");
                  }}
                />
              </div>

              {/* Floating Mobile Page Pill */}
              {totalPages > 1 && (
                <div className="sticky bottom-3 mt-4 flex sm:hidden items-center gap-3 bg-surface/90 backdrop-blur-md border border-hairline px-3 py-1.5 rounded-full shadow-lg z-20 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      if (page > 1) {
                        setPageImgLoading(true);
                        setPage((p) => p - 1);
                      }
                    }}
                    disabled={page <= 1}
                    className="p-1 rounded text-ink-muted hover:text-ink disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-semibold text-ink text-[11px] font-mono">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (page < totalPages) {
                        setPageImgLoading(true);
                        setPage((p) => p + 1);
                      }
                    }}
                    disabled={page >= totalPages}
                    className="p-1 rounded text-ink-muted hover:text-ink disabled:opacity-30 cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
