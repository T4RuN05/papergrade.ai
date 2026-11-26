"use client";

import React from "react";
import { ArrowRight } from "lucide-react";

export interface StudentSectionHeaderProps {
  title: string;
  subtitle?: string;
  count?: number;
  countLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
  rightSlot?: React.ReactNode;
}

export const StudentSectionHeader = React.memo(function StudentSectionHeader({
  title,
  subtitle,
  count,
  countLabel,
  actionLabel,
  onAction,
  rightSlot,
}: StudentSectionHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-1">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
            {title}
          </h2>
          {typeof count === "number" && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface border border-hairline text-ink-muted tabular-nums">
              {count}
              {countLabel ? ` ${countLabel}` : ""}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs sm:text-[13px] text-ink-muted leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      {rightSlot ? (
        <div className="shrink-0 self-start sm:self-end">{rightSlot}</div>
      ) : actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-active transition-colors shrink-0 self-start sm:self-end cursor-pointer"
        >
          <span>{actionLabel}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
});
