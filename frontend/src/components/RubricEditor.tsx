"use client";

import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  Plus,
  Trash2,
  Sparkles,
  AlertCircle,
  FileCheck2,
  Unlock,
  Layers,
  HelpCircle,
} from "lucide-react";
import { ExamRubric, RubricQuestion, RubricCriterion } from "@/lib/types";
import { FeatureCard, ButtonPrimary, ButtonUtility, BadgePill, MathText, hasLatexMath } from "./ui";
import { useToast } from "@/lib/ToastContext";

interface RubricEditorProps {
  initialRubric: ExamRubric;
  isApproved: boolean;
  onApprove: (approvedRubric: ExamRubric) => Promise<void>;
  onUnlock?: () => Promise<void>;
}

const normalizeQuestion = (q: RubricQuestion, idx: number): RubricQuestion => ({
  ...q,
  question_id: q.question_id || String(idx + 1),
  question_text: q.question_text || (q as any).title || "",
  max_marks: Number(q.max_marks) || 0,
  official_answer: q.official_answer || "",
  criteria: Array.isArray(q.criteria)
    ? q.criteria.map((c, cIdx) => ({
        ...c,
        criterion_id: c.criterion_id || `C${cIdx + 1}`,
        description: c.description || "",
        marks: Number(c.marks) || 0,
      }))
    : [],
});

const normalizeRubric = (r?: ExamRubric): ExamRubric => {
  if (!r) {
    return {
      exam_title: "",
      subject: "",
      total_marks: 0,
      questions: [],
      sections: [],
    };
  }
  return {
    ...r,
    exam_title: r.exam_title || "",
    subject: r.subject || "",
    total_marks: Number(r.total_marks) || 0,
    questions: Array.isArray(r.questions)
      ? r.questions.map((q, i) => normalizeQuestion(q, i))
      : [],
    sections: Array.isArray(r.sections) ? r.sections : [],
  };
};

