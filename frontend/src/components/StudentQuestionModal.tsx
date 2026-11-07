"use client";

import React, { useState, useMemo } from "react";
import {
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  Award,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Sliders,
  Cpu,
  CheckSquare,
} from "lucide-react";
import { GradedAnswer } from "@/lib/types";
import { api } from "@/lib/api";
import { BadgePill, ButtonPrimary, ButtonUtility, ModalCard, StickerColor } from "./ui";
import { useToast } from "@/lib/ToastContext";

interface StudentQuestionModalProps {
  submissionId: string;
  answer: GradedAnswer | null;
  isOpen: boolean;
  onClose: () => void;
  onRevaluationSubmitted?: (answerId: string, revalData: any) => void;
}

export function StudentQuestionModal({
  submissionId,
  answer,
  isOpen,
  onClose,
  onRevaluationSubmitted,
}: StudentQuestionModalProps) {
  const { toast } = useToast();
  const [revalReason, setRevalReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [showFullCrop, setShowFullCrop] = useState(false);

  const cropUrl = useMemo(() => {
    if (!answer) return "";
    return api.getAnswerCropUrl(submissionId, answer);
  }, [answer, submissionId]);

  if (!isOpen || !answer) return null;

  const scorePct =
    answer.max_marks > 0
      ? Math.round((Number(answer.awarded_marks || 0) / Number(answer.max_marks)) * 100)
      : 0;

  const scoreBadgeColor: StickerColor =
    scorePct >= 75 ? "green" : scorePct >= 50 ? "teal" : scorePct > 0 ? "orange" : "gray";

  const reval = answer.revaluation;
  const hasActiveReval = reval && (reval.status === "SUBMITTED" || reval.status === "UNDER_REVIEW");
  const isRevalResolved = reval && reval.status === "RESOLVED";

  const handleAppealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revalReason.trim()) {
      toast.warning("Please provide an academic justification for your revaluation request.", {
        title: "Reason Required",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await api.requestRevaluation(submissionId, {
        question_ids: [answer.question_id],
        student_reason: revalReason.trim(),
      });

      const newReval = {
        id: result.request_id || `rev_${Date.now()}`,
        status: "SUBMITTED",
        decision: null,
        student_reason: revalReason.trim(),
        reviewer_notes: null,
        requested_at: new Date().toISOString(),
      };

      toast.success(
        `Revaluation requested for Question ${answer.question_id}. Faculty will manually verify step marks.`,
        { title: "Appeal Submitted", duration: 4000 }
      );

      if (onRevaluationSubmitted) {
        onRevaluationSubmitted(answer.id, newReval);
      }

      setRevalReason("");
      setShowAppealForm(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit revaluation request.", {
        title: "Submission Error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={onClose}
      title={`Question ${answer.question_id} • Score & Review`}
      maxWidth="max-w-md"
    >
      <div className="space-y-3 text-xs">
        {/* Compact Score & Status Summary Bar */}
        <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-canvas-soft border border-hairline">
          <div>
            <span className="text-[10px] uppercase font-semibold text-ink-muted block leading-none">
              Awarded Marks
            </span>
            <div className="text-base sm:text-xl font-black text-ink font-mono mt-0.5 leading-tight">
              {Number(answer.awarded_marks || 0).toFixed(1)}{" "}
              <span className="text-xs font-normal text-ink-muted">/ {answer.max_marks} marks</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <BadgePill
              label={`${scorePct}% Score`}
              color={scoreBadgeColor}
              className="text-[10.5px] sm:text-xs px-2 py-0.5 sm:py-1 font-bold"
            />
            {answer.is_manual_override && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[9.5px] font-semibold">
                <CheckCircle2 className="h-3 w-3" />
                Override
              </span>
            )}
          </div>
        </div>

        {/* Active Revaluation Status Banner */}
        {hasActiveReval && (
          <div className="p-3 rounded-lg bg-surface border border-hairline border-l-4 border-l-amber-500 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between font-bold text-[11px] text-ink">
              <span className="flex items-center gap-1.5">
                <RotateCcw className="h-3 w-3 animate-spin text-amber-600 dark:text-amber-400" />
                <span>Revaluation In Progress</span>
              </span>
              <span className="text-[9.5px] uppercase font-mono font-semibold bg-canvas-soft border border-hairline text-ink-muted px-1.5 py-0.5 rounded">
                Under Review
              </span>
            </div>
            <p className="text-[10.5px] text-ink-muted leading-relaxed italic bg-canvas-soft p-2 rounded border border-hairline">
              &ldquo;{reval.student_reason}&rdquo;
            </p>
          </div>
        )}

        {/* Resolved Revaluation Status Banner */}
        {isRevalResolved && (
          <div
            className={`p-3 rounded-lg bg-surface border border-hairline border-l-4 space-y-1.5 shadow-2xs ${
              reval.decision === "MARKS_REVISED" ? "border-l-emerald-500" : "border-l-ink-muted/50"
            }`}
          >
            <div className="flex items-center justify-between font-bold text-[11px] text-ink">
              <span className="flex items-center gap-1.5">
                {reval.decision === "MARKS_REVISED" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5 text-ink-muted" />
                )}
                <span>Decision: {reval.decision === "MARKS_REVISED" ? "Marks Revised" : "Marks Upheld"}</span>
              </span>
              <span className="text-[9.5px] uppercase font-mono font-semibold bg-canvas-soft border border-hairline text-ink-muted px-1.5 py-0.5 rounded">
                Finalized
              </span>
            </div>
            {reval.reviewer_notes && (
              <p className="text-[10.5px] text-ink-muted leading-relaxed italic bg-canvas-soft p-2 rounded border border-hairline">
                <span className="font-semibold text-ink not-italic">Examiner Remarks: </span>&ldquo;{reval.reviewer_notes}&rdquo;
              </p>
            )}
          </div>
        )}

        {/* Student Handwriting Crop Preview (Compact & Expandable) */}
        <div className="space-y-1 rounded-md border border-hairline bg-surface p-2">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="font-semibold flex items-center gap-1 text-[10.5px]">
              <ImageIcon className="h-3 w-3 text-primary" />
              Detected Student Handwriting:
            </span>
            <button
              type="button"
              onClick={() => setShowFullCrop((prev) => !prev)}
              className="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
            >
              {showFullCrop ? (
                <>
                  <ChevronUp className="h-3 w-3" /> Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" /> Expand
                </>
              )}
            </button>
          </div>

          <div
            className={`rounded bg-canvas-soft/60 overflow-hidden flex items-center justify-center transition-all ${
              showFullCrop ? "max-h-72 p-2" : "max-h-28 sm:max-h-36 p-1.5"
            }`}
          >
            {cropUrl ? (
              <img
                key={cropUrl}
                src={cropUrl}
                alt={`Answer Crop ${answer.question_id}`}
                className={`w-auto object-contain rounded select-none shadow-2xs ${
                  showFullCrop ? "max-h-68" : "max-h-24 sm:max-h-32"
                }`}
              />
            ) : (
              <span className="text-xs text-ink-muted italic">Crop preview not available</span>
            )}
          </div>
        </div>

        {/* Faculty Rubric Commentary & Feedback */}
        <div className="space-y-1">
          <div className="font-semibold text-ink flex items-center gap-1 text-[10.5px]">
            <Award className="h-3 w-3 text-primary" />
            Evaluation Feedback & Remarks:
          </div>
          <div className="rounded-md bg-canvas-soft border border-hairline p-2 text-ink-secondary leading-relaxed text-[10.5px] sm:text-[11px]">
            {answer.grading_rationale || answer.feedback || (
              <span className="italic text-ink-muted">
                Official marks awarded according to institutional scheme. Full points allotted for correct derivation steps.
              </span>
            )}
          </div>
        </div>

        {/* Step-by-Step Criterion Scores if Available */}
        {answer.criterion_scores && answer.criterion_scores.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between font-semibold text-ink text-[10.5px]">
              <span className="flex items-center gap-1">
                <Sliders className="h-3 w-3 text-primary" />
                <span>Criteria Breakdown ({answer.criterion_scores.length}):</span>
              </span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
              {answer.criterion_scores.map((crit, idx) => {
                const critAwarded = Number(crit.awarded_marks || 0);
                const critMax = Number(crit.max_marks || 1);
                const isFull = critAwarded >= critMax;
                const isZero = critAwarded === 0;

                return (
                  <div
                    key={crit.id || crit.criterion_id || idx}
                    className="p-2 rounded-md bg-canvas-soft/80 border border-hairline space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[11px] font-medium text-ink leading-snug">
                        <span className="font-semibold text-ink-secondary mr-1">
                          {crit.criterion_id ? `[${crit.criterion_id}]` : `Step ${idx + 1}:`}
                        </span>
                        {crit.description}
                      </div>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 border whitespace-nowrap ${
                          isFull
                            ? "bg-[#edf5f0] text-[#1e613b] border-[#c8e2d2] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                            : isZero
                            ? "bg-[#fbf0f0] text-[#872323] border-[#ecd0d0] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#261212] dark:text-[#e87878] dark:border-[#491f1f] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                            : "bg-[#faf4ec] text-[#7a4e18] border-[#e8dac5] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                        }`}
                      >
                        {critAwarded.toFixed(1)} / {critMax}m
                      </span>
                    </div>

                    {crit.evidence && (
                      <div className="text-[10.5px] text-ink-muted bg-canvas-soft p-2 rounded border border-hairline leading-relaxed">
                        <span className="font-semibold text-ink mr-1">AI Finding / Evidence:</span>
                        {crit.evidence}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Student Handwriting Transcribed vs Official Model Solution */}
        {(answer.extracted_text || answer.official_answer) && (
          <div className="grid grid-cols-1 gap-2 pt-0.5">
            {/* Student's Transcribed Text */}
            {answer.extracted_text && (
              <div className="p-3 rounded-lg bg-surface border border-hairline space-y-1.5 shadow-2xs">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-ink uppercase tracking-wider">
                  <Cpu className="h-3 w-3 text-primary shrink-0" />
                  <span>Transcribed Student Answer (AI Vision)</span>
                </div>
                <div className="text-[10.5px] text-ink font-mono leading-relaxed whitespace-pre-wrap bg-canvas-soft p-2.5 rounded border border-hairline max-h-28 overflow-y-auto">
                  {answer.extracted_text}
                </div>
              </div>
            )}

            {/* Official Model Solution if available */}
            {answer.official_answer && (
              <div className="p-3 rounded-lg bg-surface border border-hairline border-l-4 border-l-emerald-500/80 space-y-1.5 shadow-2xs">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-ink uppercase tracking-wider">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Official Model Solution</span>
                </div>
                <div className="text-[10.5px] text-ink font-mono leading-relaxed whitespace-pre-wrap bg-canvas-soft p-2.5 rounded border border-hairline max-h-28 overflow-y-auto">
                  {answer.official_answer}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Revaluation Appeal Action Section */}
        {!hasActiveReval && !isRevalResolved && (
          <div className="pt-2 border-t border-hairline space-y-2">
            {!showAppealForm ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-surface border border-hairline">
                <div className="space-y-0.5">
                  <div className="font-semibold text-ink text-[11px]">Challenging this question?</div>
                  <div className="text-[10px] text-ink-muted">
                    Request manual review by senior faculty examiner.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAppealForm(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3 text-primary" />
                  <span>Request Revaluation</span>
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleAppealSubmit}
                className="space-y-2.5 p-2.5 sm:p-3 rounded-lg border border-primary/20 bg-primary/5"
              >
                <div className="flex items-start gap-1.5 text-primary font-semibold text-xs">
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span>Submit Appeal for Question {answer.question_id}</span>
                    <p className="text-[9.5px] font-normal text-ink-muted">
                      Evaluated manually by senior examiners. Strictly zero AI adjustments.
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-ink text-[10.5px]">Academic Grievance:</label>
                  <textarea
                    required
                    rows={2}
                    className="w-full rounded-md border border-[#dddddd] bg-surface p-2 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
                    placeholder="State reason (e.g. Step 2 calculation was marked incorrect despite matching formula)..."
                    value={revalReason}
                    onChange={(e) => setRevalReason(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-0.5">
                  <ButtonUtility
                    type="button"
                    size="sm"
                    onClick={() => {
                      setShowAppealForm(false);
                      setRevalReason("");
                    }}
                  >
                    Cancel
                  </ButtonUtility>
                  <ButtonPrimary
                    type="submit"
                    size="sm"
                    isLoading={isSubmitting}
                    disabled={!revalReason.trim()}
                  >
                    Submit Appeal
                  </ButtonPrimary>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-hairline text-[10px] text-ink-muted">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-ink-secondary hover:text-ink px-2 py-1 rounded hover:bg-canvas-soft transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </ModalCard>
  );
}
