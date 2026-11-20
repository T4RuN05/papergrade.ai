"use client";

import React from "react";
import Link from "next/link";
import { LifeBuoy, AlertTriangle, BookOpen } from "lucide-react";

export interface StudentSupportCardProps {
  onReportIssueClick: () => void;
}

export const StudentSupportCard = React.memo(function StudentSupportCard({
  onReportIssueClick,
}: StudentSupportCardProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-surface border border-hairline relative overflow-hidden shadow-2xs">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-ink-muted/30" />
      <div className="flex items-start sm:items-center gap-3 pl-1">
        <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline text-ink-muted flex items-center justify-center shrink-0">
          <LifeBuoy className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-xs font-bold text-ink">Need guidance or facing an issue?</h3>
          <p className="text-[11px] text-ink-muted leading-relaxed mt-0.5">
            Read the complete step-by-step user manual or file a technical bug report directly with our engineering desk.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
        <Link
          href="/help/student/taking-exams-and-scanning"
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-canvas-soft border border-hairline text-xs font-semibold text-ink hover:text-primary transition-colors shrink-0"
        >
          <BookOpen className="h-3.5 w-3.5 text-primary" />
          <span>User Manual</span>
        </Link>
        <button
          type="button"
          onClick={onReportIssueClick}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-md btn-glass-utility text-xs font-semibold shrink-0 cursor-pointer"
        >
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span>Report Technical Issue</span>
        </button>
      </div>
    </div>
  );
});
