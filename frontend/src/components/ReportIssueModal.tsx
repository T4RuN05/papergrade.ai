"use client";

import React, { useState, useEffect, useRef } from "react";
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
import { ModalCard, ButtonPrimary, ButtonUtility, BadgePill } from "./ui";
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

export function ReportIssueModal({ isOpen, onClose, userRole }: ReportIssueModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"submit" | "history">("submit");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("PDF_UPLOAD");
  const [description, setDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // My past reports state
  const [myReports, setMyReports] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await api.getMyTechnicalReports();
      setMyReports(res.reports || []);
    } catch {
      // Ignore background error
    } finally {
      setLoadingHistory(false);
    }
  };

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
      <div className="space-y-4 text-xs">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-canvas-soft border border-hairline">
          <button
            type="button"
            onClick={() => setActiveTab("submit")}
            className={`flex-1 py-1.5 px-3 rounded-md font-semibold transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
              activeTab === "submit"
                ? "bg-surface text-ink shadow-2xs border border-hairline/80"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-primary" />
            <span>Report an Issue</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-1.5 px-3 rounded-md font-semibold transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
              activeTab === "history"
                ? "bg-surface text-ink shadow-2xs border border-hairline/80"
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

        {/* TAB 1: SUBMIT NEW REPORT */}
        {activeTab === "submit" && (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Category & Subject */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="font-semibold text-ink text-[11px] block">
                  Issue Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                >
                  {ISSUE_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-ink text-[11px] flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-primary" />
                  <span>Attach Screenshots</span>
                  <span className="text-ink-muted font-normal text-[10px]">
                    (Optional • Max 3 images • Max 500KB each)
                  </span>
                </label>
                <span className="text-[10px] text-ink-muted font-medium">
                  {selectedFiles.length} / {MAX_SCREENSHOTS}
                </span>
              </div>

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
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
              <ButtonUtility type="button" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </ButtonUtility>
              <ButtonPrimary
                type="submit"
                isLoading={isSubmitting}
                disabled={!subject.trim() || !description.trim() || isOverLimit}
                className="gap-1.5"
              >
                <Send className="h-3 w-3" />
                <span>Submit Technical Report</span>
              </ButtonPrimary>
            </div>
          </form>
        )}

        {/* TAB 2: MY PAST REPORTS */}
        {activeTab === "history" && (
          <div className="space-y-3">
            {loadingHistory ? (
              <div className="py-8 text-center text-ink-muted flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Loading your reports...</span>
              </div>
            ) : myReports.length === 0 ? (
              <div className="py-8 text-center text-ink-muted space-y-1">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto opacity-70" />
                <div className="font-semibold text-ink text-xs">No issue reports submitted</div>
                <p className="text-[11px] text-ink-muted">
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
                          <ImageIcon className="h-3 w-3 text-primary" />
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

            <div className="flex justify-end pt-2 border-t border-hairline">
              <ButtonUtility onClick={onClose}>Close</ButtonUtility>
            </div>
          </div>
        )}
      </div>
    </ModalCard>
  );
}
