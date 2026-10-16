"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  Award,
  FileText,
  Image as ImageIcon,
  Sliders,
  User,
  Edit3,
  Flag,
} from "lucide-react";
import { GradedAnswer } from "@/lib/types";
import { api } from "@/lib/api";
import { BadgePill, ButtonPrimary, ButtonUtility, ModalCard } from "./ui";
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

  const cropUrl = useMemo(() => {
    if (!answer) return "";
    return api.getAnswerCropUrl(submissionId, answer);
  }, [answer, submissionId]);

  // Initialize form when answer or request changes
  useEffect(() => {
    if (answer) {
      setRevisedMarks(Number(answer.awarded_marks || 0));
    }
    if (revaluationRequest) {
      if (revaluationRequest.decision) {
        setDecision(revaluationRequest.decision);
      }
      if (revaluationRequest.reviewer_notes) {
        setReviewerNotes(revaluationRequest.reviewer_notes);
      } else {
        setReviewerNotes("");
      }
    } else {
      setReviewerNotes("");
    }
  }, [answer, revaluationRequest]);

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
        {/* Header Metadata Pill Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-canvas-soft border border-hairline">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold bg-surface border border-hairline px-2 py-0.5 rounded text-ink">
                {answer.question_id}
              </span>
              {rollNumber && (
                <span className="text-[11px] text-ink-muted">
                  Roll: <strong className="text-ink font-medium">{rollNumber}</strong>
                </span>
              )}
              {studentName && (
                <span className="text-[11px] text-ink-muted hidden sm:inline">
                  • {studentName}
                </span>
              )}
            </div>
            <div className="text-lg font-black text-ink font-mono mt-1">
              Current Marks: {Number(answer.awarded_marks || 0).toFixed(1)}{" "}
              <span className="text-xs font-normal text-ink-muted">/ {answer.max_marks} marks</span>
              <span className="text-xs font-bold text-ink-secondary ml-2 font-sans">
                ({scorePct}%)
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isFlaggedForReval ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-500 text-white animate-pulse shadow-2xs">
                <Flag className="h-3.5 w-3.5 fill-white shrink-0" />
                <span>REVALUATION APPEAL PENDING</span>
              </span>
            ) : isResolved ? (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
                  reval.decision === "MARKS_REVISED"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : "bg-slate-100 text-slate-700 border border-slate-300"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {reval.decision === "MARKS_REVISED" ? "Marks Revised" : "Marks Upheld"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted bg-surface px-2 py-0.5 rounded border border-hairline">
                Standard Question
              </span>
            )}
          </div>
        </div>

        {/* Student Grievance Reason Callout */}
        {reval && reval.student_reason && (
          <div className="p-3.5 rounded-lg bg-orange-50/70 border border-orange-200/80 text-orange-950 space-y-1.5">
            <div className="flex items-center justify-between font-bold text-xs text-orange-900">
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-orange-700" />
                Student Academic Grievance
              </span>
              <span className="text-[10px] uppercase font-semibold text-orange-700">
                Submitted by Student
              </span>
            </div>
            <p className="text-xs text-orange-950 italic leading-relaxed bg-surface p-2.5 rounded border border-orange-200">
              &ldquo;{reval.student_reason}&rdquo;
            </p>
          </div>
        )}

        {/* Bounding Box Verification & Adjustment Card */}
        <div className="p-3.5 rounded-lg bg-surface border border-hairline space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-xs text-ink">
              <Sliders className="h-3.5 w-3.5 text-primary" />
              <span>Bounding Box Region Verification</span>
            </div>
            <span className="text-[11px] text-ink-muted">
              Page {answer.page_number || 1} • {answer.regions?.length || 1} Region(s)
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-canvas-soft p-2.5 rounded-md border border-hairline/80">
            <div className="text-[11px] text-ink-secondary leading-snug">
              <p className="font-semibold text-ink">Did AI misplace the answer boundary?</p>
              <p className="text-ink-muted">
                Activate interactive drag handles directly on the PDF canvas to resize or reposition.
              </p>
            </div>

            <ButtonUtility
              type="button"
              onClick={handleAdjustBoxClick}
              className="bg-surface border-primary/30 text-primary hover:bg-primary/5 font-semibold text-xs shrink-0 shadow-2xs"
            >
              <Edit3 className="h-3.5 w-3.5 mr-1 text-primary" />
              Adjust Box on Canvas
            </ButtonUtility>
          </div>
        </div>

        {/* Student Handwriting Crop Preview */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="font-semibold flex items-center gap-1 text-[11px]">
              <ImageIcon className="h-3 w-3 text-primary" />
              Detected Student Handwriting:
            </span>
            <span className="text-[10px]">Crop Region</span>
          </div>
          <div className="rounded-md border border-hairline bg-surface p-2 overflow-hidden flex items-center justify-center max-h-52">
            {cropUrl ? (
              <img
                key={cropUrl}
                src={cropUrl}
                alt={`Crop of Question ${answer.question_id}`}
                className="max-h-48 w-auto object-contain rounded select-none shadow-2xs"
              />
            ) : (
              <span className="text-xs text-ink-muted italic">Crop preview not available</span>
            )}
          </div>
        </div>

        {/* Rubric Commentary & Grading Feedback */}
        <div className="space-y-1.5">
          <div className="font-semibold text-ink flex items-center gap-1 text-[11px]">
            <Award className="h-3.5 w-3.5 text-primary" />
            Grading Rationale & Remarks:
          </div>
          <div className="rounded-md bg-canvas-soft border border-hairline p-2.5 text-ink-secondary text-[11px] leading-relaxed">
            {answer.grading_rationale || answer.feedback || (
              <span className="italic text-ink-muted">No specific rubric remarks recorded.</span>
            )}
          </div>
        </div>

        {/* Evaluator Resolution Form (100% Human, ZERO AI) */}
        <div className="pt-2 border-t border-hairline space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
            <ShieldCheck className="h-4 w-4 text-primary" />
          </div>

          {isResolved ? (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Grievance Formally Resolved
              </div>
              <p>Decision: <strong>{reval.decision || "MARKS_REVISED"}</strong></p>
              {reval.reviewer_notes && (
                <p className="text-[11px] italic bg-white/70 p-2 rounded border border-emerald-200">
                  Notes: &ldquo;{reval.reviewer_notes}&rdquo;
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleResolveSubmit} className="space-y-3">
              {/* Decision Choice */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDecision("MARKS_REVISED")}
                  className={`p-2.5 rounded-lg border text-left text-xs font-semibold transition-all cursor-pointer ${
                    decision === "MARKS_REVISED"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-2xs ring-1 ring-emerald-500/30"
                      : "bg-surface border-hairline text-ink-muted hover:border-[#cccccc]"
                  }`}
                >
                  <div className="font-bold">Revise Marks</div>
                  <div className="text-[10px] font-normal text-emerald-700 mt-0.5">
                    Adjust score & republish paper
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDecision("MARKS_UPHELD")}
                  className={`p-2.5 rounded-lg border text-left text-xs font-semibold transition-all cursor-pointer ${
                    decision === "MARKS_UPHELD"
                      ? "bg-canvas-soft border-ink text-ink shadow-2xs ring-1 ring-ink/20"
                      : "bg-surface border-hairline text-ink-muted hover:border-[#cccccc]"
                  }`}
                >
                  <div className="font-bold">Uphold Original Score</div>
                  <div className="text-[10px] font-normal text-ink-muted mt-0.5">
                    Confirm score is accurate
                  </div>
                </button>
              </div>

              {/* Revised Marks Input if MARKS_REVISED */}
              {decision === "MARKS_REVISED" && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-canvas-soft border border-hairline">
                  <div>
                    <label className="font-semibold text-ink text-xs block">
                      New Awarded Marks:
                    </label>
                    <span className="text-[10px] text-ink-muted">
                      Max marks for question: {answer.max_marks}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max={answer.max_marks}
                      required
                      value={revisedMarks}
                      onChange={(e) => setRevisedMarks(parseFloat(e.target.value) || 0)}
                      className="w-24 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm font-mono font-bold text-ink focus:border-primary focus:outline-none shadow-2xs text-center"
                    />
                    <span className="font-mono text-xs text-ink-muted font-bold">
                      / {answer.max_marks}
                    </span>
                  </div>
                </div>
              )}

              {/* Evaluator Notes Textarea */}
              <div className="space-y-1">
                <label className="font-semibold text-ink text-[11px] block">
                  Official Evaluator Audit Notes / Rationale:
                </label>
                <textarea
                  required
                  rows={2}
                  className="w-full rounded-md border border-hairline bg-surface p-2.5 text-xs text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none shadow-2xs"
                  placeholder="Explain justification for decision (e.g. Correct formula step identified, awarded +1.0 mark)..."
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-hairline">
                <ButtonUtility type="button" onClick={onClose}>
                  Cancel
                </ButtonUtility>

                <ButtonPrimary
                  type="submit"
                  isLoading={isSubmitting}
                  disabled={!reviewerNotes.trim()}
                >
                  Finalize & Publish Decision
                </ButtonPrimary>
              </div>
            </form>
          )}
        </div>
      </div>
    </ModalCard>
  );
}
