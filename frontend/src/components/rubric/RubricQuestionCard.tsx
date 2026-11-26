"use client";

import React from "react";
import { Plus, Trash2, Sparkles, Check } from "lucide-react";
import { RubricQuestion, RubricCriterion } from "@/lib/types";
import { MathText, hasLatexMath } from "@/components/ui";
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

const _criterionUiKeys = new WeakMap<object, string>();
let _criterionUiCounter = 0;
function getCriterionUiKey(c: RubricCriterion): string {
  let k = _criterionUiKeys.get(c);
  if (!k) {
    _criterionUiCounter += 1;
    k = `rubric_crit_${_criterionUiCounter}`;
    _criterionUiKeys.set(c, k);
  }
  return k;
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
    <div className="notion-card rounded-lg p-3.5 sm:p-5 space-y-4">
      {/* Header: ID, Max Marks, Section Pill, Delete Question */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-hairline">
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="text"
            value={question.question_id || ""}
            disabled={isReadOnly}
            onChange={(e) => onQuestionChange(qIdx, "question_id", e.target.value)}
            className="w-20 rounded-xs border border-[#dddddd] dark:border-[#333333] bg-canvas-soft px-2.5 py-1.5 text-xs font-mono font-semibold text-ink text-center focus:border-primary focus:outline-none disabled:opacity-75"
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
              className="w-16 rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface px-2 py-1.5 text-xs font-mono tabular-nums font-semibold text-ink text-center focus:border-primary focus:outline-none disabled:opacity-75"
            />
          </div>
          {question.section_id && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary">
              Section {question.section_id}
            </span>
          )}
        </div>

        {!isReadOnly && (
          <button
            type="button"
            onClick={() => onDeleteQuestion(qIdx)}
            className="notion-btn-danger min-h-[30px] h-7 px-2 text-xs shrink-0"
            title="Delete Question"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            <span className="sm:hidden">Remove</span>
          </button>
        )}
      </div>

      {/* Question Statement */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-ink-secondary">
            Question Statement
          </label>
          {hasQuestionMath && (
            <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-primary">
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
            className="w-full rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface p-2.5 text-xs sm:text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
          />
        )}
        {(isReadOnly || hasQuestionMath) && (
          <div className="rounded-md border border-hairline bg-canvas-soft p-3 text-xs sm:text-sm text-ink leading-relaxed overflow-x-auto">
            <MathText text={questionTitle} />
          </div>
        )}
      </div>

      {/* Official Answer */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-ink-secondary flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>Official Expected Solution / Model Answer</span>
          </label>
          {hasAnswerMath && (
            <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-emerald-700 dark:text-emerald-400">
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
            className="w-full rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface p-2.5 text-xs font-mono text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
          />
        )}
        {(isReadOnly || hasAnswerMath) && (
          <div className="rounded-md border border-hairline bg-canvas-soft p-3 text-xs text-ink leading-relaxed overflow-x-auto">
            <MathText text={question.official_answer || ""} />
          </div>
        )}
      </div>

      {/* Criteria Breakdown */}
      <div className="border-t border-hairline pt-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-semibold text-ink-secondary flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>Partial Marks Step-by-Step Breakdown</span>
          </span>
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => onAddCriterion(qIdx)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span>Add Step</span>
            </button>
          )}
        </div>

        {criteriaList.length === 0 ? (
          <div className="rounded-md border border-dashed border-hairline p-3.5 text-center text-xs text-ink-muted bg-canvas-soft">
            <span>No partial marking criteria defined. Evaluated as a single step ({question.max_marks || 0}m).</span>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => onAddCriterion(qIdx)}
                className="ml-2 text-primary font-medium hover:underline inline-flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="h-3 w-3" /> Add Step Criteria
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {criteriaList.map((criterion, cIdx) => (
              <CriterionRow
                key={getCriterionUiKey(criterion)}
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
