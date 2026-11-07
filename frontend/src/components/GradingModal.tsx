"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Check,
  AlertCircle,
  HelpCircle,
  Edit3,
  History,
  Sparkles,
  Flag,
  Image as ImageIcon,
  FileText,
  Save,
  CheckCircle2,
  Move,
  Plus,
} from "lucide-react";
import { GradedAnswer, Submission, CriterionScore } from "@/lib/types";
import { api } from "@/lib/api";
import { BadgePill } from "./ui";
import { useToast } from "@/lib/ToastContext";

interface GradingModalProps {
  submission: Submission;
  answer: GradedAnswer | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updatedSub: Submission) => void;
  onAdjustOnCanvas?: (answer: GradedAnswer, pageNum?: number) => void;
  currentPage?: number;
}

export function GradingModal({
  submission,
  answer,
  isOpen,
  onClose,
  onUpdated,
  onAdjustOnCanvas,
  currentPage,
}: GradingModalProps) {
  const { toast } = useToast();
  const [awardedMarks, setAwardedMarks] = useState<number>(answer?.awarded_marks || 0);
  const [extractedText, setExtractedText] = useState<string>(answer?.extracted_text || "");
  const [rationale, setRationale] = useState<string>(answer?.grading_rationale || "");
  const [needsReview, setNeedsReview] = useState<boolean>(answer?.needs_review || false);
  const [editReason, setEditReason] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"verification" | "rubric" | "audit">("verification");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Criteria score state
  const [criterionScores, setCriterionScores] = useState<CriterionScore[]>(
    answer?.criterion_scores || []
  );
  const [selectedRegionIndex, setSelectedRegionIndex] = useState(0);
  const [showAddPageDropdown, setShowAddPageDropdown] = useState(false);
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

  const handleRequestClose = React.useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      onClose();
      setIsRendered(false);
      setIsExiting(false);
    }, 200);
  }, [isExiting, onClose]);

  // Lock body scroll while modal is open & Escape to close
  useEffect(() => {
    if (!isRendered || !mounted) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleRequestClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRendered, mounted, handleRequestClose]);

  useEffect(() => {
    if (answer) {
      setAwardedMarks(answer.awarded_marks);
      setExtractedText(answer.extracted_text);
      setRationale(answer.grading_rationale);
      setNeedsReview(answer.needs_review);
      setCriterionScores(answer.criterion_scores || []);
      setEditReason("");
      setSaveSuccess(false);
      setSelectedRegionIndex(0);
    }
  }, [answer]);

  if (!isOpen || !answer) return null;

  const handleCriterionChange = (criterionId: string, newMarks: number) => {
    const updated = criterionScores.map((c) =>
      c.criterion_id === criterionId
        ? { ...c, awarded_marks: Math.max(0, Math.min(newMarks, c.max_marks)) }
        : c
    );
    setCriterionScores(updated);
    const totalCrit = updated.reduce((sum, c) => sum + (c.awarded_marks || 0), 0);
    setAwardedMarks(Math.min(totalCrit, answer.max_marks));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedSubmission = await api.editAnswer(submission.id, answer.id, {
        awarded_marks: Number(awardedMarks),
        extracted_text: extractedText,
        grading_rationale: rationale,
        needs_review: needsReview,
        reason: editReason || "Teacher manual correction in grading modal",
        criterion_scores: criterionScores,
      });
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      toast.success(
        `Marks override saved for Question ${answer.question_id}: ${Number(awardedMarks)}/${answer.max_marks} marks`,
        { title: "Marks Updated" }
      );
      onUpdated(updatedSubmission);
    } catch (err: any) {
      setIsSaving(false);
      toast.error(err.message || "Failed to save edits", { title: "Override Failed" });
    }
  };

  const relevantAuditLogs = (submission.audit_logs || []).filter(
    (log) => log.answer_id === answer.id
  );

  const cropUrl = api.getCropImageUrl(submission.id, answer.id);

  if (!isRendered || !answer || !mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-black/50 backdrop-blur-xs overflow-y-auto ${
        isExiting ? "animate-modal-backdrop-out" : "animate-modal-backdrop-in"
      }`}
    >
      <div
        className="fixed inset-0"
        onClick={handleRequestClose}
        aria-hidden="true"
      />
      <div
        className={`relative w-full max-w-4xl h-[92vh] sm:h-auto sm:max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-lg border border-hairline bg-surface shadow-notion-modal overflow-hidden text-ink z-10 ${
          isExiting ? "animate-modal-content-out" : "animate-modal-content-in"
        }`}
      >
        {/* Mobile drag affordance */}
        <div className="sm:hidden w-10 h-1 bg-ink-muted/30 rounded-full mx-auto my-2 shrink-0" />

        {/* Header - Clean Notion Style */}
        <div className="flex items-center justify-between border-b border-hairline bg-canvas-soft px-3.5 sm:px-6 py-2.5 sm:py-3.5 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-md bg-primary/10 text-primary font-bold text-xs border border-primary/20 shrink-0 font-mono">
              {answer.question_id}
            </span>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-base font-bold text-ink flex flex-wrap items-center gap-1 sm:gap-2">
                <span>{answer.question_id} Assessment</span>
                {Boolean(answer.is_manual_override) && (
                  <BadgePill label="Overridden" color="orange" />
                )}
                {Boolean(answer.is_missing) && (
                  <BadgePill label="Unattempted" color="orange" />
                )}
                {Boolean(answer.is_extra_attempt) && (
                  <BadgePill label="Extra Attempt" color="purple" />
                )}
                {(answer.regions || []).length > 1 && (
                  <BadgePill label={`Spans ${(answer.regions || []).length} Regions`} color="teal" />
                )}
              </h3>
              <p className="text-[11px] sm:text-xs text-ink-muted truncate">
                Student: <span className="text-ink font-semibold">{submission.student_name}</span> ({submission.roll_number}) • Page {answer.page_number}
                {(answer.regions || []).length > 1 && (
                  <span className="hidden xs:inline"> (Pages: {Array.from(new Set((answer.regions || []).map((r) => r.page_number))).join(", ")})</span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={handleRequestClose}
            className="rounded-md p-1.5 text-ink-muted hover:bg-surface hover:text-ink transition-colors shrink-0 cursor-pointer"
            title="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs - Responsive with Compact Mobile Labels */}
        <div className="flex border-b border-hairline bg-surface px-3 sm:px-6 gap-2 sm:gap-6 text-xs overflow-x-auto whitespace-nowrap scrollbar-none shrink-0">
          <button
            onClick={() => setActiveTab("verification")}
            className={`py-2.5 sm:py-3 font-semibold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 text-xs shrink-0 ${
              activeTab === "verification"
                ? "border-primary text-primary"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">Handwriting</span>
            <span className="hidden sm:inline">Handwriting & Transcription</span>
          </button>
          <button
            onClick={() => setActiveTab("rubric")}
            className={`py-2.5 sm:py-3 font-semibold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 text-xs shrink-0 ${
              activeTab === "rubric"
                ? "border-primary text-primary"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">Rubric</span>
            <span className="hidden sm:inline">Rubric & Grading Criteria</span>
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`py-2.5 sm:py-3 font-semibold border-b-2 transition-all flex items-center gap-1.5 sm:gap-2 text-xs shrink-0 ${
              activeTab === "audit"
                ? "border-primary text-primary"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <History className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">Audit ({relevantAuditLogs.length})</span>
            <span className="hidden sm:inline">Audit History ({relevantAuditLogs.length})</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-canvas-soft/30">
          {activeTab === "verification" && (
            <div className="space-y-4">
              {/* Question Statement */}
              {answer.question_text && (
                <div className="rounded-md border border-hairline bg-canvas-soft p-3.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block">
                    Question Statement
                  </span>
                  <p className="mt-1 text-xs font-semibold text-ink leading-relaxed">
                    {answer.question_text}
                  </p>
                </div>
              )}

              {/* Side-by-Side: Handwriting Crop vs Extracted Text */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Original Answer Crop */}
                <div className="rounded-lg border border-hairline bg-surface p-4 flex flex-col shadow-2xs">
                  {(() => {
                    const allRegions = answer.regions || [];
                    const activeRegion = allRegions[selectedRegionIndex] || allRegions[0];
                    const activeCropUrl = activeRegion
                      ? api.getAnswerCropUrl(submission.id, answer, activeRegion.id)
                      : api.getAnswerCropUrl(submission.id, answer);
                    const activePage =
                      activeRegion?.page_number ||
                      (allRegions.length > 0 ? answer.page_number : undefined);

                    return (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
                          <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                            <ImageIcon className="h-4 w-4 text-primary" />
                            Original Handwriting Crop
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-ink-muted font-mono font-medium">
                              {activePage ? `Page ${activePage}` : "No Box"}
                            </span>
                            {onAdjustOnCanvas && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    if (allRegions.length === 0) {
                                      onAdjustOnCanvas(answer, currentPage || undefined);
                                    } else {
                                      onAdjustOnCanvas(answer, activePage || undefined);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-active hover:underline cursor-pointer transition-colors"
                                  title="Close modal and adjust box handles directly on canvas"
                                >
                                  <Move className="h-3 w-3" />
                                  {allRegions.length === 0 ? "Place Box" : "Adjust Box"}
                                </button>
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => setShowAddPageDropdown((prev) => !prev)}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded hover:bg-teal-100 transition-colors cursor-pointer shadow-2xs"
                                    title="Add an additional bounding box continuation on another sheet"
                                  >
                                    <Plus className="h-3 w-3" />
                                    <span>+ Add Sheet</span>
                                  </button>
                                  {showAddPageDropdown && (
                                    <div className="absolute top-full right-0 mt-1 w-48 bg-surface border border-hairline shadow-lg rounded-lg p-1.5 z-50 space-y-1">
                                      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted px-2 py-1 border-b border-hairline flex items-center justify-between">
                                        <span>Link on Sheet:</span>
                                        <button
                                          type="button"
                                          onClick={() => setShowAddPageDropdown(false)}
                                          className="text-ink-muted hover:text-ink cursor-pointer"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                                        {Array.from({ length: submission.page_count || 1 }).map((_, pIdx) => {
                                          const pNum = pIdx + 1;
                                          const hasRegOnP = allRegions.some((r) => r.page_number === pNum);
                                          return (
                                            <button
                                              key={pNum}
                                              type="button"
                                              onClick={() => {
                                                setShowAddPageDropdown(false);
                                                onClose();
                                                onAdjustOnCanvas(answer, pNum);
                                              }}
                                              className="w-full flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-canvas-soft transition-colors cursor-pointer"
                                            >
                                              <span className="font-medium text-ink">Page {pNum}</span>
                                              <span className={`text-[10px] ${hasRegOnP ? "text-emerald-600 font-semibold" : "text-ink-muted"}`}>
                                                {hasRegOnP ? "(Has Box)" : "+ Add Box"}
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {allRegions.length > 1 && (
                          <div className="flex items-center gap-1.5 mb-2.5 overflow-x-auto pb-1">
                            {allRegions.map((reg, rIdx) => (
                              <button
                                key={reg.id || rIdx}
                                type="button"
                                onClick={() => setSelectedRegionIndex(rIdx)}
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all whitespace-nowrap ${
                                  selectedRegionIndex === rIdx
                                    ? "bg-primary text-white shadow-xs font-bold"
                                    : "bg-canvas-soft border border-hairline text-ink-secondary hover:bg-surface hover:text-ink"
                                }`}
                              >
                                Part {rIdx + 1} (Page {reg.page_number})
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex-1 flex flex-col items-center justify-center min-h-[180px] rounded-md bg-canvas-soft border border-hairline p-2 overflow-hidden">
                          {activeCropUrl && !answer.is_missing ? (
                            <img
                              key={activeCropUrl}
                              src={activeCropUrl}
                              alt="Student Handwriting Crop"
                              className="max-h-[260px] w-auto object-contain rounded shadow-xs"
                            />
                          ) : (
                            <div className="text-center py-6 px-4">
                              <FileText className="h-8 w-8 text-ink-muted mx-auto mb-1.5 opacity-60" />
                              <span className="text-xs text-ink font-semibold block">
                                {answer.is_missing ? "Unattempted Question (No Region Detected)" : "Handwriting crop not available"}
                              </span>
                              <span className="text-[11px] text-ink-muted block mt-0.5">
                                Check transcription on the right or view the page in document viewer.
                              </span>
                            </div>
                          )}
                        </div>
                        <p className="mt-2 text-[11px] text-ink-muted">
                          {allRegions.length > 1
                            ? `Showing Part ${selectedRegionIndex + 1} of ${allRegions.length}. Click pills above to switch pages.`
                            : "Cropped directly from student script using AI bounding box."}
                        </p>
                      </>
                    );
                  })()}
                </div>

                {/* 2. Extracted Student Answer (Editable) */}
                <div className="rounded-lg border border-hairline bg-surface p-4 flex flex-col shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                      <Edit3 className="h-4 w-4 text-emerald-600" />
                      Extracted Student Transcription
                    </span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded font-mono font-medium">Editable</span>
                  </div>
                  <textarea
                    rows={8}
                    value={extractedText}
                    onChange={(e) => setExtractedText(e.target.value)}
                    placeholder="Student's extracted response text..."
                    className="w-full flex-1 rounded-md border border-hairline bg-canvas-soft focus:bg-surface p-3 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-mono leading-relaxed transition-colors"
                  />
                  <div className="mt-2 flex items-center justify-between text-[11px] text-ink-muted">
                    <span>Correct transcription errors here if handwriting was misread.</span>
                  </div>
                </div>
              </div>

              {/* Official Solution / Model Answer */}
              {answer.official_answer && (
                <div className="rounded-md border border-emerald-200 bg-[#edf7ed] p-4 text-xs">
                  <div className="flex items-center gap-2 font-bold text-emerald-800 mb-1.5">
                    <Check className="h-4 w-4 text-emerald-600" />
                    Official Solution / Model Answer
                  </div>
                  <p className="text-emerald-950 font-mono leading-relaxed whitespace-pre-wrap">
                    {answer.official_answer}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "rubric" && (
            <div className="space-y-4">
              {/* Criterion Level Breakdown */}
              <div className="rounded-lg border border-hairline bg-surface p-4 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold text-ink flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Approved Marking Criteria Breakdown
                </h4>

                {criterionScores.length === 0 ? (
                  <p className="text-xs text-ink-muted py-4 text-center">
                    No granular sub-criteria defined for this question. Overall question mark applies.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {criterionScores.map((c) => (
                      <div
                        key={c.criterion_id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md bg-canvas-soft border border-hairline"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-primary">
                              {c.criterion_id}
                            </span>
                            <span className="text-xs font-semibold text-ink">
                              {c.description}
                            </span>
                          </div>
                          {c.evidence && (
                            <p className="mt-1 text-[11px] text-ink-secondary italic">
                              Evidence: "{c.evidence}"
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-ink-muted">Awarded:</span>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max={c.max_marks}
                            value={c.awarded_marks}
                            onChange={(e) =>
                              handleCriterionChange(c.criterion_id, parseFloat(e.target.value) || 0)
                            }
                            className="w-16 rounded border border-hairline bg-surface px-2 py-1 text-center font-mono text-xs font-bold text-ink focus:border-primary focus:outline-none shadow-2xs"
                          />
                          <span className="text-xs text-ink-muted font-mono font-medium">/ {c.max_marks}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Grading Rationale & Explanation */}
              <div className="rounded-lg border border-hairline bg-surface p-4 shadow-2xs space-y-2">
                <span className="text-xs font-bold text-ink flex items-center gap-2">
                  <Edit3 className="h-4 w-4 text-amber-600" />
                  Grading Explanation & Rationale
                </span>
                <textarea
                  rows={4}
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Grading explanation..."
                  className="w-full rounded-md border border-hairline bg-canvas-soft focus:bg-surface p-3 text-xs text-ink focus:border-primary focus:outline-none leading-relaxed transition-colors font-sans"
                />
              </div>

              {/* Uncertainty Gauges */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-md border border-hairline bg-surface p-3 shadow-2xs">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-ink-muted">Transcription Uncertainty:</span>
                    <span className="font-mono font-bold text-ink">
                      {Math.round((answer.transcription_uncertainty || 0) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#f1f1ef] overflow-hidden">
                    <div
                      className={`h-full ${
                        (answer.transcription_uncertainty || 0) > 0.4
                          ? "bg-rose-500"
                          : (answer.transcription_uncertainty || 0) > 0.15
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.round((answer.transcription_uncertainty || 0) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-md border border-hairline bg-surface p-3 shadow-2xs">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-ink-muted">Grading Uncertainty:</span>
                    <span className="font-mono font-bold text-ink">
                      {Math.round((answer.grading_uncertainty || 0) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#f1f1ef] overflow-hidden">
                    <div
                      className={`h-full ${
                        (answer.grading_uncertainty || 0) > 0.4
                          ? "bg-rose-500"
                          : (answer.grading_uncertainty || 0) > 0.15
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.round((answer.grading_uncertainty || 0) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "audit" && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-ink">
                Audit Trail for Question {answer.question_id}
              </h4>
              {relevantAuditLogs.length === 0 ? (
                <div className="rounded-md border border-hairline bg-surface p-8 text-center text-xs text-ink-muted">
                  No manual overrides recorded. Values reflect pristine AI evaluation.
                </div>
              ) : (
                <div className="divide-y divide-hairline rounded-md border border-hairline bg-surface overflow-hidden">
                  {relevantAuditLogs.map((log) => (
                    <div key={log.id} className="p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between text-ink-muted">
                        <span className="font-bold text-primary">{log.field_name}</span>
                        <span className="text-[10px] text-ink-muted">
                          {new Date(log.created_at).toLocaleTimeString()} by {log.edited_by}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-ink">
                        <span className="line-through text-ink-muted font-mono">{log.old_value}</span>
                        <span>→</span>
                        <span className="font-bold text-emerald-600 font-mono">{log.new_value}</span>
                      </div>
                      {log.reason && (
                        <p className="text-[11px] text-ink-secondary italic">Reason: {log.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer / Action Bar */}
        <div className="border-t border-hairline bg-canvas-soft px-3.5 sm:px-6 py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-4 shrink-0">
          {/* Quick Mark Adjustment */}
          <div className="flex flex-wrap items-center justify-between sm:justify-start gap-2.5 sm:gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-ink">Awarded Marks:</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max={answer.max_marks}
                value={awardedMarks}
                onChange={(e) => setAwardedMarks(parseFloat(e.target.value) || 0)}
                className="w-16 sm:w-20 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-center font-mono text-sm font-bold text-ink focus:border-primary focus:outline-none shadow-2xs"
              />
              <span className="text-xs font-bold text-ink-muted">
                / {answer.max_marks} Max
              </span>
            </div>

            {/* Needs Review Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={needsReview}
                onChange={(e) => setNeedsReview(e.target.checked)}
                className="rounded border-hairline text-primary focus:ring-primary h-4 w-4 cursor-pointer"
              />
              <span className="text-xs font-semibold text-ink flex items-center gap-1">
                <Flag className="h-3.5 w-3.5 text-purple-600" />
                Needs Review
              </span>
            </label>
          </div>

          {/* Reason Input & Save Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <input
              type="text"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="Edit reason (optional)..."
              className="rounded-md border border-hairline bg-surface px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none w-full sm:w-56 shadow-2xs"
            />

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={`inline-flex items-center justify-center font-medium rounded-full text-white text-xs px-4 py-2 transition-all shadow-sm w-full sm:w-auto shrink-0 cursor-pointer ${
                saveSuccess
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-primary hover:bg-primary-active disabled:opacity-50"
              }`}
            >
              {saveSuccess ? (
                <>
                  <Check className="h-4 w-4 mr-1.5" />
                  Saved!
                </>
              ) : isSaving ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1.5" />
                  Save & Update Marks
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
