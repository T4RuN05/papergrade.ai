"use client";

import React from "react";
import { Users, FileCheck2, BarChart3, AlertTriangle } from "lucide-react";
import { AnimatedNumber, MetricValue, NumberFlowGroup, Skeleton } from "@/components/ui";

interface ExamAnalyticsMetricsProps {
  totalSubmissions?: number;
  evaluatedCount?: number;
  averagePercentage?: number;
  needsReviewCount?: number;
  isLoading?: boolean;
}

export function ExamAnalyticsMetrics({
  totalSubmissions = 0,
  evaluatedCount = 0,
  averagePercentage = 0,
  needsReviewCount = 0,
  isLoading = false,
}: ExamAnalyticsMetricsProps) {
  const percentGraded =
    totalSubmissions > 0
      ? Math.round((evaluatedCount / totalSubmissions) * 100)
      : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 cascade-fast">
        {/* Total Submissions */}
        <div className="notion-card rounded-lg p-3.5 sm:p-4 flex flex-col justify-between min-h-[104px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-muted truncate">
              Submissions
            </span>
            <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
              <Users className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <MetricValue
              isLoading={isLoading}
              value={totalSubmissions}
              className="notion-heading-3 text-[22px] text-ink tabular-nums"
              width="w-10"
            />
          </div>
          <div className="text-xs text-ink-muted mt-1 truncate">
            Answer sheets ingested
          </div>
        </div>

        {/* Evaluated Scripts */}
        <div className="notion-card rounded-lg p-3.5 sm:p-4 flex flex-col justify-between min-h-[104px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-muted truncate">
              Evaluated
            </span>
            <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
              <FileCheck2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-2">
            {isLoading ? (
              <Skeleton className="h-7 w-16 rounded-md" />
            ) : (
              <NumberFlowGroup>
                <div className="notion-heading-3 text-[22px] text-ink tabular-nums inline-flex items-baseline gap-1">
                  <AnimatedNumber value={evaluatedCount} format={{ maximumFractionDigits: 0 }} />
                  <span className="text-ink-faint font-normal">/</span>
                  <AnimatedNumber value={totalSubmissions} format={{ maximumFractionDigits: 0 }} />
                </div>
              </NumberFlowGroup>
            )}
          </div>
          <div className="text-xs text-ink-muted mt-1 truncate">
            {isLoading ? (
              "Calculating..."
            ) : (
              <>
                <AnimatedNumber value={percentGraded} suffix="%" format={{ maximumFractionDigits: 0 }} /> evaluation rate
              </>
            )}
          </div>
        </div>

        {/* Class Average */}
        <div className="notion-card rounded-lg p-3.5 sm:p-4 flex flex-col justify-between min-h-[104px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-muted truncate">
              Class Average
            </span>
            <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
              <BarChart3 className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <MetricValue
              isLoading={isLoading}
              value={totalSubmissions > 0 ? `${averagePercentage}%` : "—"}
              className="notion-heading-3 text-[22px] text-ink tabular-nums"
              width="w-14"
            />
          </div>
          <div className="text-xs text-ink-muted mt-1 truncate">
            Across graded scripts
          </div>
        </div>

        {/* Needs Review */}
        <div className="notion-card rounded-lg p-3.5 sm:p-4 flex flex-col justify-between min-h-[104px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-muted truncate">
              Needs Review
            </span>
            <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <MetricValue
              isLoading={isLoading}
              value={needsReviewCount}
              className="notion-heading-3 text-[22px] text-ink tabular-nums"
              width="w-8"
            />
          </div>
          <div className="text-xs text-ink-muted mt-1 truncate">
            Flagged for inspection
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {!isLoading && totalSubmissions > 0 && (
        <div className="w-full bg-surface rounded-full h-1.5 overflow-hidden border border-hairline">
          <div
            className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percentGraded}%` }}
          />
        </div>
      )}
    </div>
  );
}
