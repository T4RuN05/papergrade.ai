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
    <div className="notion-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-md bg-canvas-soft border border-hairline text-ink-secondary flex items-center justify-center shrink-0">
          <LifeBuoy className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink tracking-[-0.005em]">
            Need guidance or facing an issue?
          </h3>
          <p className="text-xs text-ink-muted leading-relaxed mt-0.5">
            Read step-by-step instructions in the User Manual or report a problem directly.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 shrink-0 w-full sm:w-auto">
        <Link
          href="/help/student/taking-exams-and-scanning"
          className="h-9 px-3.5 rounded-md text-xs notion-btn-utility inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
        >
          <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>User Manual</span>
        </Link>
        <button
          type="button"
          onClick={onReportIssueClick}
          className="h-9 px-3.5 rounded-md text-xs notion-btn-utility inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <AlertTriangle className="h-3.5 w-3.5 text-ink-secondary shrink-0" />
          <span>Report Issue</span>
        </button>
      </div>
    </div>
  );
});
