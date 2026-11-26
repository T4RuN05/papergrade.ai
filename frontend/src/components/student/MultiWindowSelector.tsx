"use client";

import React from "react";

export interface ActiveWindowItem {
  exam: {
    id: string;
    title: string;
    subject?: string;
  };
  window_status: {
    is_active?: boolean;
    seconds_remaining?: number;
    is_in_grace?: boolean;
  };
}

export interface MultiWindowSelectorProps {
  activeWindows: ActiveWindowItem[];
  selectedExamId: string | null;
  onSelectExam: (examId: string) => void;
  uploading: boolean;
  hasStagedPages: boolean;
}

export const MultiWindowSelector = React.memo(function MultiWindowSelector({
  activeWindows,
  selectedExamId,
  onSelectExam,
  uploading,
  hasStagedPages,
}: MultiWindowSelectorProps) {
  if (activeWindows.length <= 1) return null;

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="notion-card p-3.5 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#1aae39]" />
          <span className="text-xs font-semibold text-ink">
            {activeWindows.length} Exam Windows Currently Open
          </span>
        </div>
        <span className="text-xs text-ink-muted">Select exam to submit</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {activeWindows.map((winItem) => {
          const isSelected = winItem.exam?.id === selectedExamId;
          const remaining = winItem.window_status?.seconds_remaining || 0;
          return (
            <button
              key={winItem.exam.id}
              type="button"
              disabled={uploading}
              onClick={() => {
                if (uploading) return;
                if (hasStagedPages && !isSelected) {
                  if (
                    !confirm(
                      "You have scanned pages staged for upload. Switching exams will clear them. Continue?"
                    )
                  ) {
                    return;
                  }
                }
                onSelectExam(winItem.exam.id);
              }}
              className={`flex items-center justify-between p-3 rounded-md text-left transition-colors border ${
                isSelected
                  ? "bg-canvas-soft border-primary ring-1 ring-primary"
                  : "bg-surface hover:bg-canvas-soft border-hairline text-ink-secondary"
              } ${uploading ? "opacity-50 cursor-not-allowed pointer-events-none" : "cursor-pointer"}`}
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      isSelected ? "bg-primary" : "bg-ink-faint"
                    }`}
                  />
                  <span className="text-xs font-semibold text-ink truncate">
                    {winItem.exam.title}
                  </span>
                </div>
                <p className="text-xs text-ink-muted truncate pl-4 mt-0.5">
                  {winItem.exam.subject || "General"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-xs bg-surface border border-hairline text-ink tabular-nums">
                  {formatTimer(remaining)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});
