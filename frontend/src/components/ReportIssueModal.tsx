"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  AlertTriangle,
  Upload,
  X,
  CheckCircle2,
  Clock,
  RotateCcw,
  Image as ImageIcon,
  Send,
  Loader2,
  FileText,
  LifeBuoy,
} from "lucide-react";
import { api } from "@/lib/api";
import { ModalCard, ButtonPrimary, ButtonUtility, BadgePill, AppleSelect } from "./ui";
import { useToast } from "@/lib/ToastContext";

interface ReportIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole?: string;
}

const MAX_SCREENSHOTS = 3;
const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500 KB
const MAX_DESC_CHARS = 1000;

const ISSUE_CATEGORIES = [
  { value: "PDF_UPLOAD", label: "PDF Upload / Submission Problem" },
  { value: "MARKS_EVALUATION", label: "Marks & Evaluation Display Issue" },
  { value: "AUTH_LOGIN", label: "Login & Authentication Problem" },
  { value: "UI_BUG", label: "Page Visual Glitch / Mobile Layout" },
  { value: "OTHER", label: "Other Technical Issue" },
];

function HistorySkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="p-3.5 rounded-lg border border-hairline bg-surface space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1.5 flex-1">
              <div className="h-3.5 w-44 bg-ink-muted/20 rounded" />
              <div className="h-2.5 w-28 bg-ink-muted/10 rounded" />
            </div>
            <div className="h-5 w-16 rounded-full bg-ink-muted/15" />
          </div>
          <div className="h-14 rounded bg-canvas-soft/80 border border-hairline/60" />
        </div>
      ))}
    </div>
  );
}

