"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Clock,
  Camera,
  Upload,
  CheckCircle2,
  FileCheck2,
  Trash2,
  FileText,
  ImageIcon,
  ArrowUp,
  ArrowDown,
  Plus,
  Cpu,
  Eye,
  RotateCcw,
  AlertCircle,
  Info,
  GripVertical,
} from "lucide-react";
import Sortable from "sortablejs";
import { FeatureCard, BadgePill, ButtonPrimary } from "@/components/ui";
import { api } from "@/lib/api";
import { useToast } from "@/lib/ToastContext";
import { useWindowCountdown } from "@/hooks/useWindowCountdown";
import type { AssemblyProgress } from "@/lib/pdfAssembler";

export interface ActiveExamSubmissionCardProps {
  activeExam: {
    id: string;
    title: string;
    subject?: string;
  };
  windowStatus: {
    is_active?: boolean;
    is_in_grace?: boolean;
    seconds_remaining?: number;
    deadline_at?: string;
    grace_deadline_at?: string;
    closed_at?: string;
  } | null;
  activeExamSubmission: any | null;
  user: any;
  currentTick: number;
  onUploadSuccess: () => Promise<void>;
}

export function ActiveExamSubmissionCard({
  activeExam,
  windowStatus,
  activeExamSubmission,
  user,
  currentTick,
  onUploadSuccess,
}: ActiveExamSubmissionCardProps) {
  const { toast } = useToast();
  const [isReplacingUpload, setIsReplacingUpload] = useState(false);
  const countdown = useWindowCountdown(windowStatus as any);

  // Multi-page Scanning & Upload state
  const [scannedPages, setScannedPages] = useState<
    Array<{
      id: string;
      file: File;
      name: string;
      size: number;
      previewUrl?: string;
      isPdf: boolean;
    }>
  >([]);
  const [uploading, setUploading] = useState(false);
  const [assemblyProgress, setAssemblyProgress] = useState<AssemblyProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const sortableContainerRef = useRef<HTMLDivElement | null>(null);
  const sortableInstanceRef = useRef<Sortable | null>(null);
  const isSubmittingRef = useRef<boolean>(false);

  // Setup mobile touch drag-and-drop using SortableJS
  useEffect(() => {
    if (!sortableContainerRef.current) return;

    if (sortableInstanceRef.current) {
      sortableInstanceRef.current.destroy();
      sortableInstanceRef.current = null;
    }

    sortableInstanceRef.current = new Sortable(sortableContainerRef.current, {
      animation: 200,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
      delay: 150, // 150ms touch-and-hold before dragging on mobile
      delayOnTouchOnly: true, // Instant dragging with mouse on desktop
      touchStartThreshold: 5, // 5px movement tolerance before drag activates (allows smooth natural scroll)
      filter: "button, a, input", // buttons can still be tapped without initiating drag
      preventOnFilter: false,
      draggable: ".sortable-page-card",
      ghostClass: "sortable-page-ghost",
      chosenClass: "sortable-page-chosen",
      dragClass: "sortable-page-drag",
      forceFallback: true, // Universal FLIP swapping across mobile browsers
      fallbackClass: "sortable-page-fallback",
      fallbackOnBody: true,
      swapThreshold: 1, // Full threshold eliminates threshold jitter & double-state oscillation
      invertSwap: false, // Prevents swap zone oscillation / flickering between two states
      onChoose: () => {
        if (typeof window !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate?.(35);
          } catch {
            // Ignore vibrate failures
          }
        }
      },
      onEnd: (evt) => {
        if (
          evt.oldIndex === undefined ||
          evt.newIndex === undefined ||
          evt.oldIndex === evt.newIndex
        ) {
          return;
        }

        // Revert Sortable DOM modification so React reconciliation takes control of ordering
        const parent = evt.from;
        const item = evt.item;
        item.remove();
        if (evt.oldIndex < parent.children.length) {
          parent.insertBefore(item, parent.children[evt.oldIndex]);
        } else {
          parent.appendChild(item);
        }

        setScannedPages((prev) => {
          const copy = [...prev];
          const [moved] = copy.splice(evt.oldIndex!, 1);
          copy.splice(evt.newIndex!, 0, moved);
          return copy;
        });
      },
    });

    return () => {
      if (sortableInstanceRef.current) {
        sortableInstanceRef.current.destroy();
        sortableInstanceRef.current = null;
      }
    };
  }, [scannedPages.length]);

  const cleanupPreviews = (items: typeof scannedPages) => {
    items.forEach((item) => {
      if (item.previewUrl && !item.isPdf) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
  };

  const handleAddFiles = (newFiles: FileList | File[]) => {
    if (uploading) return;
    setUploadError(null);
    setUploadSuccess(null);

    const addedList = Array.from(newFiles);
    if (addedList.length === 0) return;

    const hasPdf = addedList.some(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );

    if (hasPdf) {
      const pdfFile = addedList.find(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      )!;
      if (pdfFile.size > 7 * 1024 * 1024) {
        setUploadError("PDF file exceeds 7 MB limit.");
        toast.error("PDF exceeds 7 MB limit.");
        return;
      }
      cleanupPreviews(scannedPages);
      setScannedPages([
        {
          id: `pdf_${Date.now()}`,
          file: pdfFile,
          name: pdfFile.name,
          size: pdfFile.size,
          isPdf: true,
        },
      ]);
      return;
    }

    const currentIsPdf = scannedPages.length === 1 && scannedPages[0].isPdf;
    const baseItems = currentIsPdf ? [] : [...scannedPages];
    if (currentIsPdf) cleanupPreviews(scannedPages);

    const newItems: typeof scannedPages = [];
    for (const f of addedList) {
      if (baseItems.length + newItems.length >= 15) {
        toast.warning("Maximum 15 pages allowed per answer sheet.");
        break;
      }
      const previewUrl = URL.createObjectURL(f);
      newItems.push({
        id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file: f,
        name: f.name,
        size: f.size,
        previewUrl,
        isPdf: false,
      });
    }

    setScannedPages([...baseItems, ...newItems]);
  };

  const handleRemovePage = (index: number) => {
    if (uploading) return;
    setScannedPages((prev) => {
      const target = prev[index];
      if (target?.previewUrl && !target.isPdf) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleMovePage = (index: number, direction: "up" | "down") => {
    if (uploading) return;
    setScannedPages((prev) => {
      const targetIdx = direction === "up" ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  const handleClearAllPages = () => {
    if (uploading) return;
    cleanupPreviews(scannedPages);
    setScannedPages([]);
    setUploadError(null);
  };

  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getRemainingCardTime = () => {
    if (!windowStatus || windowStatus.is_active) return null;
    const closedIso =
      windowStatus.grace_deadline_at ||
      windowStatus.deadline_at ||
      windowStatus.closed_at;
    if (!closedIso) return null;
    const closedTime = new Date(closedIso).getTime();
    if (isNaN(closedTime)) return null;
    const elapsedMs = currentTick - closedTime;
    const remainingMs = 2 * 60 * 60 * 1000 - elapsedMs;
    if (remainingMs <= 0) return null;
    const mins = Math.ceil(remainingMs / 60000);
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}h ${m}m`;
    }
    return `${mins}m`;
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current || uploading || scannedPages.length === 0 || !activeExam) return;

    isSubmittingRef.current = true;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setAssemblyProgress(null);

    try {
      const roll = user?.roll_number || user?.student?.roll_number || "ROLL-101";
      const studentName = user?.full_name || "Enrolled Student";

      let finalPdfFile: File;

      if (scannedPages.length === 1 && scannedPages[0].isPdf) {
        finalPdfFile = scannedPages[0].file;
      } else {
        setAssemblyProgress({
          currentPage: 1,
          totalPages: scannedPages.length,
          percent: 5,
          stage: "optimizing",
          statusMessage: "Preparing pages for upload...",
        });

        const { assembleFilesToCanonicalPdf } = await import("@/lib/pdfAssembler");
        finalPdfFile = await assembleFilesToCanonicalPdf(
          scannedPages.map((p) => p.file),
          {
            outputFilename: `answersheet_${roll.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
            maxPageDimension: 1920,
            jpegQuality: 0.8,
            onProgress: (p) => setAssemblyProgress(p),
          }
        );
      }

      setAssemblyProgress({
        currentPage: scannedPages.length,
        totalPages: scannedPages.length,
        percent: 92,
        stage: "finalizing",
        statusMessage: "Securing upload authorization...",
      });

      let result: any = null;
      try {
        const ticket = await api.requestPresignedUpload(activeExam.id, {
          roll_number: roll,
          student_name: studentName,
          student_id: user?.student_id || user?.student?.student_id || user?.id,
          batch_id: user?.batch_id || user?.student?.batch_id,
        });

        setAssemblyProgress({
          currentPage: scannedPages.length,
          totalPages: scannedPages.length,
          percent: 95,
          stage: "finalizing",
          statusMessage: "Uploading answer sheet directly to storage...",
        });

        if (ticket.is_direct_cloud && ticket.fields) {
          const cloudFormData = new FormData();
          Object.entries(ticket.fields).forEach(([k, v]) => {
            cloudFormData.append(k, String(v));
          });
          cloudFormData.append("file", finalPdfFile);

          const cloudRes = await fetch(ticket.upload_url, {
            method: "POST",
            body: cloudFormData,
          });

          if (!cloudRes.ok) {
            const cloudErr = await cloudRes.text().catch(() => "Cloud storage rejected upload");
            throw new Error(`Direct cloud upload failed: ${cloudErr}`);
          }
        } else {
          const putRes = await fetch(ticket.upload_url, {
            method: ticket.method || "PUT",
            headers: ticket.headers || { "Content-Type": "application/pdf" },
            body: finalPdfFile,
          });
          if (!putRes.ok) {
            throw new Error("Direct storage PUT upload failed.");
          }
        }

        setAssemblyProgress({
          currentPage: scannedPages.length,
          totalPages: scannedPages.length,
          percent: 99,
          stage: "finalizing",
          statusMessage: "Registering submission...",
        });

        let verifiedPageCount = scannedPages.length || 1;
        if (scannedPages.length === 1 && scannedPages[0].isPdf) {
          try {
            const { PDFDocument } = await import("pdf-lib");
            const pdfBytes = await scannedPages[0].file.arrayBuffer();
            const loadedDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
            verifiedPageCount = loadedDoc.getPageCount();
          } catch {
            verifiedPageCount = 1;
          }
        }
        if (verifiedPageCount > 15) {
          throw new Error(`PDF exceeds maximum allowed page count of 15 pages (detected ${verifiedPageCount} pages).`);
        }

        result = await api.confirmPresignedUpload(activeExam.id, {
          roll_number: roll,
          student_name: studentName,
          student_id: user?.student_id || user?.student?.student_id || user?.id,
          batch_id: user?.batch_id || user?.student?.batch_id,
          storage_key: ticket.destination_key,
          upload_session_id: ticket.upload_session_id,
          page_count: verifiedPageCount,
          file_size_bytes: finalPdfFile.size,
        });
      } catch (directErr: any) {
        console.warn("Direct cloud upload failed or unsupported, falling back to server multipart:", directErr);
        const formData = new FormData();
        formData.append("file", finalPdfFile);
        formData.append("roll_number", roll);
        formData.append("student_name", studentName);
        if (user?.batch_id || user?.student?.batch_id) {
          formData.append("batch_id", user?.batch_id || user?.student?.batch_id || "");
        }
        result = await api.uploadSingleMultipart(activeExam.id, formData);
      }

      const successMsg = result.is_replacement
        ? "Answer sheet replaced successfully!"
        : "Answer sheet uploaded successfully!";
      setUploadSuccess(successMsg);
      toast.success(successMsg, { title: "Submission Received" });
      handleClearAllPages();
      setIsReplacingUpload(false);

      await onUploadSuccess();
    } catch (err: any) {
      const errorMsg = err.message || "Failed to upload answer sheet.";
      setUploadError(errorMsg);
      toast.error(errorMsg, { title: "Upload Failed" });
    } finally {
      isSubmittingRef.current = false;
      setUploading(false);
      setAssemblyProgress(null);
    }
  };

  return (
    <FeatureCard className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <BadgePill
              label={
                windowStatus?.is_active
                  ? windowStatus.is_in_grace
                    ? "Grace Period (2m)"
                    : "Submission Window Open"
                  : "Window Closed"
              }
              color={
                windowStatus?.is_active
                  ? windowStatus.is_in_grace
                    ? "orange"
                    : "green"
                  : "gray"
              }
            />
            <span className="text-xs text-ink-muted">• {activeExam.subject}</span>
            {!windowStatus?.is_active && getRemainingCardTime() && (
              <span className="text-[11px] text-ink-muted bg-canvas-soft border border-hairline px-2 py-0.5 rounded-full">
                Notice disappears in {getRemainingCardTime()}
              </span>
            )}
          </div>
          <h2 className="text-base font-bold text-ink">{activeExam.title}</h2>
        </div>

        {/* Countdown Clock */}
        {windowStatus?.is_active && (
          <div className="flex items-center gap-2 bg-canvas-soft border border-hairline px-3.5 py-2 rounded-md">
            <Clock className={`h-4 w-4 ${countdown.isInGrace ? "text-amber-500" : "text-primary"} animate-pulse`} />
            <div>
              <div className="text-[10px] uppercase font-semibold text-ink-muted leading-none">
                {countdown.isInGrace ? "Grace Period Remaining" : "Time Remaining"}
              </div>
              <div className="text-base font-mono font-bold text-ink leading-tight">
                {countdown.formatted}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submission Section */}
      <div className="mt-5 space-y-4">
        {activeExamSubmission && !isReplacingUpload ? (
          <div className="rounded-xl border border-hairline bg-surface p-4 sm:p-5 space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#edf5f0] text-[#1e613b] dark:bg-[#13231a] dark:text-[#86d4a4] border border-[#c8e2d2] dark:border-[#1d3d2a] flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-ink">Answer Sheet Submitted</h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#edf5f0] text-[#1e613b] border border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a]">
                      Recorded
                    </span>
                  </div>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Submitted on{" "}
                    {activeExamSubmission.created_at
                      ? new Date(activeExamSubmission.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Recently recorded"}
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] self-start sm:self-auto">
                <Clock className="h-3.5 w-3.5 text-[#7a4e18] dark:text-[#e5ad68]" />
                {activeExamSubmission.status === "EVALUATED" ||
                activeExamSubmission.publication_status === "PUBLISHED"
                  ? "Evaluation Complete"
                  : "Grading in Progress"}
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-canvas-soft border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-3 text-ink-muted">
                <span className="whitespace-nowrap font-mono text-[11px] bg-surface/80 dark:bg-[#1f1f1f] px-2 py-0.5 rounded-md border border-hairline/60">
                  Roll: <strong className="text-ink font-semibold">{activeExamSubmission.roll_number}</strong>
                </span>
                {activeExamSubmission.page_count && (
                  <>
                    <span className="text-ink-faint">•</span>
                    <span className="whitespace-nowrap">
                      Pages: <strong className="text-ink font-semibold">{activeExamSubmission.page_count}</strong>
                    </span>
                  </>
                )}
              </div>
              <span className="text-[11px] text-ink-muted">
                Answer sheet recorded securely. Detailed marks unlock upon publication.
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <Link
                href={`/student/submissions/${activeExamSubmission.id}`}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-hover shadow-xs active:scale-[0.98] transition-all text-center"
              >
                <Eye className="h-4 w-4" />
                <span>View Submitted Script →</span>
              </Link>

              {windowStatus?.is_active && (
                <button
                  type="button"
                  onClick={() => {
                    setIsReplacingUpload(true);
                    handleClearAllPages();
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-surface border border-hairline hover:bg-canvas-soft text-ink hover:text-primary text-xs font-semibold transition-colors cursor-pointer text-center"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-ink-muted" />
                  <span>Replace Answer Sheet</span>
                </button>
              )}
            </div>
          </div>
        ) : windowStatus?.is_active ? (
          <form onSubmit={handleUploadSubmit} className="space-y-4">
            {isReplacingUpload && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="h-4 w-4 text-[#7a4e18] dark:text-[#e5ad68] shrink-0" />
                  <span>Uploading a new file will replace your existing submitted answer sheet.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsReplacingUpload(false);
                    handleClearAllPages();
                  }}
                  className="text-xs font-semibold text-[#7a4e18] dark:text-[#e5ad68] underline hover:no-underline shrink-0 cursor-pointer"
                >
                  Keep Current
                </button>
              </div>
            )}

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleAddFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={filePickerRef}
              type="file"
              accept=".pdf,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleAddFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {scannedPages.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-hairline hover:border-primary/50 bg-canvas-soft/40 p-6 sm:p-8 text-center transition-all">
                <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
                  <Camera className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-bold text-ink">Capture or Upload Answer Sheet</h3>
                <p className="text-xs text-ink-muted max-w-sm mx-auto mt-1 mb-5">
                  Snap pages sequentially with your phone camera, or upload a single combined PDF (Max 15 pages, 7 MB).
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-hover shadow-xs active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Camera className="h-4 w-4" />
                    <span>Scan Page (Camera)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => filePickerRef.current?.click()}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-surface border border-hairline text-ink hover:bg-canvas-soft text-xs font-semibold shadow-xs active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Upload className="h-4 w-4 text-ink-muted" />
                    <span>Choose Photos / PDF</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-hairline bg-surface p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-hairline pb-3">
                  <div className="flex items-center gap-2">
                    <FileCheck2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-bold text-ink">
                      {scannedPages.length === 1 && scannedPages[0].isPdf
                        ? "Document Ready"
                        : `Scanned Pages (${scannedPages.length} of 15)`}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={handleClearAllPages}
                    className={`text-[11px] font-medium flex items-center gap-1 transition-colors ${
                      uploading
                        ? "text-red-400/40 opacity-40 cursor-not-allowed pointer-events-none"
                        : "text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                    }`}
                  >
                    <Trash2 className="h-3 w-3" />
                    Reset
                  </button>
                </div>

                {scannedPages.length === 1 && scannedPages[0].isPdf ? (
                  <div
                    className={`flex items-center justify-between p-3 rounded-lg border border-hairline transition-all ${
                      uploading
                        ? "bg-canvas-soft/30 opacity-60 pointer-events-none select-none"
                        : "bg-canvas-soft/60"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="h-10 w-10 rounded-md bg-red-100 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink truncate break-all max-w-[200px] sm:max-w-md">
                          {scannedPages[0].name}
                        </p>
                        <p className="text-[11px] text-ink-muted font-mono">
                          {(scannedPages[0].size / (1024 * 1024)).toFixed(2)} MB • Combined PDF
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => filePickerRef.current?.click()}
                      className={`text-xs font-medium shrink-0 transition-colors ${
                        uploading
                          ? "text-primary/40 opacity-40 cursor-not-allowed pointer-events-none"
                          : "text-primary hover:underline cursor-pointer"
                      }`}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {/* Mobile Touch & Hold Hint */}
                    {scannedPages.length > 1 && (
                      <div className="flex sm:hidden items-center justify-between text-[11px] text-ink-muted bg-canvas-soft/70 px-2.5 py-1.5 rounded-md border border-hairline select-none">
                        <span className="flex items-center gap-1.5 font-medium">
                          <GripVertical className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>Press & hold any card to drag & reorder pages</span>
                        </span>
                      </div>
                    )}

                    <div
                      ref={sortableContainerRef}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1"
                    >
                      {scannedPages.map((page, idx) => (
                        <div
                          key={page.id}
                          data-id={page.id}
                          className={`sortable-page-card flex items-center justify-between p-2.5 rounded-lg border border-hairline transition-colors duration-150 select-none cursor-grab active:cursor-grabbing ${
                            uploading
                              ? "bg-canvas-soft/30 opacity-60 pointer-events-none select-none"
                              : "bg-canvas-soft/40 hover:bg-canvas-soft/80"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            {/* Mobile drag grip handle */}
                            <div className="flex sm:hidden items-center justify-center text-ink-muted/50 touch-none py-1 -ml-0.5 shrink-0">
                              <GripVertical className="h-4 w-4" />
                            </div>

                            {page.previewUrl ? (
                              <img
                                src={page.previewUrl}
                                alt={`Page ${idx + 1}`}
                                className="h-12 w-9 rounded object-cover border border-hairline shrink-0 shadow-2xs pointer-events-none"
                              />
                            ) : (
                              <div className="h-12 w-9 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 pointer-events-none">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary pointer-events-none">
                                  Page {idx + 1}
                                </span>
                              </div>
                              <p className="text-[11px] font-mono text-ink-muted truncate break-all max-w-[120px] sm:max-w-[160px] mt-0.5 pointer-events-none">
                                {page.name}
                              </p>
                              <p className="text-[10px] text-ink-faint pointer-events-none">
                                {(page.size / 1024).toFixed(0)} KB
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* Arrow controls: hidden on mobile, visible on desktop */}
                            <button
                              type="button"
                              disabled={uploading || idx === 0}
                              onClick={() => handleMovePage(idx, "up")}
                              title="Move earlier"
                              className="hidden sm:inline-flex p-1 rounded text-ink-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={uploading || idx === scannedPages.length - 1}
                              onClick={() => handleMovePage(idx, "down")}
                              title="Move later"
                              className="hidden sm:inline-flex p-1 rounded text-ink-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={uploading}
                              onClick={() => handleRemovePage(idx)}
                              title="Delete page"
                              className={`p-1 rounded transition-colors ${
                                uploading
                                  ? "text-ink-muted/30 opacity-30 cursor-not-allowed pointer-events-none"
                                  : "text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                              }`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {scannedPages.length < 15 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => cameraInputRef.current?.click()}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-canvas-soft border border-hairline text-xs font-medium transition-colors ${
                            uploading
                              ? "opacity-40 cursor-not-allowed pointer-events-none text-ink-muted"
                              : "hover:border-primary text-ink hover:text-primary cursor-pointer"
                          }`}
                        >
                          <Camera className="h-3.5 w-3.5" />
                          <span>+ Scan Next Page (Camera)</span>
                        </button>
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => filePickerRef.current?.click()}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-canvas-soft border border-hairline text-xs font-medium transition-colors ${
                            uploading
                              ? "opacity-40 cursor-not-allowed pointer-events-none text-ink-muted"
                              : "hover:border-primary text-ink hover:text-primary cursor-pointer"
                          }`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add Photos</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {uploading && assemblyProgress && (
              <div className="rounded-xs bg-brand-50 border border-brand-200 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-brand-700 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 animate-spin text-brand-600" />
                    {assemblyProgress.statusMessage}
                  </span>
                  <span>{assemblyProgress.percent}%</span>
                </div>
                <div className="w-full bg-brand-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-brand-600 h-1.5 transition-all duration-200 ease-out rounded-full"
                    style={{ width: `${assemblyProgress.percent}%` }}
                  />
                </div>
                <p className="text-[11px] text-brand-600/80">
                  Preparing high-quality PDF for submission...
                </p>
              </div>
            )}

            {uploadError && (
              <div className="rounded-xs bg-red-50 border border-red-200 p-2.5 text-xs text-red-600">
                {uploadError}
              </div>
            )}
            {uploadSuccess && (
              <div className="rounded-xs bg-green-50 border border-green-200 p-2.5 text-xs text-green-700">
                {uploadSuccess}
              </div>
            )}

            {scannedPages.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="text-xs text-ink-muted">
                  <span className="font-semibold text-ink">
                    {(scannedPages.reduce((acc, p) => acc + p.size, 0) / (1024 * 1024)).toFixed(2)} MB
                  </span>{" "}
                  across {scannedPages.length} {scannedPages.length === 1 ? "page" : "pages"}
                </div>
                <ButtonPrimary type="submit" isLoading={uploading} className="w-full sm:w-auto">
                  {uploading
                    ? assemblyProgress && assemblyProgress.stage !== "ready"
                      ? "Preparing Document..."
                      : "Uploading PDF..."
                    : "Submit Answer Sheet"}
                </ButtonPrimary>
              </div>
            )}
          </form>
        ) : (
          <div className="flex items-center gap-2.5 text-xs text-ink-muted py-1">
            <Info className="h-4 w-4 text-ink-faint shrink-0" />
            <span>
              The upload window for <strong className="text-ink">{activeExam.title}</strong> is currently closed.
            </span>
          </div>
        )}
      </div>
    </FeatureCard>
  );
}
