"use client";

import React from "react";
import { LifeBuoy, AlertTriangle } from "lucide-react";

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
          <h3 className="text-xs font-bold text-ink">Facing a technical issue?</h3>
          <p className="text-[11px] text-ink-muted leading-relaxed mt-0.5">
            If an answer sheet upload failed, marks are not appearing, or you encounter a visual glitch, send a report with screenshots directly to our technical team.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onReportIssueClick}
        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-md btn-glass-utility text-xs font-semibold shrink-0 cursor-pointer"
      >
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        <span>Report Technical Issue</span>
      </button>
    </div>
  );
});
