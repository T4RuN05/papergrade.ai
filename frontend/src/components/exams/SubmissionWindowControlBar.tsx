"use client";

import React from "react";
import { Clock, Plus, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { useWindowCountdown } from "@/hooks/useWindowCountdown";

interface WindowStatusData {
  is_active: boolean;
  deadline_at?: string | null;
  seconds_remaining?: number;
  reason?: string;
  scope?: string;
}

interface SubmissionWindowControlBarProps {
  windowStatus?: WindowStatusData | null;
  isOpeningWindow?: boolean;
  isExtendingWindow?: boolean;
  isClosingWindow?: boolean;
  isLoading?: boolean;
  isPublished?: boolean;
  isRubricApproved?: boolean;
  onOpenWindowModal: () => void;
  onExtendWindow: () => void;
  onCloseWindow: () => void;
}

export function SubmissionWindowControlBar({
  windowStatus,
  isOpeningWindow = false,
  isExtendingWindow = false,
  isClosingWindow = false,
  isLoading = false,
  isPublished = false,
  onOpenWindowModal,
  onExtendWindow,
  onCloseWindow,
}: SubmissionWindowControlBarProps) {
  const isActive = Boolean(windowStatus?.is_active);
  const { formatted, isExpired } = useWindowCountdown(windowStatus as any);

  if (isPublished) {
    return (
      <div className="notion-card rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
            <Lock className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-ink flex items-center gap-2 flex-wrap">
              <span>Submission Window:</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Closed (Published)
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              Results published. Submissions closed permanently.
            </p>
          </div>
        </div>

        <span
          className="h-9 px-3 rounded-md border border-hairline bg-canvas-soft text-ink-muted text-xs font-medium inline-flex items-center gap-1.5 select-none self-start sm:self-auto shrink-0"
          title="Results have been published. Submissions are permanently closed."
        >
          <Lock className="h-3.5 w-3.5 text-ink-muted shrink-0" />
          <span>Finalized</span>
        </span>
      </div>
    );
  }

  const displayActive = isActive && !isExpired;

  if (displayActive) {
    return (
      <div className="notion-card rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-emerald-200/80 dark:border-[#1d3d2a]">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-emerald-600 shrink-0 relative">
            <Clock className="h-4 w-4" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-surface" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-ink flex items-center gap-2 flex-wrap">
              <span>Student Submission Window is Live</span>
              <span className="font-mono tabular-nums text-xs font-semibold text-ink bg-canvas-soft border border-hairline px-2 py-0.5 rounded-xs">
                {formatted}
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              {windowStatus?.reason
                ? `Session: ${windowStatus.reason}`
                : "Students can submit their answer sheets via their mobile PWA portal."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={onExtendWindow}
            disabled={isExtendingWindow}
            className="notion-btn-utility justify-center disabled:opacity-50"
            title="Add 15 minutes to submission window"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span>{isExtendingWindow ? "Extending..." : "+15 Min"}</span>
          </button>
          <button
            type="button"
            onClick={onCloseWindow}
            disabled={isClosingWindow}
            className="notion-btn-danger justify-center disabled:opacity-50"
            title="Close submission window now"
          >
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>{isClosingWindow ? "Closing..." : "Close Window"}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="notion-card rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-muted shrink-0">
          <Clock className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-ink flex items-center gap-2 flex-wrap">
            <span>Submission Window:</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-ink-faint" />
              Closed
            </span>
          </div>
          <p className="text-xs text-ink-muted mt-0.5">
            Uploads blocked until opened by operator.
          </p>
        </div>
      </div>

      {isLoading && !windowStatus ? (
        <Skeleton className="h-9 w-36 rounded-md shrink-0 self-start sm:self-auto" />
      ) : (
        <button
          type="button"
          onClick={onOpenWindowModal}
          disabled={isOpeningWindow}
          className="notion-btn-primary w-full sm:w-auto justify-center shrink-0 disabled:opacity-50"
        >
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{isOpeningWindow ? "Starting Session..." : "Open Window"}</span>
        </button>
      )}
    </div>
  );
}
