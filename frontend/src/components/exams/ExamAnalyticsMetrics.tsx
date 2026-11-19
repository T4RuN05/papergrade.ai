"use client";

import React from "react";
import { Users, FileCheck2, BarChart3, AlertTriangle } from "lucide-react";
import { FeatureCard } from "@/components/ui";

interface ExamAnalyticsMetricsProps {
  totalSubmissions: number;
  evaluatedCount: number;
  averagePercentage: number;
  needsReviewCount: number;
}

export function ExamAnalyticsMetrics({
  totalSubmissions,
  evaluatedCount,
  averagePercentage,
  needsReviewCount,
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
          <div className="text-xl sm:text-2xl font-bold font-mono text-ink">
            {totalSubmissions}
          </div>
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
          <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-600">
            {evaluatedCount} / {totalSubmissions}
          </div>
          <p className="text-[11px] text-ink-muted">{percentGraded}% evaluation rate</p>
        </FeatureCard>

        {/* Class Average */}
        <FeatureCard className="p-3.5 sm:p-4 space-y-1">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">
              Class Average
            </span>
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-primary">
            {totalSubmissions > 0 ? `${averagePercentage}%` : "—"}
          </div>
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
          <div className="text-xl sm:text-2xl font-bold font-mono text-amber-600">
            {needsReviewCount}
          </div>
          <p className="text-[11px] text-ink-muted">Flagged for human inspection</p>
        </FeatureCard>
      </div>

      {/* Progress Bar */}
      {totalSubmissions > 0 && (
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
