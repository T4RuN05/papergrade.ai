"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  Award,
  Image as ImageIcon,
  Sliders,
  User,
  Edit3,
} from "lucide-react";
import { GradedAnswer } from "@/lib/types";
import { api } from "@/lib/api";
import { ModalCard } from "./ui";
import { ClippedAnswerCrop } from "./ClippedAnswerCrop";
import { useToast } from "@/lib/ToastContext";

interface AdminRevaluationModalProps {
  submissionId: string;
  answer: GradedAnswer | null;
  isOpen: boolean;
  onClose: () => void;
  revaluationRequest?: any;
  studentName?: string;
  rollNumber?: string;
  examTitle?: string;
  onStartAdjustBox?: (answerId: string) => void;
  onResolved?: (
    requestId: string,
    decision: "MARKS_REVISED" | "MARKS_UPHELD",
    revisedMarks: number,
    notes: string
  ) => void;
}

export function AdminRevaluationModal({
  submissionId,
  answer,
  isOpen,
  onClose,
  revaluationRequest,
  studentName,
  rollNumber,
  examTitle,
  onStartAdjustBox,
  onResolved,
}: AdminRevaluationModalProps) {
  const { toast } = useToast();

  const [decision, setDecision] = useState<"MARKS_REVISED" | "MARKS_UPHELD">("MARKS_REVISED");
  const [revisedMarks, setRevisedMarks] = useState<number>(0);
  const [reviewerNotes, setReviewerNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [selectedRegionIndex, setSelectedRegionIndex] = useState(0);

  // Cleanly initialize and reset form and region selection when modal opens or answer changes
  useEffect(() => {
    if (isOpen) {
      setSelectedRegionIndex(0);
      setIsSubmitting(false);
      if (answer) {
        setRevisedMarks(Number(answer.awarded_marks || 0));
      }
      if (revaluationRequest) {
        setDecision(revaluationRequest.decision || "MARKS_REVISED");
        setReviewerNotes(revaluationRequest.reviewer_notes || "");
      } else {
        setDecision("MARKS_REVISED");
        setReviewerNotes("");
      }
    }
  }, [isOpen, answer, revaluationRequest]);

  const allRegions = useMemo(() => {
    if (!answer) return [];
    if (Array.isArray(answer.regions) && answer.regions.length > 0) {
      return answer.regions;
    }
    if ((answer as any).x !== undefined && (answer as any).width !== undefined) {
      return [
        {
          id: answer.id,
          page_number: answer.page_number || 1,
          x: (answer as any).x,
          y: (answer as any).y,
          width: (answer as any).width,
          height: (answer as any).height,
        },
      ];
    }
    return [];
  }, [answer]);

  const activeRegion = allRegions[selectedRegionIndex] || allRegions[0] || null;
  const activePage = activeRegion?.page_number || answer?.page_number || 1;

  const cropUrl = useMemo(() => {
    if (!answer) return "";
    return activeRegion?.id
      ? api.getAnswerCropUrl(submissionId, answer, activeRegion.id)
      : api.getAnswerCropUrl(submissionId, answer);
  }, [answer, submissionId, activeRegion?.id]);

  if (!isOpen || !answer) return null;

  const reval = answer.revaluation || revaluationRequest;
  const isFlaggedForReval = Boolean(
    reval && (reval.status === "SUBMITTED" || reval.status === "UNDER_REVIEW")
  );
  const isResolved = Boolean(reval && reval.status === "RESOLVED");

  const scorePct =
    answer.max_marks > 0
      ? Math.round((Number(answer.awarded_marks || 0) / Number(answer.max_marks)) * 100)
      : 0;

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reval || !reval.id) {
      toast.error("No active revaluation request associated with this question.", {
        title: "Missing Request",
      });
      return;
    }
    if (!reviewerNotes.trim()) {
      toast.warning("Please provide official evaluator audit notes before committing.", {
        title: "Notes Required",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const revisedAnswers =
        decision === "MARKS_REVISED"
          ? [
            {
              question_id: answer.question_id,
              revised_marks: Number(revisedMarks),
              comment: reviewerNotes.trim(),
            },
          ]
          : undefined;

      await api.resolveRevaluation(reval.id, {
        decision,
        reviewer_notes: reviewerNotes.trim(),
        revised_answers: revisedAnswers,
      });

      const outcomeText =
        decision === "MARKS_REVISED"
          ? `Marks revised to ${revisedMarks} / ${answer.max_marks}`
          : "Original score upheld";

      toast.success(`Question ${answer.question_id}: ${outcomeText}`, {
        title: "Revaluation Finalized",
        duration: 4000,
      });

      if (onResolved) {
        onResolved(reval.id, decision, Number(revisedMarks), reviewerNotes.trim());
      }

      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to resolve revaluation request.", {
        title: "Resolution Failed",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustBoxClick = () => {
    if (onStartAdjustBox) {
      onStartAdjustBox(answer.id);
    }
    onClose();
  };

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={onClose}
      title={`Revaluation Desk • ${answer.question_id}`}
    >
      <div className="space-y-4 text-xs">
        {/* Header Metadata Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-canvas-soft border border-hairline">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-semibold bg-surface border border-hairline px-2 py-0.5 rounded-xs text-ink">
                {answer.question_id}
              </span>
              {rollNumber && (
                <span className="text-xs text-ink-muted">
                  Roll: <strong className="text-ink font-medium">{rollNumber}</strong>
                </span>
              )}
              {studentName && (
                <span className="text-xs text-ink-muted hidden sm:inline">
                  • {studentName}
                </span>
              )}
            </div>
            <div className="text-base sm:text-lg font-bold text-ink font-mono mt-1.5 tabular-nums">
              Current Marks: {Number(answer.awarded_marks || 0).toFixed(1)}{" "}
              <span className="text-xs font-normal text-ink-muted">/ {answer.max_marks} marks</span>
              <span className="text-xs font-semibold text-ink-secondary ml-2 font-sans">
                ({scorePct}%)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isFlaggedForReval ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-surface text-ink border border-hairline">
                <span className="h-2 w-2 rounded-full bg-[#dd5b00] shrink-0" />
                <span>Appeal Pending</span>
              </span>
            ) : isResolved ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-surface text-ink border border-hairline">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    reval.decision === "MARKS_REVISED" ? "bg-[#1aae39]" : "bg-ink-muted"
                  }`}
                />
                <span>{reval.decision === "MARKS_REVISED" ? "Marks Revised" : "Marks Upheld"}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted bg-surface px-2.5 py-1 rounded-md border border-hairline">
                Standard Question
              </span>
            )}
          </div>
        </div>

        {/* Student Grievance Reason Callout */}
        {reval && reval.student_reason && (
          <div className="p-3.5 rounded-lg bg-canvas-soft border border-hairline space-y-1.5">
            <div className="flex items-center justify-between font-semibold text-xs text-ink">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#dd5b00] shrink-0" />
                <User className="h-3.5 w-3.5 text-ink-secondary" />
                <span>Student Academic Grievance</span>
              </span>
              <span className="text-[11px] font-medium text-ink-muted">
                Submitted by student
              </span>
            </div>
            <p className="text-xs text-ink-secondary italic leading-relaxed bg-surface p-2.5 rounded-xs border border-hairline">
              &ldquo;{reval.student_reason}&rdquo;
            </p>
          </div>
        )}

        {/* Bounding Box Verification & Adjustment Card */}
        <div className="p-3.5 rounded-lg bg-surface border border-hairline space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-ink">
              <Sliders className="h-3.5 w-3.5 text-primary" />
              <span>Bounding Box Region Verification</span>
            </div>
            <span className="text-xs text-ink-muted shrink-0">
              Page {answer.page_number || 1} • {answer.regions?.length || 1} Region(s)
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-canvas-soft p-3 rounded-md border border-hairline">
            <div className="text-xs text-ink-secondary leading-snug">
              <p className="font-semibold text-ink">Did AI misplace the answer boundary?</p>
              <p className="text-ink-muted mt-0.5">
                Activate interactive drag handles directly on the PDF canvas to resize or reposition.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAdjustBoxClick}
              className="notion-btn-utility text-primary shrink-0 w-full sm:w-auto"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Adjust Box on Canvas</span>
            </button>
          </div>
        </div>

        {/* Student Handwriting Crop Preview (with Multi-Page/Part Support) */}
        <div className="space-y-2 rounded-lg border border-hairline bg-surface p-3">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="font-semibold flex items-center gap-1.5 text-xs text-ink">
              <ImageIcon className="h-3.5 w-3.5 text-primary" />
              <span>Detected Student Handwriting</span>
            </span>
            <div className="flex items-center gap-2">
              {allRegions.length > 1 && (
                <span className="text-[11px] font-mono text-ink-muted">
                  Part {selectedRegionIndex + 1}/{allRegions.length} • Page {activePage}
                </span>
              )}
              <span className="text-[11px] text-ink-muted">Crop Region</span>
            </div>
          </div>

          {/* Multi-Page / Multi-Part Region Selector Tabs */}
          {allRegions.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-0.5">
              {allRegions.map((reg, rIdx) => {
                const isSelected = selectedRegionIndex === rIdx;
                return (
                  <button
                    key={reg.id || rIdx}
                    type="button"
                    onClick={() => setSelectedRegionIndex(rIdx)}
                    className={`min-h-0 h-7 px-2.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                      isSelected ? "notion-btn-primary" : "notion-btn-utility text-ink-secondary"
                    }`}
                  >
                    Part {rIdx + 1} (Page {reg.page_number || 1})
                  </button>
                );
              })}
            </div>
          )}

          <div className="rounded-md border border-hairline bg-canvas-soft p-2 overflow-hidden flex items-center justify-center max-h-52">
            <ClippedAnswerCrop
              submissionId={submissionId}
              pageNumber={activePage}
              region={activeRegion}
              fallbackCropUrl={cropUrl}
              alt={`Crop of Question ${answer.question_id}${allRegions.length > 1 ? ` - Part ${selectedRegionIndex + 1}` : ""}`}
              maxContainerHeight="200px"
            />
          </div>

          {allRegions.length > 1 && (
            <p className="text-[11px] text-ink-muted leading-tight">
              Showing Part {selectedRegionIndex + 1} of {allRegions.length} (Page {activePage}). Tap tabs above to switch pages.
            </p>
          )}
        </div>

        {/* Rubric Commentary & Grading Feedback */}
        <div className="space-y-1.5">
          <div className="font-semibold text-ink flex items-center gap-1.5 text-xs">
            <Award className="h-3.5 w-3.5 text-primary" />
            <span>Grading Rationale &amp; Remarks</span>
          </div>
          <div className="rounded-md bg-canvas-soft border border-hairline p-3 text-ink-secondary text-xs leading-relaxed">
            {answer.grading_rationale || answer.feedback || (
              <span className="italic text-ink-muted">No specific rubric remarks recorded.</span>
            )}
          </div>
        </div>

        {/* Evaluator Resolution Form (100% Human, ZERO AI) */}
        <div className="pt-3 border-t border-hairline space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>Evaluator Resolution</span>
          </div>

          {isResolved ? (
            <div className="p-3.5 rounded-lg bg-canvas-soft border border-hairline text-xs text-ink space-y-1.5">
              <div className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-[#1aae39]" />
                <span>Grievance Formally Resolved</span>
              </div>
              <p className="text-ink-secondary">
                Decision: <strong className="text-ink">{reval.decision || "MARKS_REVISED"}</strong>
              </p>
              {reval.reviewer_notes && (
                <p className="text-xs italic bg-surface p-2.5 rounded-xs border border-hairline text-ink-secondary">
                  Notes: &ldquo;{reval.reviewer_notes}&rdquo;
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleResolveSubmit} className="space-y-3">
              {/* Decision Choice */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDecision("MARKS_REVISED")}
                  className={`p-3 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                    decision === "MARKS_REVISED"
                      ? "bg-primary/[0.04] border-primary text-ink ring-1 ring-primary/25"
                      : "bg-surface border-hairline text-ink-muted hover:bg-canvas-soft"
                  }`}
                >
                  <div className="font-semibold text-ink flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-[#1aae39] shrink-0" />
                    <span>Revise Marks</span>
                  </div>
                  <div className="text-[11px] font-normal text-ink-muted mt-0.5">
                    Adjust score &amp; republish paper
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDecision("MARKS_UPHELD")}
                  className={`p-3 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                    decision === "MARKS_UPHELD"
                      ? "bg-primary/[0.04] border-primary text-ink ring-1 ring-primary/25"
                      : "bg-surface border-hairline text-ink-muted hover:bg-canvas-soft"
                  }`}
                >
                  <div className="font-semibold text-ink flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                    <span>Uphold Original Score</span>
                  </div>
                  <div className="text-[11px] font-normal text-ink-muted mt-0.5">
                    Confirm score is accurate
                  </div>
                </button>
              </div>

              {/* Revised Marks Input if MARKS_REVISED */}
              {decision === "MARKS_REVISED" && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-canvas-soft border border-hairline">
                  <div>
                    <label className="font-semibold text-ink text-xs block">
                      New Awarded Marks
                    </label>
                    <span className="text-[11px] text-ink-muted">
                      Max marks for question: {answer.max_marks}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max={answer.max_marks}
                      required
                      value={revisedMarks}
                      onChange={(e) => setRevisedMarks(parseFloat(e.target.value) || 0)}
                      className="w-20 sm:w-24 rounded-xs border border-hairline bg-surface px-2.5 py-1.5 text-sm font-mono font-semibold text-ink focus:border-primary focus:outline-none text-center tabular-nums"
                    />
                    <span className="font-mono text-xs text-ink-muted font-medium">
                      / {answer.max_marks}
                    </span>
                  </div>
                </div>
              )}

              {/* Evaluator Notes Textarea */}
              <div className="space-y-1.5">
                <label className="font-semibold text-ink text-xs block">
                  Official Evaluator Audit Notes / Rationale
                </label>
                <textarea
                  required
                  rows={2}
                  className="w-full rounded-xs border border-hairline bg-surface p-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
                  placeholder="Explain justification for decision (e.g. Correct formula step identified, awarded +1.0 mark)..."
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-between gap-2.5 pt-3 border-t border-hairline">
                <button
                  type="button"
                  onClick={onClose}
                  className="notion-btn-utility w-full sm:w-auto"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !reviewerNotes.trim()}
                  className="notion-btn-primary w-full sm:w-auto disabled:opacity-50"
                >
                  {isSubmitting ? "Finalizing..." : "Finalize & Publish"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </ModalCard>
  );
}
