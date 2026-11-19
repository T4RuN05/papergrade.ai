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
    <div className="p-3 sm:p-4 rounded-xl bg-gradient-to-r from-blue-50/90 to-indigo-50/70 border border-blue-200/90 shadow-2xs space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold text-blue-950 uppercase tracking-wider">
            {activeWindows.length} Exam Windows Currently Open
          </span>
        </div>
        <span className="text-[11px] font-medium text-blue-700">Select paper to submit:</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
              className={`flex items-center justify-between p-3 rounded-lg text-left transition-all border ${
                isSelected
                  ? "bg-surface dark:bg-[#202020] border-primary shadow-sm ring-1.5 ring-primary"
                  : "bg-surface/80 dark:bg-[#1a1a1a] hover:bg-surface border-hairline hover:border-primary/50 text-ink-secondary"
              } ${uploading ? "opacity-50 cursor-not-allowed pointer-events-none" : "cursor-pointer"}`}
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      isSelected ? "bg-primary" : "bg-slate-300"
                    }`}
                  />
                  <span className="text-xs font-bold text-ink truncate">
                    {winItem.exam.title}
                  </span>
                </div>
                <p className="text-[11px] text-ink-muted truncate pl-3.5">
                  {winItem.exam.subject || "General"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                    remaining < 300
                      ? "bg-amber-100 text-amber-900 border border-amber-200"
                      : "bg-blue-100/80 text-blue-900 border border-blue-200"
                  }`}
                >
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
