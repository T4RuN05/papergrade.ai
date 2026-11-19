"use client";

import React from "react";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { RubricQuestion, RubricCriterion } from "@/lib/types";
import { BadgePill, MathText, hasLatexMath } from "@/components/ui";
import { CriterionRow } from "./CriterionRow";

interface RubricQuestionCardProps {
  question: RubricQuestion;
  qIdx: number;
  isReadOnly: boolean;
  onQuestionChange: (index: number, field: keyof RubricQuestion, value: any) => void;
  onDeleteQuestion: (index: number) => void;
  onAddCriterion: (qIndex: number) => void;
  onDeleteCriterion: (qIndex: number, cIndex: number) => void;
  onCriterionFieldChange: (
    qIndex: number,
    cIndex: number,
    field: keyof RubricCriterion,
    value: any
  ) => void;
}

export function RubricQuestionCard({
  question,
  qIdx,
  isReadOnly,
  onQuestionChange,
  onDeleteQuestion,
  onAddCriterion,
  onDeleteCriterion,
  onCriterionFieldChange,
}: RubricQuestionCardProps) {
  const criteriaList = Array.isArray(question.criteria) ? question.criteria : [];
  const questionTitle = question.question_text || (question as any).title || "";
  const hasQuestionMath = hasLatexMath(questionTitle);
  const hasAnswerMath = hasLatexMath(question.official_answer);

  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 sm:p-5 space-y-4 shadow-xs transition-colors hover:border-hairline">
      {/* Header: ID, Max Marks, Section Pill, Delete Question */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={question.question_id || ""}
            disabled={isReadOnly}
            onChange={(e) => onQuestionChange(qIdx, "question_id", e.target.value)}
            className="w-20 rounded-md border border-hairline bg-canvas-soft px-2.5 py-1 text-xs font-mono font-bold text-ink text-center focus:border-primary focus:outline-none disabled:opacity-75"
          />
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="font-medium">Max Marks:</span>
            <input
              type="number"
              step="0.5"
              min="0.5"
              value={question.max_marks ?? 0}
              disabled={isReadOnly}
              onChange={(e) =>
                onQuestionChange(qIdx, "max_marks", parseFloat(e.target.value) || 0)
              }
              className="w-16 rounded-md border border-hairline bg-surface px-2 py-1 text-xs font-mono font-bold text-ink text-center focus:border-primary focus:outline-none disabled:opacity-75"
            />
          </div>
          {question.section_id && (
            <BadgePill label={`Section ${question.section_id}`} color="sky" />
          )}
        </div>

        {!isReadOnly && (
          <button
            type="button"
            onClick={() => onDeleteQuestion(qIdx)}
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
          {hasQuestionMath && (
            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              KaTeX Math
            </span>
          )}
        </div>
        {!isReadOnly && (
          <textarea
            rows={2}
            value={questionTitle}
            onChange={(e) => onQuestionChange(qIdx, "question_text", e.target.value)}
            placeholder="Enter question statement (KaTeX supported)..."
            className="w-full rounded-md border border-hairline bg-surface p-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
          />
        )}
        {(isReadOnly || hasQuestionMath) && (
          <div
            className={`${
              !isReadOnly ? "mt-1.5" : ""
            } rounded-md border border-hairline bg-canvas-soft/60 p-2.5 text-xs text-ink leading-relaxed`}
          >
            <MathText text={questionTitle} />
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
          {hasAnswerMath && (
            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-[#86d4a4]">
              KaTeX Math
            </span>
          )}
        </div>
        {!isReadOnly && (
          <textarea
            rows={2}
            value={question.official_answer || ""}
            onChange={(e) => onQuestionChange(qIdx, "official_answer", e.target.value)}
            placeholder="Enter official expected answer..."
            className="w-full rounded-md border border-hairline bg-canvas-soft/30 p-2.5 text-xs font-mono text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
          />
        )}
        {(isReadOnly || hasAnswerMath) && (
          <div
            className={`${
              !isReadOnly ? "mt-1.5" : ""
            } rounded-md border border-emerald-200/60 dark:border-[#1a3324] bg-emerald-50/50 dark:bg-[#101d15] p-2.5 text-xs text-emerald-950 dark:text-[#86d4a4] leading-relaxed`}
          >
            <MathText text={question.official_answer || ""} />
          </div>
        )}
      </div>

      {/* Criteria Breakdown */}
      <div className="border-t border-hairline pt-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-secondary flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Partial Marks Step-by-Step Breakdown
          </span>
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => onAddCriterion(qIdx)}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              Add Step
            </button>
          )}
        </div>

        {criteriaList.length === 0 ? (
          <div className="rounded-md border border-dashed border-hairline p-3 text-center text-xs text-ink-muted bg-canvas-soft/40">
            <span>No partial marking criteria defined. Evaluated as a single step ({question.max_marks || 0}m).</span>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => onAddCriterion(qIdx)}
                className="ml-2 text-primary font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="h-3 w-3" /> Add Step Criteria
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {criteriaList.map((criterion, cIdx) => (
              <CriterionRow
                key={cIdx}
                qIdx={qIdx}
                cIdx={cIdx}
                criterion={criterion}
                isReadOnly={isReadOnly}
                onFieldChange={onCriterionFieldChange}
                onDelete={onDeleteCriterion}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