export function ReportIssueModal({ isOpen, onClose, userRole }: ReportIssueModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"submit" | "history">("submit");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("PDF_UPLOAD");
  const [description, setDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const filePreviewsRef = useRef<string[]>([]);

  useEffect(() => {
    filePreviewsRef.current = filePreviews;
  }, [filePreviews]);

  useEffect(() => {
    return () => {
      filePreviewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // My past reports state
  const [myReports, setMyReports] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTabSwitch = useCallback((newTab: "submit" | "history") => {
    if (newTab === activeTab) return;
    setIsTransitioning(true);
    setActiveTab(newTab);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => {
      setIsTransitioning(false);
    }, 280);
  }, [activeTab]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  // Mobile horizontal swipe gesture tracking
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchAxis = useRef<"horizontal" | "vertical" | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const target = e.target as HTMLElement;
    // Don't intercept swipe when user is typing, interacting with form inputs or buttons
    if (target.closest("input, textarea, select, button, label, .no-swipe")) {
      touchStartX.current = null;
      touchStartY.current = null;
      touchAxis.current = null;
      return;
    }
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchAxis.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = currentX - touchStartX.current;
    const dy = currentY - (touchStartY.current || currentY);

    if (touchAxis.current === null) {
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) {
        touchAxis.current = "vertical";
        return;
      }
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        touchAxis.current = "horizontal";
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchAxis.current === "horizontal" && touchStartX.current !== null) {
      const endX = e.changedTouches[0].clientX;
      const dx = endX - touchStartX.current;
      if (dx < -45 && activeTab === "submit") {
        handleTabSwitch("history");
      } else if (dx > 45 && activeTab === "history") {
        handleTabSwitch("submit");
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
    touchAxis.current = null;
  };

  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await api.getMyTechnicalReports();
      setMyReports(res.reports || []);
    } catch {
      // Ignore background error
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActiveTab("submit");
      setSubject("");
      setDescription("");
      setSelectedFiles([]);
      setFilePreviews((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return [];
      });
      loadHistory();
    } else {
      setFilePreviews((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return prev.length > 0 ? [] : prev;
      });
    }
  }, [isOpen, loadHistory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remainingSlots = MAX_SCREENSHOTS - selectedFiles.length;
    if (remainingSlots <= 0) {
      toast.warning(`Maximum ${MAX_SCREENSHOTS} screenshots allowed.`, {
        title: "Screenshot Limit Reached",
      });
      return;
    }

    const validNewFiles: File[] = [];
    const validNewPreviews: string[] = [];

    for (const file of files) {
      if (validNewFiles.length >= remainingSlots) {
        toast.warning(`Only ${MAX_SCREENSHOTS} screenshots can be attached per report.`, {
          title: "Limit Exceeded",
        });
        break;
      }

      if (!file.type.startsWith("image/")) {
        toast.error(`"${file.name}" is not an image. Only PNG, JPEG, and WebP are supported.`, {
          title: "Unsupported Format",
        });
        continue;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        const sizeKb = Math.round(file.size / 1024);
        toast.error(`"${file.name}" is ${sizeKb} KB. Maximum allowed size is 500 KB per image.`, {
          title: "File Too Large",
        });
        continue;
      }

      validNewFiles.push(file);
      validNewPreviews.push(URL.createObjectURL(file));
    }

    if (validNewFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...validNewFiles]);
      setFilePreviews((prev) => [...prev, ...validNewPreviews]);
    }

    // Reset file input so user can choose same file again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setFilePreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanSubject = subject.trim();
    const cleanDesc = description.trim();

    if (!cleanSubject) {
      toast.warning("Please provide a short summary of the issue.", { title: "Subject Required" });
      return;
    }

    if (!cleanDesc) {
      toast.warning("Please describe what went wrong in detail.", { title: "Description Required" });
      return;
    }

    if (cleanDesc.length > MAX_DESC_CHARS) {
      toast.error(`Description exceeds 1000 characters (${cleanDesc.length} characters).`, {
        title: "Text Too Long",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const formData = new FormData();
      formData.append("subject", cleanSubject);
      formData.append("category", category);
      formData.append("description", cleanDesc);

      selectedFiles.forEach((file) => {
        formData.append("screenshots", file);
      });

      const res = await api.submitTechnicalReport(formData);
      toast.success(res.message || "Report sent! Root administrators have been alerted.", {
        title: "Report Submitted",
        duration: 5000,
      });

      // Reset form
      setSubject("");
      setDescription("");
      setSelectedFiles([]);
      setFilePreviews([]);

      // Reload reports and switch tab to history
      await loadHistory();
      setActiveTab("history");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit technical report.", {
        title: "Submission Error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const charsRemaining = MAX_DESC_CHARS - description.length;
  const isNearLimit = charsRemaining <= 100;
  const isOverLimit = charsRemaining < 0;

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={onClose}
      title="Technical Support & Issue Report"
      maxWidth="max-w-xl"
    >
      <div className="flex flex-col w-full max-w-full text-xs">
        {/* Navigation Tabs with Smooth Animated Gliding Pill */}
        <div className="relative flex items-center p-1 rounded-lg bg-canvas-soft border border-hairline shrink-0 mb-3">
          {/* Animated Sliding Pill */}
          <div
            className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md bg-surface shadow-2xs border border-hairline/80 transition-transform duration-250 ease-out pointer-events-none ${
              activeTab === "submit" ? "translate-x-0" : "translate-x-[calc(100%+0px)]"
            }`}
          />

          <button
            type="button"
            onClick={() => handleTabSwitch("submit")}
            className={`relative z-10 flex-1 py-1.5 px-3 rounded-md font-semibold transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 ${
              activeTab === "submit"
                ? "text-ink font-bold"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-primary" />
            <span>Report an Issue</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabSwitch("history")}
            className={`relative z-10 flex-1 py-1.5 px-3 rounded-md font-semibold transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 ${
              activeTab === "history"
                ? "text-ink font-bold"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <Clock className="h-3.5 w-3.5 text-ink-muted" />
            <span>My Reports</span>
            {myReports.length > 0 && (
              <span className="ml-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-primary/10 text-primary">
                {myReports.length}
              </span>
            )}
          </button>
        </div>

        {/* 2-Page Horizontal Sliding Track with Native Swipe Gesture */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="w-full overflow-hidden"
        >
          <div
            className="flex items-start w-[200%] transition-transform duration-280 ease-out will-change-transform"
            style={{
              transform:
                activeTab === "submit"
                  ? "translate3d(0%, 0, 0)"
                  : "translate3d(-50%, 0, 0)",
            }}
          >
            {/* TAB 1: SUBMIT NEW REPORT */}
            <div
              className={`w-1/2 shrink-0 min-w-0 px-1 pr-1.5 ${
                activeTab === "submit"
                  ? "block opacity-100"
                  : isTransitioning
                  ? "block opacity-100"
                  : "h-0 max-h-0 overflow-hidden opacity-0 pointer-events-none"
              }`}
            >
              <form onSubmit={handleSubmit} className="space-y-3.5">
                {/* Category & Subject */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="font-semibold text-ink text-[11px] block">
                      Issue Category <span className="text-rose-500">*</span>
                    </label>
                    <AppleSelect
                      size="sm"
                      value={category}
                      onChange={(val) => setCategory(val)}
                      options={ISSUE_CATEGORIES.map((cat) => ({
                        value: cat.value,
                        label: cat.label,
                      }))}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-ink text-[11px] block">
                      Subject / Summary <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. Blank page on Physics Q2 upload"
                      maxLength={120}
                      className="w-full px-2.5 py-1.5 rounded-md border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                      required
                    />
                  </div>
                </div>

                {/* Description Textarea with Live 1000 chars counter */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-ink text-[11px]">
                      Detailed Description <span className="text-rose-500">*</span>
                    </label>
                    <span
                      className={`text-[10px] font-mono font-semibold ${
                        isOverLimit
                          ? "text-rose-600 font-bold"
                          : isNearLimit
                          ? "text-amber-600"
                          : "text-ink-muted"
                      }`}
                    >
                      {description.length} / {MAX_DESC_CHARS}
                    </span>
                  </div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Explain what steps caused the problem, what you expected, and any error message you saw..."
                    maxLength={MAX_DESC_CHARS}
                    rows={4}
                    className="w-full p-2.5 rounded-md border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed resize-none"
                    required
                  />
                </div>

                {/* Screenshots Uploader (Max 3, Max 500KB each) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <ImageIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                      <label className="font-semibold text-ink text-[11px] whitespace-nowrap">
                        Attach Screenshots
                      </label>
                      <span className="text-[10.5px] text-ink-muted font-normal hidden sm:inline">
                        (Optional • Max 3)
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-ink-muted font-medium shrink-0">
                      {selectedFiles.length} / {MAX_SCREENSHOTS}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-ink-muted sm:hidden">
                    Optional: Upload up to 3 images (Max 500KB each)
                  </p>

                  {/* Thumbnail Previews */}
                  {filePreviews.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 p-2 rounded-lg bg-canvas-soft border border-hairline">
                      {filePreviews.map((previewUrl, idx) => (
                        <div
                          key={idx}
                          className="relative rounded-md overflow-hidden border border-hairline aspect-video bg-surface group"
                        >
                          <img
                            src={previewUrl}
                            alt={`Attachment preview ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx)}
                            className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center transition-colors cursor-pointer shadow-xs"
                            title="Remove screenshot"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <span className="absolute bottom-1 left-1 px-1 rounded text-[9px] font-mono bg-black/60 text-white">
                            {Math.round(selectedFiles[idx]?.size / 1024)} KB
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload Drop/Button */}
                  {selectedFiles.length < MAX_SCREENSHOTS && (
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        onChange={handleFileChange}
                        className="hidden"
                        id="report-screenshot-input"
                      />
                      <label
                        htmlFor="report-screenshot-input"
                        className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-hairline bg-surface hover:bg-canvas-soft hover:border-primary/50 transition-all cursor-pointer text-ink-secondary hover:text-ink"
                      >
                        <Upload className="h-4 w-4 text-primary" />
                        <span className="font-medium text-xs">
                          Click to attach screenshot ({MAX_SCREENSHOTS - selectedFiles.length} remaining)
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-hairline">
                  <ButtonUtility
                    size="md"
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="h-10 px-5 min-w-[100px] text-xs sm:text-sm font-semibold justify-center rounded-lg"
                  >
                    Cancel
                  </ButtonUtility>
                  <ButtonPrimary
                    size="md"
                    type="submit"
                    isLoading={isSubmitting}
                    disabled={!subject.trim() || !description.trim() || isOverLimit}
                    className="h-10 px-5 gap-2 text-xs sm:text-sm font-semibold justify-center rounded-lg"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Submit Technical Report</span>
                  </ButtonPrimary>
                </div>
              </form>
            </div>

            {/* TAB 2: MY PAST REPORTS */}
            <div
              className={`w-1/2 shrink-0 min-w-0 px-1 pr-1.5 ${
                activeTab === "history"
                  ? "block opacity-100"
                  : isTransitioning
                  ? "block opacity-100"
                  : "h-0 max-h-0 overflow-hidden opacity-0 pointer-events-none"
              }`}
            >
              <div className="space-y-3">
                {loadingHistory ? (
                  <HistorySkeleton />
                ) : myReports.length === 0 ? (
                  <div className="py-10 text-center text-ink-muted space-y-2">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto opacity-70" />
                    <div className="font-semibold text-ink text-xs">No issue reports submitted</div>
                    <p className="text-[11px] text-ink-muted max-w-xs mx-auto">
                      Everything looks clear! If you ever face an issue, use the &ldquo;Report an Issue&rdquo; tab.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
                    {myReports.map((rep) => {
                      const isResolved = rep.status === "RESOLVED";
                      const isInProgress = rep.status === "IN_PROGRESS";
                      const dateStr = rep.created_at
                        ? new Date(rep.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Recently";

                      return (
                        <div
                          key={rep.id}
                          className="p-3 rounded-lg border border-hairline bg-surface space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-bold text-ink text-xs leading-snug">
                                {rep.subject}
                              </div>
                              <div className="text-[10px] text-ink-muted mt-0.5">
                                Category:{" "}
                                <span className="font-medium text-ink-secondary">
                                  {rep.category?.replace(/_/g, " ")}
                                </span>{" "}
                                • {dateStr}
                              </div>
                            </div>

                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                                isResolved
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : isInProgress
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {isResolved && <CheckCircle2 className="h-2.5 w-2.5 mr-1" />}
                              {isInProgress && <RotateCcw className="h-2.5 w-2.5 mr-1 animate-spin" />}
                              {rep.status?.replace("_", " ")}
                            </span>
                          </div>

                          <p className="text-[11px] text-ink-secondary leading-relaxed bg-canvas-soft/60 p-2 rounded border border-hairline/60">
                            {rep.description}
                          </p>

                          {/* Attached Screenshots indicator */}
                          {rep.screenshots && rep.screenshots.length > 0 && (
                            <div className="flex items-center gap-1.5 text-[10.5px] text-ink-muted">
                              <ImageIcon className="h-3.5 w-3.5 text-primary" />
                              <span>{rep.screenshots.length} screenshot(s) attached</span>
                            </div>
                          )}

                          {/* Admin Resolution Notes */}
                          {rep.admin_notes && (
                            <div className="p-2 rounded bg-emerald-50/80 border border-emerald-200 text-emerald-950 text-[11px] space-y-0.5">
                              <span className="font-bold text-emerald-900 block flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                Admin Resolution Response:
                              </span>
                              <p className="leading-relaxed">{rep.admin_notes}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-3 mt-3 border-t border-hairline shrink-0">
                <ButtonUtility onClick={onClose}>Close</ButtonUtility>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalCard>
  );
}
