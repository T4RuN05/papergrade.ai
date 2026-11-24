"use client";

import React, { useState, useEffect } from "react";
import { CheckSquare, Square } from "lucide-react";
import { ModalCard, ButtonUtility, ButtonPrimary } from "@/components/ui";
import { api } from "@/lib/api";
import { useToast } from "@/lib/ToastContext";

export interface StudentRevaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  submission: any | null;
  onAppealSubmitted: (updatedSubmission: any) => void;
}

export function StudentRevaluationModal({
  isOpen,
  onClose,
  submission,
  onAppealSubmitted,
}: StudentRevaluationModalProps) {
  const { toast } = useToast();
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [revalReason, setRevalReason] = useState("");
  const [revalLoading, setRevalLoading] = useState(false);
  const [revalMsg, setRevalMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedQuestions([]);
      setRevalReason("");
      setRevalMsg(null);
    }
  }, [isOpen, submission?.id]);

  if (!submission) return null;

  const handleRevalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submission || selectedQuestions.length === 0 || !revalReason.trim()) return;

    setRevalLoading(true);
    try {
      await api.requestRevaluation(submission.id, {
        question_ids: selectedQuestions,
        student_reason: revalReason.trim(),
      });
      const successMsg = "Revaluation request submitted. Senior faculty will manually review your paper.";
      setRevalMsg(successMsg);
      toast.success(successMsg, { title: "Request Received", duration: 4000 });

      const updated = {
        ...submission,
        revaluation: {
          id: `rev_pending_${Date.now()}`,
          status: "SUBMITTED",
          question_ids_json: JSON.stringify(selectedQuestions),
          student_reason: revalReason.trim(),
          requested_at: new Date().toISOString(),
        },
      };

      onAppealSubmitted(updated);

      setTimeout(() => {
        onClose();
        setRevalMsg(null);
      }, 1200);
    } catch (err: any) {
      const errorMsg = err.message || "Failed to submit revaluation request.";
      setRevalMsg(errorMsg);
      toast.error(errorMsg, { title: "Submission Failed" });
    } finally {
      setRevalLoading(false);
    }
  };

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={onClose}
      title={`Submit Revaluation Request • ${submission.exam_title || "Examination"}`}
      maxWidth="max-w-lg"
      className="h-[88vh] sm:h-auto sm:max-h-[85vh] flex flex-col"
    >
      <form onSubmit={handleRevalSubmit} className="space-y-4 text-xs">
        {/* Questions to Challenge */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-ink">
              Select Question(s) to Challenge:
            </label>
            {submission.answers && submission.answers.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const allIds = submission.answers.map(
                    (a: any, i: number) => a.question_id || `Q${i + 1}`
                  );
                  if (selectedQuestions.length === allIds.length) {
                    setSelectedQuestions([]);
                  } else {
                    setSelectedQuestions(allIds);
                  }
                }}
                className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
              >
                {selectedQuestions.length === (submission.answers?.length || 0)
                  ? "Deselect All"
                  : "Select All"}
              </button>
            )}
          </div>

          {submission.answers && submission.answers.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {submission.answers.map((ans: any, idx: number) => {
                const qId = ans.question_id || `Q${idx + 1}`;
                const isSelected = selectedQuestions.includes(qId);
                return (
                  <button
                    type="button"
                    key={qId}
                    onClick={() => {
                      setSelectedQuestions((prev) =>
                        prev.includes(qId) ? prev.filter((x) => x !== qId) : [...prev, qId]
                      );
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-surface border-primary ring-1 ring-primary/40 text-ink font-semibold shadow-2xs"
                        : "bg-surface border-hairline text-ink hover:bg-canvas-soft"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {isSelected ? (
                        <CheckSquare className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-ink-muted" />
                      )}
                      <span>{qId.replace(/^q_?/i, "Q")}</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-canvas-soft border border-hairline text-ink-muted">
                      {Number(ans.awarded_marks || 0).toFixed(1)}/{ans.max_marks || 1}m
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"].map((qid) => (
                <button
                  type="button"
                  key={qid}
                  onClick={() => {
                    setSelectedQuestions((prev) =>
                      prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]
                    );
                  }}
                  className={`py-1.5 px-3 rounded-md border text-center font-semibold transition-colors cursor-pointer ${
                    selectedQuestions.includes(qid)
                      ? "bg-primary text-white border-primary"
                      : "bg-surface border-hairline text-ink hover:bg-canvas-soft"
                  }`}
                >
                  {qid}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Academic Justification */}
        <div className="space-y-1.5">
          <label className="font-semibold text-ink">
            Academic Justification / Grievance Details:
          </label>
          <textarea
            required
            rows={3}
            className="w-full rounded-md border border-hairline bg-surface p-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
            placeholder="Explain why you believe the step marks, derivation, or criteria require faculty re-verification..."
            value={revalReason}
            onChange={(e) => setRevalReason(e.target.value)}
          />
        </div>

        {revalMsg && (
          <div className="rounded-md bg-canvas-soft border border-hairline p-2 text-xs text-ink font-medium">
            {revalMsg}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-hairline">
          <div className="text-[11px] text-ink-muted">
            Selected: <strong className="text-ink">{selectedQuestions.length}</strong> question(s)
          </div>
          <div className="flex items-center gap-2">
            <ButtonUtility type="button" onClick={onClose}>
              Cancel
            </ButtonUtility>
            <ButtonPrimary
              type="submit"
              isLoading={revalLoading}
              disabled={selectedQuestions.length === 0 || !revalReason.trim()}
            >
              Submit Appeal
            </ButtonPrimary>
          </div>
        </div>
      </form>
    </ModalCard>
  );
}
