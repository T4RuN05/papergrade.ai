"use client";

import React, { useState } from "react";
import {
  Download,
  Trophy,
  Sliders,
  ChevronDown,
  CheckSquare,
  Cpu,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { ModalCard, ButtonUtility, MathText } from "@/components/ui";
import { api } from "@/lib/api";

export interface StudentQuestionBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  submission: any | null;
  isLoadingDetails: boolean;
  onOpenRankings?: (sub: any) => void;
}

export function StudentQuestionBreakdownModal({
  isOpen,
  onClose,
  submission,
  isLoadingDetails,
  onOpenRankings,
}: StudentQuestionBreakdownModalProps) {
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Record<string, boolean>>({});

  const toggleQuestionExpand = (id: string) => {
    setExpandedQuestionIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const toggleAllQuestionsExpand = (allAnswers: any[]) => {
    const allKeys = allAnswers.map((a: any, idx: number) => a.id || a.question_id || `q_${idx}`);
    const isAllExpanded = allKeys.every((key) => expandedQuestionIds[key]);
    if (isAllExpanded) {
      setExpandedQuestionIds({});
    } else {
      const next: Record<string, boolean> = {};
      allKeys.forEach((key) => {
        next[key] = true;
      });
      setExpandedQuestionIds(next);
    }
  };

  if (!submission) return null;

  const isExamPublished = Boolean(
    submission.exam_is_published === 1 ||
    submission.exam_is_published === true ||
    submission.exam_lifecycle_status === "PUBLISHED" ||
    submission.exam_status === "PUBLISHED"
  );

  const isPublished =
    submission.publication_status === "PUBLISHED" ||
    submission.is_published;

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={onClose}
      title={`Evaluation Breakdown • ${submission.exam_title || "Examination"}`}
    >
      <div className="space-y-4 text-xs">
        {/* Modal Subheader */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-3.5 rounded-lg bg-canvas-soft border border-hairline">
          <div className="min-w-0">
            <div className="text-[10px] uppercase font-bold tracking-wider text-ink-muted">
              Roll: {submission.roll_number}
            </div>
            <div className="text-sm font-bold text-ink leading-snug mt-0.5">
              Total Awarded:{" "}
              {submission.total_awarded_marks !== null && submission.total_awarded_marks !== undefined
                ? `${Number(submission.total_awarded_marks).toFixed(1)} / ${
                    submission.max_marks || submission.exam_total_marks || 25
                  } marks (${Number(submission.percentage || 0).toFixed(1)}%)`
                : "Pending Official Publication"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isExamPublished && onOpenRankings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenRankings(submission);
                }}
                className="self-start sm:self-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-300 dark:border-amber-700/50 transition-all shrink-0 shadow-2xs whitespace-nowrap cursor-pointer"
                title="View Official Class Standings"
              >
                <Trophy className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Class Standings</span>
              </button>
            )}

            {isPublished && !submission.is_document_purged && (
              <a
                href={api.getAnnotatedPdfUrl(submission.id)}
                target="_blank"
                rel="noreferrer"
                className="self-start sm:self-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15 border border-primary/25 transition-all shrink-0 shadow-2xs whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5 shrink-0" />
                <span>Annotated PDF</span>
              </a>
            )}
          </div>
        </div>

        {/* Questions List Header with Expand All / Collapse All */}
        {submission.answers && submission.answers.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-ink-muted">
            <span className="font-semibold text-ink-secondary">
              Questions Evaluated ({submission.answers.length})
            </span>
            <button
              type="button"
              onClick={() => toggleAllQuestionsExpand(submission.answers)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
            >
              <Sliders className="h-3 w-3" />
              <span>
                {submission.answers.every((a: any, idx: number) =>
                  expandedQuestionIds[a.id || a.question_id || `q_${idx}`]
                )
                  ? "Collapse All"
                  : "Expand All Details"}
              </span>
            </button>
          </div>
        )}

        {/* Questions List */}
        {submission.answers && submission.answers.length > 0 ? (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {submission.answers.map((ans: any, idx: number) => {
              const qKey = ans.id || ans.question_id || `q_${idx}`;
              const isExpanded = Boolean(expandedQuestionIds[qKey]);
              const qLabel = ans.question_id
                ? ans.question_id.replace(/^q_?/i, "Q")
                : `Q${idx + 1}`;
              const criterionScores: any[] = ans.criterion_scores || [];
              const hasCriteria = criterionScores.length > 0;
              const hasExtractedText = Boolean(ans.extracted_text && ans.extracted_text.trim());
              const hasOfficialAnswer = Boolean(ans.official_answer && ans.official_answer.trim());
              const hasRationale = Boolean(
                ans.grading_rationale &&
                ans.grading_rationale.trim() &&
                ans.grading_rationale !== ans.feedback
              );

              return (
                <div
                  key={qKey}
                  className="p-3 rounded-lg border border-hairline bg-surface space-y-2.5 transition-colors shadow-2xs animate-cascade-row"
                  style={{ animationDelay: `${Math.min(idx * 25, 300)}ms` }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className="font-bold text-ink text-xs bg-canvas-soft px-2 py-0.5 rounded border border-hairline">
                        {qLabel}
                      </span>
                      {ans.is_manual_override === 1 && (
                        <span className="text-[10px] font-semibold bg-[#edf5f0] text-[#1e613b] border border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] px-1.5 py-0.5 rounded shrink-0">
                          Human Override
                        </span>
                      )}
                      {ans.page_number && (
                        <span className="text-[10px] text-ink-muted shrink-0">Page {ans.page_number}</span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-ink text-xs shrink-0">
                      {Number(ans.awarded_marks || 0).toFixed(1)} / {ans.max_marks || 1} marks
                    </span>
                  </div>

                  {/* Question Text / Prompt */}
                  {ans.question_text ? (
                    <div className="text-[11.5px] text-ink-secondary leading-relaxed bg-canvas-soft/40 p-2 rounded border border-hairline/50 animate-cross-fade">
                      <span className="font-semibold text-ink">Prompt: </span>
                      <MathText text={ans.question_text} />
                    </div>
                  ) : isLoadingDetails ? (
                    <div className="bg-canvas-soft/40 p-2 rounded border border-hairline/50 space-y-1.5 animate-pulse min-h-[38px] flex flex-col justify-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-ink-muted">Prompt:</span>
                        <div className="h-2.5 w-3/4 bg-ink-faint/25 rounded" />
                      </div>
                      <div className="h-2 w-1/2 bg-ink-faint/15 rounded ml-12" />
                    </div>
                  ) : null}

                  {/* Rubric Remarks */}
                  {ans.feedback && (
                    <div className="text-ink-secondary bg-canvas-soft/70 p-2 rounded text-[11px] leading-relaxed border border-hairline/60">
                      <span className="font-semibold text-ink">Rubric Remarks: </span>
                      {ans.feedback}
                    </div>
                  )}

                  {/* Human Override Justification */}
                  {ans.override_reason && (
                    <div className="text-[11px] bg-[#edf5f0] text-[#1e613b] border border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] p-2 rounded">
                      <span className="font-semibold">Reviewer Justification: </span>
                      {ans.override_reason}
                    </div>
                  )}

                  {/* Accordion Toggle: Criteria Breakdown & AI Answer */}
                  <button
                    type="button"
                    onClick={() => toggleQuestionExpand(qKey)}
                    className={`w-full flex items-center justify-between gap-2 text-xs font-semibold py-2 px-3 rounded-md transition-all cursor-pointer border ${
                      isExpanded
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-canvas-soft text-ink-secondary hover:text-ink hover:bg-canvas-soft/90 border-hairline"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 text-left">
                      <Sliders className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="leading-snug truncate sm:whitespace-normal">
                        {isExpanded ? "Hide Evaluation Details" : "View Criteria Breakdown & AI Answer"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      {hasCriteria ? (
                        <span className="text-[10px] bg-primary/15 text-primary border border-primary/25 px-2 py-0.5 rounded-full font-bold whitespace-nowrap shrink-0 animate-cross-fade">
                          {criterionScores.length} {criterionScores.length === 1 ? "criterion" : "criteria"}
                        </span>
                      ) : isLoadingDetails ? (
                        <span className="h-4 w-16 bg-primary/10 border border-primary/20 rounded-full animate-pulse shrink-0 inline-block" />
                      ) : null}
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                          isExpanded ? "rotate-180 text-primary" : "rotate-0 text-ink-muted"
                        }`}
                      />
                    </div>
                  </button>

                  {/* Expanded Section */}
                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[grid-template-rows] ${
                      isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden min-h-0">
                      <div
                        className={`pt-2.5 mt-2 border-t border-hairline/70 space-y-3 transition-[opacity,transform] duration-250 ease-out will-change-[opacity,transform] ${
                          isExpanded
                            ? "opacity-100 translate-y-0"
                            : "opacity-0 -translate-y-1 pointer-events-none"
                        }`}
                      >
                        {/* 1. Criteria Breakdown */}
                        {hasCriteria ? (
                          <div className="space-y-1.5">
                            <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1">
                              <CheckSquare className="h-3 w-3 text-primary" />
                              <span>Rubric Criteria Evaluation ({criterionScores.length})</span>
                            </div>

                            <div className="space-y-1.5">
                              {criterionScores.map((crit: any, cIdx: number) => {
                                const critAwarded = Number(crit.awarded_marks || 0);
                                const critMax = Number(crit.max_marks || 1);
                                const isFull = critAwarded >= critMax;
                                const isZero = critAwarded === 0;

                                return (
                                  <div
                                    key={crit.id || crit.criterion_id || cIdx}
                                    className="p-2.5 rounded-md bg-canvas-soft/80 border border-hairline space-y-1"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="text-[11px] font-medium text-ink leading-snug">
                                        <span className="font-semibold text-ink-secondary mr-1">
                                          {crit.criterion_id
                                            ? `[${crit.criterion_id}]`
                                            : `Criterion ${cIdx + 1}:`}
                                        </span>
                                        <MathText text={crit.description} />
                                      </div>
                                      <span
                                        className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono font-bold shrink-0 border ${
                                          isFull
                                            ? "bg-[#edf5f0] text-[#1e613b] border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a]"
                                            : isZero
                                            ? "bg-[#fbf0f0] text-[#872323] border-[#ecd0d0] dark:bg-[#261212] dark:text-[#e87878] dark:border-[#491f1f]"
                                            : "bg-[#faf4ec] text-[#7a4e18] border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17]"
                                        }`}
                                      >
                                        {critAwarded.toFixed(1)} / {critMax}m
                                      </span>
                                    </div>

                                    {crit.evidence && (
                                      <div className="text-[10.5px] text-ink-muted bg-surface dark:bg-[#1a1a1a] p-1.5 rounded border border-hairline leading-relaxed">
                                        <span className="font-semibold text-ink-secondary">
                                          AI Finding / Evidence:{" "}
                                        </span>
                                        <MathText text={crit.evidence} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : isLoadingDetails ? (
                          <div className="space-y-2 py-1 animate-pulse">
                            <div className="h-3 w-36 bg-ink-faint/25 rounded" />
                            <div className="p-2.5 rounded-md bg-canvas-soft/60 border border-hairline space-y-1.5">
                              <div className="h-2.5 w-3/4 bg-ink-faint/30 rounded" />
                              <div className="h-2 w-1/2 bg-ink-faint/20 rounded" />
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-ink-muted italic bg-canvas-soft/40 p-2 rounded border border-hairline">
                            Holistic question-level grading applied without sub-criteria.
                          </div>
                        )}

                        {/* 2. Side-by-Side: Student Handwriting vs Official Model Solution */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="p-2.5 rounded-md bg-blue-50/30 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 space-y-1">
                            <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider">
                              <Cpu className="h-3 w-3 text-primary shrink-0" />
                              <span>Student Answer (AI Transcribed)</span>
                            </div>
                            <div className="text-[11px] text-ink-secondary dark:text-ink leading-relaxed font-mono whitespace-pre-wrap bg-surface dark:bg-[#1a1a1a] p-2 rounded border border-blue-100 dark:border-blue-900/40 max-h-36 overflow-y-auto">
                              {hasExtractedText ? (
                                <MathText text={ans.extracted_text} />
                              ) : (
                                "No handwriting transcribed for this question."
                              )}
                            </div>
                          </div>

                          <div className="p-2.5 rounded-md bg-emerald-50/30 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 space-y-1">
                            <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>Official Model Solution</span>
                            </div>
                            <div className="text-[11px] text-ink-secondary dark:text-ink leading-relaxed whitespace-pre-wrap bg-surface dark:bg-[#1a1a1a] p-2 rounded border border-emerald-100 dark:border-emerald-900/40 max-h-36 overflow-y-auto">
                              {hasOfficialAnswer ? (
                                <MathText text={ans.official_answer} />
                              ) : (
                                "Model solution not published or withheld by institute policy."
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 3. AI Grading Rationale */}
                        {hasRationale && (
                          <div className="text-[11px] text-indigo-950 dark:text-[#c7d2fe] bg-indigo-50/50 dark:bg-[#13172e] p-2.5 rounded-md border border-indigo-200/60 dark:border-[#242b58] leading-relaxed">
                            <span className="font-semibold text-indigo-900 dark:text-[#e0e7ff]">
                              AI Detailed Reasoning:{" "}
                            </span>
                            <MathText text={ans.grading_rationale} />
                          </div>
                        )}

                        {/* 4. Handwriting Crop Link */}
                        {ans.crop_url && (
                          <div className="pt-0.5 flex items-center justify-end text-[11px]">
                            <a
                              href={ans.crop_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                            >
                              <Eye className="h-3 w-3" />
                              <span>Inspect Handwriting Crop Image →</span>
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-ink-muted">
            Detailed question annotations are being compiled.
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-hairline">
          <ButtonUtility onClick={onClose}>Close Breakdown</ButtonUtility>
        </div>
      </div>
    </ModalCard>
  );
}
