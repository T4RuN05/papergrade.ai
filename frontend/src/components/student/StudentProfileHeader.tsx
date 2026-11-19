"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui";

export interface StudentProfileHeaderProps {
  user: {
    full_name?: string;
    roll_number?: string;
    student?: {
      roll_number?: string;
    };
  } | null;
  onReportIssueClick: () => void;
  isLoading?: boolean;
}

export const StudentProfileHeader = React.memo(function StudentProfileHeader({
  user,
  onReportIssueClick,
  isLoading = false,
}: StudentProfileHeaderProps) {
  const rollNumber = user?.roll_number || user?.student?.roll_number || "Enrolled";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-3 border-b border-hairline">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {isLoading && !user ? (
            <Skeleton className="h-7 w-48 rounded-md" />
          ) : (
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              Welcome, {user?.full_name || "Student"}
            </h1>
          )}
        </div>
        <div className="text-xs text-ink-muted mt-1 leading-normal flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {isLoading && !user ? (
            <Skeleton className="h-4 w-32 rounded" />
          ) : (
            <>
              <span className="whitespace-nowrap">
                Roll No: <strong className="text-ink font-medium font-mono">{rollNumber}</strong>
              </span>
              <span className="text-ink-faint hidden xs:inline">•</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onReportIssueClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold btn-glass-utility transition-all cursor-pointer shadow-2xs"
          title="Report a technical issue with the portal"
        >
          <AlertTriangle className="h-3.5 w-3.5 text-primary" />
          <span>Report Issue</span>
        </button>
      </div>
    </div>
  );
});
