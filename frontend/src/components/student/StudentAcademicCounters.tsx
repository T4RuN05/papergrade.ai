"use client";

import React from "react";
import { Layers, Award, TrendingUp, RotateCcw } from "lucide-react";
import { MetricValue } from "@/components/ui";

export interface StudentAcademicCountersProps {
  totalSubmissionsCount: number;
  publishedCount: number;
  avgPercentage: string | null;
  activeRevalsCount: number;
  isLoading?: boolean;
}

export const StudentAcademicCounters = React.memo(function StudentAcademicCounters({
  totalSubmissionsCount,
  publishedCount,
  avgPercentage,
  activeRevalsCount,
  isLoading = false,
}: StudentAcademicCountersProps) {
  const items = [
    {
      label: "Submitted",
      value: totalSubmissionsCount,
      caption: "Answer sheets",
      width: "w-8",
      icon: Layers,
    },
    {
      label: "Published",
      value: publishedCount,
      caption: "Official scores",
      width: "w-8",
      icon: Award,
    },
    {
      label: "Average",
      value: avgPercentage !== null ? `${avgPercentage}%` : "—",
      caption: "Across published",
      width: "w-14",
      icon: TrendingUp,
    },
    {
      label: "Under Review",
      value: activeRevalsCount,
      caption: "Open appeals",
      width: "w-8",
      icon: RotateCcw,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 cascade-fast">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="notion-card p-3.5 sm:p-4 flex flex-col justify-between min-h-[104px]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">
                {item.label}
              </span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <Icon className="h-3.5 w-3.5" />
              </span>
            </div>

            <div className="mt-2">
              <MetricValue
                value={item.value}
                isLoading={isLoading}
                width={item.width}
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
              />
            </div>

            <div className="text-xs text-ink-muted mt-1 truncate">
              {item.caption}
            </div>
          </div>
        );
      })}
    </div>
  );
});
