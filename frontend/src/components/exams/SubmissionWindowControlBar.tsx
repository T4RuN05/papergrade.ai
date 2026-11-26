"use client";

import React from "react";
import { Clock, Plus, Lock, AlertCircle, Play } from "lucide-react";
import { ButtonPrimary, ButtonUtility, StatusWell, Skeleton } from "@/components/ui";
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
  isRubricApproved = true,
  onOpenWindowModal,
  onExtendWindow,
  onCloseWindow,
}: SubmissionWindowControlBarProps) {
  const isActive = Boolean(windowStatus?.is_active);

  // Derive zero-network monotonic countdown using our dedicated hook (called unconditionally at top)
  const { formatted, isExpired } = useWindowCountdown(windowStatus as any);

  // If exam results are published, submissions are permanently closed and finalized
  if (isPublished) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-lg bg-surface border border-hairline shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/50 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-ink flex items-center gap-1.5 flex-wrap">
              <span>Submission Window:</span>
              <span className="text-purple-700 dark:text-purple-400 font-semibold whitespace-nowrap">
                Closed (Published)
              </span>
            </div>
            <p className="text-[11px] text-ink-muted">
              Results published. Submissions closed permanently.
            </p>
          </div>
        </div>

        <span
          className="h-8 px-2.5 rounded-md border border-hairline/80 bg-surface text-ink-muted text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs select-none self-start sm:self-auto shrink-0"
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
      <StatusWell
        variant="green"
        icon={<Clock className="h-5 w-5 text-emerald-600 dark:text-emerald-400 animate-pulse" />}
        title={
          <div className="flex items-center gap-2 flex-wrap">
            <span>Student Submission Window is LIVE</span>
            <span className="font-mono text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 px-2 py-0.5 rounded-md tracking-wider">
              ⏱ {formatted}
            </span>
          </div>
        }
        description={
          windowStatus?.reason
            ? `Session: ${windowStatus.reason}`
            : "Students can submit their answer sheets via their mobile PWA portal."
        }
        badge={
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <ButtonUtility
              size="sm"
              onClick={onExtendWindow}
              isLoading={isExtendingWindow}
              icon={<Plus className="h-3.5 w-3.5" />}
              className="text-xs"
              title="Add 15 minutes to submission window"
            >
              {isExtendingWindow ? "Extending..." : "15 Min"}
            </ButtonUtility>
            <ButtonUtility
              size="sm"
              variant="danger"
              onClick={onCloseWindow}
              isLoading={isClosingWindow}
              icon={<Lock className="h-3.5 w-3.5" />}
              className="text-xs"
              title="Close submission window now"
            >
              {isClosingWindow ? "Closing..." : "Close Window"}
            </ButtonUtility>
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-lg bg-surface border border-hairline shadow-2xs">
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-full bg-canvas-soft border border-hairline flex items-center justify-center text-ink-muted shrink-0">
          <Clock className="h-4 w-4" />
        </div>
        <div>
          <div className="text-xs font-bold text-ink flex items-center gap-1.5 flex-wrap">
            <span>Submission Window:</span>
            <span className="text-ink-muted font-medium whitespace-nowrap">Closed</span>
          </div>
          <p className="text-[11px] text-ink-muted">
            Uploads blocked until opened by operator.
          </p>
        </div>
      </div>

      {isLoading && !windowStatus ? (
        <Skeleton className="h-8 w-44 rounded-md shrink-0 self-start sm:self-auto" />
      ) : (
        <ButtonPrimary
          size="sm"
          onClick={onOpenWindowModal}
          isLoading={isOpeningWindow}
          icon={<Clock className="h-3.5 w-3.5 shrink-0" />}
          className="self-start sm:self-auto shrink-0 shadow-2xs cursor-pointer"
        >
          {isOpeningWindow ? "Starting Session..." : "Open Window"}
        </ButtonPrimary>
      )}
    </div>
  );
}
