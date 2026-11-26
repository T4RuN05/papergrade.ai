"use client";

import React from "react";
import { Unlock, FileCheck2, Loader2 } from "lucide-react";

interface RubricHeaderToolbarProps {
  examTitle: string;
  subject: string;
  questionCount: number;
  totalMarks: number;
  isApproved: boolean;
  isSubmitting: boolean;
  isUnlocking: boolean;
  onApprove: () => void;
  onUnlock?: () => void;
}

export function RubricHeaderToolbar({
  examTitle,
  subject,
  questionCount,
  totalMarks,
  isApproved,
  isSubmitting,
  isUnlocking,
  onApprove,
  onUnlock,
}: RubricHeaderToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-hairline">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="notion-heading-2 text-xl sm:text-2xl text-ink break-words">
            {examTitle || "Examination Rubric Studio"}
          </h2>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary whitespace-nowrap">
            <span className={`w-1.5 h-1.5 rounded-full ${isApproved ? "bg-emerald-500" : "bg-amber-500"}`} />
            {isApproved ? "Approved & Locked" : "Draft Pending Approval"}
          </span>
        </div>
        <p className="text-xs text-ink-muted">
          Subject: <span className="font-medium text-ink-secondary">{subject}</span> • Questions:{" "}
          <span className="font-medium text-ink-secondary tabular-nums">{questionCount}</span>
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto shrink-0">
        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 sm:gap-0 px-3 py-2 sm:px-0 sm:py-0 rounded-md sm:rounded-none bg-canvas-soft sm:bg-transparent border sm:border-0 border-hairline">
          <span className="text-xs font-medium text-ink-muted">
            Total Marks
          </span>
          <div className="font-mono tabular-nums text-lg sm:text-2xl font-bold text-primary">
            {totalMarks}
          </div>
        </div>

        {isApproved ? (
          onUnlock && (
            <button
              type="button"
              onClick={onUnlock}
              disabled={isUnlocking}
              className="notion-btn-utility w-full sm:w-auto justify-center disabled:opacity-50"
              title="Unlock rubric to edit questions or criteria"
            >
              {isUnlocking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              ) : (
                <Unlock className="h-3.5 w-3.5 text-ink-secondary shrink-0" />
              )}
              <span>{isUnlocking ? "Unlocking..." : "Unlock Rubric to Edit"}</span>
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={onApprove}
            disabled={isSubmitting}
            className="notion-btn-primary w-full sm:w-auto justify-center disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            ) : (
              <FileCheck2 className="h-4 w-4 shrink-0" />
            )}
            <span>{isSubmitting ? "Locking..." : "Approve & Lock Rubric"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
