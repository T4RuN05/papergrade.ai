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
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md bg-canvas-soft p-2.5 border border-hairline">
      {/* Criterion Identifier */}
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <input
          type="text"
          value={criterion.criterion_id || ""}
          disabled={isReadOnly}
          onChange={(e) =>
            onFieldChange(qIdx, cIdx, "criterion_id", e.target.value)
          }
          className="w-14 rounded-md border border-hairline bg-surface px-1.5 py-1 text-xs font-mono text-center font-bold text-primary focus:border-primary focus:outline-none disabled:opacity-75 shrink-0"
        />

        {/* Mobile Description Input */}
        <div className="flex-1 sm:hidden">
          {!isReadOnly ? (
            <input
              type="text"
              value={criterion.description || ""}
              onChange={(e) =>
                onFieldChange(qIdx, cIdx, "description", e.target.value)
              }
              placeholder="Criterion description..."
              className="w-full rounded-md border border-hairline bg-surface px-2.5 py-1 text-xs text-ink focus:border-primary focus:outline-none"
            />
          ) : (
            <div className="px-2 py-1 text-xs font-medium text-ink">
              <MathText text={criterion.description || ""} />
            </div>
          )}
          {!isReadOnly && hasMath && (
            <div className="mt-1 px-2 py-1 rounded bg-surface/80 border border-hairline text-xs text-ink">
              <MathText text={criterion.description || ""} />
            </div>
          )}
        </div>
      </div>

      {/* Desktop Description Input */}
      <div className="hidden sm:block flex-1 min-w-0">
        {!isReadOnly ? (
          <input
            type="text"
            value={criterion.description || ""}
            onChange={(e) =>
              onFieldChange(qIdx, cIdx, "description", e.target.value)
            }
            placeholder="Criterion step description..."
            className="w-full rounded-md border border-hairline bg-surface px-2.5 py-1 text-xs text-ink focus:border-primary focus:outline-none"
          />
        ) : (
          <div className="px-2 py-1 text-xs font-medium text-ink">
            <MathText text={criterion.description || ""} />
          </div>
        )}
        {!isReadOnly && hasMath && (
          <div className="mt-1 px-2 py-1 rounded bg-surface/80 border border-hairline text-xs text-ink">
            <MathText text={criterion.description || ""} />
          </div>
        )}
      </div>

      {/* Marks & Delete Action */}
      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-1.5 sm:pt-0 border-t sm:border-0 border-hairline">
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
            className="w-16 rounded-md border border-hairline bg-surface px-1.5 py-1 text-xs font-mono text-center font-bold text-ink focus:border-primary focus:outline-none disabled:opacity-75"
          />
          <span className="text-xs text-ink-muted">marks</span>
        </div>
        {!isReadOnly && (
          <button
            type="button"
            onClick={() => onDelete(qIdx, cIdx)}
            className="text-ink-muted hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 p-1 rounded-md transition-colors cursor-pointer"
            title="Delete step"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});