export function RubricEditor({
  initialRubric,
  isApproved,
  onApprove,
  onUnlock,
}: RubricEditorProps) {
  const { toast } = useToast();
  const [rubric, setRubric] = useState<ExamRubric>(() => normalizeRubric(initialRubric));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  useEffect(() => {
    setRubric(normalizeRubric(initialRubric));
  }, [initialRubric]);

  const calculateTotalMarks = () => {
    if (rubric.sections && rubric.sections.length > 0) {
      const secSum = rubric.sections.reduce((acc, s) => acc + (Number(s.max_marks) || 0), 0);
      if (secSum > 0) return secSum;
    }
    if (rubric.total_marks && Number(rubric.total_marks) > 0) {
      return Number(rubric.total_marks);
    }
    return (rubric.questions || []).reduce((sum, q) => sum + (Number(q.max_marks) || 0), 0);
  };

  const handleQuestionChange = (index: number, field: keyof RubricQuestion, value: any) => {
    const updatedQuestions = [...(rubric.questions || [])];
    updatedQuestions[index] = { ...updatedQuestions[index], [field]: value };
    setRubric({ ...rubric, questions: updatedQuestions });
  };

  const handleAddQuestion = () => {
    const questions = rubric.questions || [];
    const nextQId = `Q${questions.length + 1}`;
    const newQ: RubricQuestion = {
      question_id: nextQId,
      question_text: "New Question Statement...",
      max_marks: 4.0,
      official_answer: "Official expected solution / model answer...",
      criteria: [
        {
          criterion_id: "C1",
          description: "Stated valid approach or formula",
          marks: 2.0,
        },
        {
          criterion_id: "C2",
          description: "Correct final calculation and units",
          marks: 2.0,
        },
      ],
    };
    setRubric({
      ...rubric,
      questions: [...questions, newQ],
    });
  };

  const handleDeleteQuestion = (index: number) => {
    const updated = (rubric.questions || []).filter((_, i) => i !== index);
    setRubric({ ...rubric, questions: updated });
  };

  const handleAddCriterion = (qIndex: number) => {
    const q = rubric.questions[qIndex];
    const crits = Array.isArray(q?.criteria) ? q.criteria : [];
    const nextCId = `C${crits.length + 1}`;
    const newCrit: RubricCriterion = {
      criterion_id: nextCId,
      description: "Criterion step description...",
      marks: 1.0,
    };
    handleQuestionChange(qIndex, "criteria", [...crits, newCrit]);
  };

  const handleDeleteCriterion = (qIndex: number, cIndex: number) => {
    const q = rubric.questions[qIndex];
    const crits = Array.isArray(q?.criteria) ? q.criteria : [];
    const updated = crits.filter((_, i) => i !== cIndex);
    handleQuestionChange(qIndex, "criteria", updated);
  };

  const handleCriterionFieldChange = (
    qIndex: number,
    cIndex: number,
    field: keyof RubricCriterion,
    value: any
  ) => {
    const q = rubric.questions[qIndex];
    const crits = Array.isArray(q?.criteria) ? q.criteria : [];
    const updatedCrits = [...crits];
    updatedCrits[cIndex] = { ...updatedCrits[cIndex], [field]: value };
    handleQuestionChange(qIndex, "criteria", updatedCrits);
  };

  const handleApproveClick = async () => {
    setIsSubmitting(true);
    try {
      const finalRubric = {
        ...rubric,
        total_marks: calculateTotalMarks(),
      };
      await onApprove(finalRubric);
    } catch (e: any) {
      toast.error(e.message || "Approval failed", { title: "Approval Failed" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlockClick = async () => {
    if (!onUnlock) return;
    setIsUnlocking(true);
    try {
      await onUnlock();
    } catch (e: any) {
      toast.error(e.message || "Unlock failed", { title: "Unlock Failed" });
    } finally {
      setIsUnlocking(false);
    }
  };

  const isReadOnly = isApproved || isSubmitting;
  const total = calculateTotalMarks();

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <FeatureCard className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-hairline">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <h2 className="text-xl font-bold text-ink tracking-tight">
                {rubric.exam_title || "Examination Rubric Studio"}
              </h2>
              {isApproved ? (
                <BadgePill label="Approved & Locked" color="green" />
              ) : (
                <BadgePill label="Draft Pending Approval" color="orange" />
              )}
            </div>
            <p className="text-xs text-ink-muted">
              Subject: <span className="font-semibold text-ink-secondary">{rubric.subject}</span> • Total Questions:{" "}
              <span className="font-semibold text-ink-secondary">{rubric.questions.length}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
            <div className="text-left sm:text-right">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted block">Total Marks</span>
              <div className="font-mono text-2xl font-bold text-primary">{total}</div>
            </div>

            {isApproved ? (
              onUnlock && (
                <ButtonUtility
                  type="button"
                  onClick={handleUnlockClick}
                  disabled={isUnlocking}
                  className="py-2 px-3.5 text-xs font-semibold"
                  title="Unlock rubric to edit questions or criteria"
                >
                  <Unlock className="h-3.5 w-3.5 mr-1.5 text-[#dd5b00]" />
                  {isUnlocking ? "Unlocking..." : "Unlock Rubric to Edit"}
                </ButtonUtility>
              )
            ) : (
              <ButtonPrimary
                type="button"
                onClick={handleApproveClick}
                disabled={isSubmitting}
                className="py-2 px-4 text-xs font-semibold"
              >
                <FileCheck2 className="h-4 w-4 mr-1.5" />
                {isSubmitting ? "Locking..." : "Approve & Lock Rubric"}
              </ButtonPrimary>
            )}
          </div>
        </div>

        {/* Sections Breakdown Banner */}
        {rubric.sections && rubric.sections.length > 0 && (
          <div className="rounded-lg border border-hairline bg-canvas-soft p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-ink uppercase tracking-wider">
                  Exam Sections & Choice Rules
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-ink">
                Paper Cap: {total} Marks
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {rubric.sections.map((sec, idx) => (
                <div
                  key={idx}
                  className="rounded-md border border-hairline bg-surface p-3 flex flex-col justify-between shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-primary font-mono">
                        {sec.section_id}
                      </span>
                      <BadgePill label={`${sec.max_marks} Marks`} color="teal" />
                    </div>
                    {sec.title && (
                      <div className="text-xs font-semibold text-ink mt-1.5">
                        {sec.title}
                      </div>
                    )}
                    <div className="text-[11px] text-ink-muted mt-1 leading-relaxed">
                      {sec.instructions || (sec.attempt_limit ? `Attempt any ${sec.attempt_limit}` : "All compulsory")}
                    </div>
                  </div>
                  {sec.attempt_limit && (
                    <div className="mt-2 text-[10px] font-semibold text-[#1aae39] flex items-center gap-1">
                      <span>✓ Best of {sec.attempt_limit} Rule Active</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Questions list */}
        <div className="space-y-5">
          {(rubric.questions || []).map((q, qIdx) => {
            const criteriaList = Array.isArray(q.criteria) ? q.criteria : [];
            return (
              <div
                key={qIdx}
                className="rounded-lg border border-hairline bg-surface p-4 sm:p-5 space-y-4 shadow-xs transition-colors hover:border-hairline"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      value={q.question_id || ""}
                      disabled={isReadOnly}
                      onChange={(e) => handleQuestionChange(qIdx, "question_id", e.target.value)}
                      className="w-20 rounded-md border border-hairline bg-canvas-soft px-2.5 py-1 text-xs font-mono font-bold text-ink text-center focus:border-primary focus:outline-none disabled:opacity-75"
                    />
                    <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <span className="font-medium">Max Marks:</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={q.max_marks ?? 0}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          handleQuestionChange(qIdx, "max_marks", parseFloat(e.target.value) || 0)
                        }
                        className="w-16 rounded-md border border-hairline bg-surface px-2 py-1 text-xs font-mono font-bold text-ink text-center focus:border-primary focus:outline-none disabled:opacity-75"
                      />
                    </div>
                    {q.section_id && (
                      <BadgePill label={`Section ${q.section_id}`} color="sky" />
                    )}
                  </div>

                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(qIdx)}
                      className="self-end sm:self-center text-ink-muted hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 p-1.5 rounded-md transition-colors"
                      title="Delete Question"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Question Statement */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-ink-secondary">
                      Question Statement:
                    </label>
                    {hasLatexMath(q.question_text || (q as any).title) && (
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        KaTeX Math
                      </span>
                    )}
                  </div>
                  {!isReadOnly && (
                    <textarea
                      rows={2}
                      value={q.question_text || (q as any).title || ""}
                      onChange={(e) => handleQuestionChange(qIdx, "question_text", e.target.value)}
                      placeholder="Enter question statement (KaTeX supported)..."
                      className="w-full rounded-md border border-hairline bg-surface p-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
                    />
                  )}
                  {(isReadOnly || hasLatexMath(q.question_text || (q as any).title)) && (
                    <div className={`${!isReadOnly ? "mt-1.5" : ""} rounded-md border border-hairline bg-canvas-soft/60 p-2.5 text-xs text-ink leading-relaxed`}>
                      <MathText text={q.question_text || (q as any).title || ""} />
                    </div>
                  )}
                </div>

                {/* Official Answer */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-ink-secondary flex items-center gap-1">
                      <span className="text-[#1aae39] font-bold">✓</span>
                      <span>Official Expected Solution / Model Answer:</span>
                    </label>
                    {hasLatexMath(q.official_answer) && (
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-[#86d4a4]">
                        KaTeX Math
                      </span>
                    )}
                  </div>
                  {!isReadOnly && (
                    <textarea
                      rows={2}
                      value={q.official_answer || ""}
                      onChange={(e) => handleQuestionChange(qIdx, "official_answer", e.target.value)}
                      placeholder="Enter official expected answer..."
                      className="w-full rounded-md border border-hairline bg-canvas-soft/30 p-2.5 text-xs font-mono text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
                    />
                  )}
                  {(isReadOnly || hasLatexMath(q.official_answer)) && (
                    <div className={`${!isReadOnly ? "mt-1.5" : ""} rounded-md border border-emerald-200/60 dark:border-[#1a3324] bg-emerald-50/50 dark:bg-[#101d15] p-2.5 text-xs text-emerald-950 dark:text-[#86d4a4] leading-relaxed`}>
                      <MathText text={q.official_answer || ""} />
                    </div>
                  )}
                </div>

                {/* Criteria */}
                <div className="border-t border-hairline pt-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-secondary flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Partial Marks Step-by-Step Breakdown
                    </span>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleAddCriterion(qIdx)}
                        className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer"
                      >
                        <Plus className="h-3 w-3" />
                        Add Step
                      </button>
                    )}
                  </div>

                  {criteriaList.length === 0 ? (
                    <div className="rounded-md border border-dashed border-hairline p-3 text-center text-xs text-ink-muted bg-canvas-soft/40">
                      <span>No partial marking criteria defined. Evaluated as a single step ({q.max_marks || 0}m).</span>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => handleAddCriterion(qIdx)}
                          className="ml-2 text-primary font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" /> Add Step Criteria
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {criteriaList.map((c, cIdx) => (
                        <div
                          key={cIdx}
                          className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md bg-canvas-soft p-2.5 border border-hairline"
                        >
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <input
                              type="text"
                              value={c.criterion_id || ""}
                              disabled={isReadOnly}
                              onChange={(e) =>
                                handleCriterionFieldChange(qIdx, cIdx, "criterion_id", e.target.value)
                              }
                              className="w-14 rounded-md border border-hairline bg-surface px-1.5 py-1 text-xs font-mono text-center font-bold text-primary focus:border-primary focus:outline-none disabled:opacity-75 shrink-0"
                            />
                            <div className="flex-1 sm:hidden">
                              {!isReadOnly ? (
                                <input
                                  type="text"
                                  value={c.description || ""}
                                  onChange={(e) =>
                                    handleCriterionFieldChange(qIdx, cIdx, "description", e.target.value)
                                  }
                                  placeholder="Criterion description..."
                                  className="w-full rounded-md border border-hairline bg-surface px-2.5 py-1 text-xs text-ink focus:border-primary focus:outline-none"
                                />
                              ) : (
                                <div className="px-2 py-1 text-xs font-medium text-ink">
                                  <MathText text={c.description || ""} />
                                </div>
                              )}
                              {!isReadOnly && hasLatexMath(c.description) && (
                                <div className="mt-1 px-2 py-1 rounded bg-surface/80 border border-hairline text-xs text-ink">
                                  <MathText text={c.description || ""} />
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="hidden sm:block flex-1 min-w-0">
                            {!isReadOnly ? (
                              <input
                                type="text"
                                value={c.description || ""}
                                onChange={(e) =>
                                  handleCriterionFieldChange(qIdx, cIdx, "description", e.target.value)
                                }
                                placeholder="Criterion step description..."
                                className="w-full rounded-md border border-hairline bg-surface px-2.5 py-1 text-xs text-ink focus:border-primary focus:outline-none"
                              />
                            ) : (
                              <div className="px-2 py-1 text-xs font-medium text-ink">
                                <MathText text={c.description || ""} />
                              </div>
                            )}
                            {!isReadOnly && hasLatexMath(c.description) && (
                              <div className="mt-1 px-2 py-1 rounded bg-surface/80 border border-hairline text-xs text-ink">
                                <MathText text={c.description || ""} />
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-1.5 sm:pt-0 border-t sm:border-0 border-hairline">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step="0.5"
                                min="0.5"
                                value={c.marks ?? 0}
                                disabled={isReadOnly}
                                onChange={(e) =>
                                  handleCriterionFieldChange(
                                    qIdx,
                                    cIdx,
                                    "marks",
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-16 rounded-md border border-hairline bg-surface px-1.5 py-1 text-xs font-mono text-center font-bold text-ink focus:border-primary focus:outline-none disabled:opacity-75"
                              />
                              <span className="text-xs text-ink-muted">marks</span>
                            </div>
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCriterion(qIdx, cIdx)}
                                className="text-ink-muted hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 p-1 rounded-md transition-colors cursor-pointer"
                                title="Delete step"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {!isReadOnly && (
            <button
              type="button"
              onClick={handleAddQuestion}
              className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-hairline bg-canvas-soft/40 hover:bg-canvas-soft hover:border-primary p-4 text-xs font-semibold text-ink-secondary hover:text-primary transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add Another Question to Rubric
            </button>
          )}
        </div>
      </FeatureCard>
    </div>
  );
}
