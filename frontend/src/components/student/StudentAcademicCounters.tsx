"use client";

import React from "react";
import { Layers, Award, Sparkles, RotateCcw } from "lucide-react";

export interface StudentAcademicCountersProps {
  totalSubmissionsCount: number;
  publishedCount: number;
  avgPercentage: string | null;
  activeRevalsCount: number;
}

export const StudentAcademicCounters = React.memo(function StudentAcademicCounters({
  totalSubmissionsCount,
  publishedCount,
  avgPercentage,
  activeRevalsCount,
}: StudentAcademicCountersProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 cascade-fast">
      <div className="rounded-lg border border-hairline bg-surface p-2.5 sm:p-3.5 shadow-2xs">
        <div className="flex items-center justify-between text-ink-muted">
          <span className="text-[10px] sm:text-[11px] font-medium">Submitted</span>
          <Layers className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="text-lg sm:text-xl font-bold text-ink mt-1">{totalSubmissionsCount}</div>
        <div className="text-[9.5px] sm:text-[10px] text-ink-muted mt-0.5 truncate">Verified sheets</div>
      </div>

      <div className="rounded-lg border border-hairline bg-surface p-2.5 sm:p-3.5 shadow-2xs">
        <div className="flex items-center justify-between text-ink-muted">
          <span className="text-[10px] sm:text-[11px] font-medium">Published</span>
          <Award className="h-3.5 w-3.5 text-[#1aae39]" />
        </div>
        <div className="text-lg sm:text-xl font-bold text-ink mt-1">{publishedCount}</div>
        <div className="text-[9.5px] sm:text-[10px] text-ink-muted mt-0.5 truncate">Official scores</div>
      </div>

      <div className="rounded-lg border border-hairline bg-surface p-2.5 sm:p-3.5 shadow-2xs">
        <div className="flex items-center justify-between text-ink-muted">
          <span className="text-[10px] sm:text-[11px] font-medium">Average</span>
          <Sparkles className="h-3.5 w-3.5 text-[#793caf]" />
        </div>
        <div className="text-lg sm:text-xl font-bold text-ink mt-1">
          {avgPercentage !== null ? `${avgPercentage}%` : "—"}
        </div>
        <div className="text-[9.5px] sm:text-[10px] text-ink-muted mt-0.5 truncate">All exams</div>
      </div>

      <div className="rounded-lg border border-hairline bg-surface p-2.5 sm:p-3.5 shadow-2xs">
        <div className="flex items-center justify-between text-ink-muted">
          <span className="text-[10px] sm:text-[11px] font-medium">Revaluations</span>
          <RotateCcw className="h-3.5 w-3.5 text-[#d97706]" />
        </div>
        <div className="text-lg sm:text-xl font-bold text-ink mt-1">{activeRevalsCount}</div>
        <div className="text-[9.5px] sm:text-[10px] text-ink-muted mt-0.5 truncate">
          {activeRevalsCount > 0 ? "Under review" : "No appeals"}
        </div>
      </div>
    </div>
  );
});
