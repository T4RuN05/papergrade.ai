"use client";

import React, { memo } from "react";
import { Trash2 } from "lucide-react";
import { RubricCriterion } from "@/lib/types";
import { MathText, hasLatexMath } from "@/components/ui";

interface CriterionRowProps {
  qIdx: number;
  cIdx: number;
  criterion: RubricCriterion;
  isReadOnly: boolean;
  onFieldChange: (
    qIndex: number,
    cIndex: number,
    field: keyof RubricCriterion,
    value: any
  ) => void;
  onDelete: (qIndex: number, cIndex: number) => void;
}

export const CriterionRow = memo(function CriterionRow({
  qIdx,
  cIdx,
  criterion,
  isReadOnly,
  onFieldChange,
  onDelete,
}: CriterionRowProps) {
  const hasMath = hasLatexMath(criterion.description);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 rounded-md bg-canvas-soft p-2.5 sm:p-3 border border-hairline">
      {/* Criterion Identifier & Description */}
      <div className="flex items-start sm:items-center gap-2 flex-1 min-w-0">
        <input
          type="text"
          value={criterion.criterion_id || ""}
          disabled={isReadOnly}
          onChange={(e) =>
            onFieldChange(qIdx, cIdx, "criterion_id", e.target.value)
          }
          className="w-14 rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface px-1.5 py-1.5 text-xs font-mono text-center font-semibold text-primary focus:border-primary focus:outline-none disabled:opacity-75 shrink-0"
        />

        <div className="flex-1 min-w-0">
          {!isReadOnly ? (
            <input
              type="text"
              value={criterion.description || ""}
              onChange={(e) =>
                onFieldChange(qIdx, cIdx, "description", e.target.value)
              }
              placeholder="Criterion step description..."
              className="w-full rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-primary focus:outline-none"
            />
          ) : (
            <div className="px-1 py-1 text-xs font-medium text-ink overflow-x-auto">
              <MathText text={criterion.description || ""} />
            </div>
          )}
          {!isReadOnly && hasMath && (
            <div className="mt-1.5 px-2.5 py-1.5 rounded-xs bg-surface border border-hairline text-xs text-ink overflow-x-auto">
              <MathText text={criterion.description || ""} />
            </div>
          )}
        </div>
      </div>

      {/* Marks & Delete Action */}
      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-hairline">
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            step="0.5"
            min="0.5"
            value={criterion.marks ?? 0}
            disabled={isReadOnly}
            onChange={(e) =>
              onFieldChange(
                qIdx,
                cIdx,
                "marks",
                parseFloat(e.target.value) || 0
              )
            }
            className="w-16 rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface px-1.5 py-1.5 text-xs font-mono tabular-nums text-center font-semibold text-ink focus:border-primary focus:outline-none disabled:opacity-75"
          />
          <span className="text-xs text-ink-muted">marks</span>
        </div>
        {!isReadOnly && (
          <button
            type="button"
            onClick={() => onDelete(qIdx, cIdx)}
            className="text-ink-muted hover:text-red-600 dark:hover:text-[#f28b82] hover:bg-red-50/70 dark:hover:bg-[#2a1313] p-1.5 rounded-md transition-colors cursor-pointer"
            title="Delete step"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
          </button>
        )}
      </div>
    </div>
  );
});
