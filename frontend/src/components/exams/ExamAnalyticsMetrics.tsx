"use client";

import React from "react";
import { Users, FileCheck2, BarChart3, AlertTriangle } from "lucide-react";
import { FeatureCard, MetricValue, Skeleton } from "@/components/ui";

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Submissions */}
        <FeatureCard className="p-3.5 sm:p-4 space-y-1">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">
              Total Submissions
            </span>
            <Users className="h-4 w-4" />
          </div>
          <MetricValue
            isLoading={isLoading}
            value={totalSubmissions}
            className="text-xl sm:text-2xl font-bold font-mono text-ink"
            width="w-12"
          />
          <p className="text-[11px] text-ink-muted">Answer sheets ingested</p>
        </FeatureCard>

        {/* Evaluated Scripts */}
        <FeatureCard className="p-3.5 sm:p-4 space-y-1">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">
              Evaluated
            </span>
            <FileCheck2 className="h-4 w-4 text-emerald-600" />
          </div>
          {isLoading ? (
            <Skeleton className="h-7 sm:h-8 w-20 rounded font-mono my-0.5" />
          ) : (
            <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-600">
              {evaluatedCount} / {totalSubmissions}
            </div>
          )}
          <p className="text-[11px] text-ink-muted">
            {isLoading ? "Calculating..." : `${percentGraded}% evaluation rate`}
          </p>
        </FeatureCard>

        {/* Class Average */}
        <FeatureCard className="p-3.5 sm:p-4 space-y-1">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">
              Class Average
            </span>
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <MetricValue
            isLoading={isLoading}
            value={totalSubmissions > 0 ? `${averagePercentage}%` : "—"}
            className="text-xl sm:text-2xl font-bold font-mono text-primary"
            width="w-16"
          />
          <p className="text-[11px] text-ink-muted">Across graded submissions</p>
        </FeatureCard>

        {/* Needs Review */}
        <FeatureCard className="p-3.5 sm:p-4 space-y-1">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">
              Needs Review
            </span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <MetricValue
            isLoading={isLoading}
            value={needsReviewCount}
            className="text-xl sm:text-2xl font-bold font-mono text-amber-600"
            width="w-8"
          />
          <p className="text-[11px] text-ink-muted">Flagged for human inspection</p>
        </FeatureCard>
      </div>

      {/* Progress Bar */}
      {!isLoading && totalSubmissions > 0 && (
        <div className="w-full bg-canvas-soft rounded-full h-1.5 overflow-hidden border border-hairline">
          <div
            className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percentGraded}%` }}
          />
        </div>
      )}
    </div>
  );
}
