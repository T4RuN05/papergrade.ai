import React from "react";
import { FeatureCard } from "./index";

// ==========================================
// 1. Core Skeleton Primitives
// ==========================================

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  rounded?: "xs" | "sm" | "md" | "lg" | "xl" | "full" | "none";
}

export function Skeleton({
  className = "",
  rounded = "md",
  ...props
}: SkeletonProps) {
  const roundedClasses = {
    none: "rounded-none",
    xs: "rounded-xs",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    full: "rounded-full",
  }[rounded];

  return (
    <div
      className={`animate-shimmer ${roundedClasses} ${className}`}
      aria-hidden="true"
      {...props}
    />
  );
}

export function SkeletonText({
  lines = 1,
  className = "",
  widths,
}: {
  lines?: number;
  className?: string;
  widths?: string[];
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3.5 ${
            widths && widths[i]
              ? widths[i]
              : i === lines - 1 && lines > 1
              ? "w-3/5"
              : "w-full"
          }`}
          rounded="xs"
        />
      ))}
    </div>
  );
}

export function SkeletonAvatar({
  size = "md",
  className = "",
}: {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizeClasses = {
    xs: "h-6 w-6",
    sm: "h-7 w-7",
    md: "h-9 w-9",
    lg: "h-11 w-11",
    xl: "h-14 w-14",
  }[size];

  return <Skeleton className={`${sizeClasses} shrink-0 ${className}`} rounded="full" />;
}

export function SkeletonButton({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = {
    sm: "h-7 w-20",
    md: "h-9 w-28",
    lg: "h-11 w-36",
  }[size];

  return <Skeleton className={`${sizeClasses} ${className}`} rounded="full" />;
}

// ==========================================
// 2. Dashboard Skeleton (/overview)
// ==========================================

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Welcome Banner */}
      <FeatureCard className="p-5 sm:p-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48 sm:w-64" />
            <Skeleton className="h-4 w-72 sm:w-96" />
          </div>
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>
      </FeatureCard>

      {/* 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {[1, 2, 3, 4].map((i) => (
          <FeatureCard key={i} className="p-4 sm:p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-7" rounded="md" />
            </div>
            <Skeleton className="h-8 w-20 font-mono" />
            <Skeleton className="h-3 w-32" />
          </FeatureCard>
        ))}
      </div>

      {/* Quick Action Pill Bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Skeleton className="h-8 w-36 rounded-full" />
        <Skeleton className="h-8 w-40 rounded-full" />
        <Skeleton className="h-8 w-32 rounded-full" />
      </div>

      {/* Recent Activity Card */}
      <FeatureCard className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-hairline">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="divide-y divide-hairline">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Skeleton className="h-8 w-8 shrink-0" rounded="md" />
                <div className="space-y-1.5 min-w-0">
                  <Skeleton className="h-3.5 w-40 sm:w-60" />
                  <Skeleton className="h-3 w-28 sm:w-44" />
                </div>
              </div>
              <Skeleton className="h-6 w-20 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </FeatureCard>
    </div>
  );
}

// ==========================================
// 3. Tenancy Skeleton (/admin/tenancy)
// ==========================================

export function TenancySkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56 sm:w-72" />
          <Skeleton className="h-4 w-72 sm:w-96" />
        </div>
        <Skeleton className="h-9 w-44 rounded-full" />
      </div>

      {/* Institute Cards */}
      <div className="space-y-6">
        {[1, 2].map((i) => (
          <FeatureCard key={i} className="p-5 sm:p-6 space-y-5">
            {/* Institute Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-hairline">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 shrink-0" rounded="lg" />
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-4 w-16 rounded-xs" />
                  </div>
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-24 rounded-md" />
                <Skeleton className="h-7 w-20 rounded-md" />
              </div>
            </div>

            {/* Nested Branches Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2].map((b) => (
                <div key={b} className="p-4 rounded-lg bg-canvas-soft border border-hairline space-y-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <div className="pt-2 border-t border-hairline/60 flex items-center justify-between">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-6 w-16 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </FeatureCard>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 4. Batches & Roster Skeleton (/branch/batches)
// ==========================================

export function BatchesRosterSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56 sm:w-72" />
          <Skeleton className="h-4 w-72 sm:w-96" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-32 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <FeatureCard key={i} className="p-4 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16 font-mono" />
            <Skeleton className="h-3 w-36" />
          </FeatureCard>
        ))}
      </div>

      {/* Two Column Layout: Batches List (1 col) + Roster Table (2 col) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Batches */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-6 w-6 rounded" />
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3.5 rounded-lg bg-surface border border-hairline space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Roster Table */}
        <div className="md:col-span-2 space-y-4">
          <FeatureCard className="p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3.5 w-48" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-24 rounded-md" />
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
            </div>

            {/* Search Input Skeleton */}
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-8 flex-1 max-w-sm rounded-md" />
              <Skeleton className="h-4 w-20" />
            </div>

            {/* Table Skeleton */}
            <div className="rounded-lg border border-hairline overflow-hidden">
              <div className="h-9 bg-canvas-soft border-b border-hairline flex items-center px-4 gap-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16 ml-auto" />
              </div>
              <div className="divide-y divide-hairline bg-surface">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 flex items-center px-4 gap-4">
                    <Skeleton className="h-3.5 w-16 font-mono" />
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-4 w-20 rounded font-mono" />
                    <Skeleton className="h-5 w-24 rounded-full" />
                    <Skeleton className="h-6 w-8 rounded ml-auto" />
                  </div>
                ))}
              </div>
            </div>
          </FeatureCard>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 5. Examinations Grid Skeleton (/exams)
// ==========================================

export function ExamsGridSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56 sm:w-72" />
          <Skeleton className="h-4 w-72 sm:w-96" />
        </div>
        <Skeleton className="h-9 w-40 rounded-full" />
      </div>

      {/* 2-Column Responsive Exam Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <FeatureCard key={i} className="p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-48 sm:w-60" />
                  <Skeleton className="h-4 w-14 rounded-xs" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-28 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-6 w-20 rounded-full shrink-0" />
            </div>

            <div className="p-3 rounded-lg bg-canvas-soft border border-hairline space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-24 font-mono" />
              </div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-20 font-mono" />
              </div>
            </div>

            <div className="pt-3 border-t border-hairline flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-24 rounded-md" />
                <Skeleton className="h-7 w-24 rounded-md" />
              </div>
              <Skeleton className="h-7 w-20 rounded-md" />
            </div>
          </FeatureCard>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 6. Exam Detail Skeleton (/exams/[id])
// ==========================================

export function ExamDetailSkeleton() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 animate-in fade-in duration-200">
      {/* 1. Main Examination Header Card */}
      <FeatureCard className="p-6 sm:p-8 space-y-6 border-hairline bg-surface shadow-xs">
        {/* Top Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-hairline">
          {/* Left Metadata & Title Column */}
          <div className="space-y-2 max-w-2xl">
            {/* Badges Row */}
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-5.5 w-24 rounded-full" />
              <Skeleton className="h-5.5 w-32 rounded-full" />
              <Skeleton className="h-5.5 w-24 rounded-full" />
              <Skeleton className="h-5.5 w-28 rounded-full" />
              <Skeleton className="h-5.5 w-36 rounded-full" />
            </div>

            {/* Title with Graduation Cap Icon */}
            <div className="flex items-center gap-2.5 pt-1">
              <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
              <Skeleton className="h-8 w-44 sm:w-56 rounded-md" />
            </div>

            {/* Subtitle */}
            <Skeleton className="h-4 w-72 sm:w-[420px] rounded" />
          </div>

          {/* Right Action Buttons Cluster */}
          <div className="flex flex-wrap items-center gap-2.5 sm:self-start lg:self-center">
            <Skeleton className="h-8 w-48 rounded-md" />
            <Skeleton className="h-8 w-36 rounded-md" />
            <Skeleton className="h-8 w-32 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="h-8 w-32 rounded-md" />
          </div>
        </div>

        {/* Academic Details & Materials Inset Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs bg-canvas-soft rounded-lg p-4 border border-hairline">
          {/* Institute & Branch */}
          <div className="flex items-start gap-2.5">
            <Skeleton className="h-4 w-4 rounded-xs shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-2.5 w-32 rounded-xs" />
              <Skeleton className="h-3.5 w-28 rounded" />
              <Skeleton className="h-2.5 w-24 rounded-xs" />
            </div>
          </div>

          {/* Linked Batch */}
          <div className="flex items-start gap-2.5">
            <Skeleton className="h-4 w-4 rounded-xs shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-2.5 w-24 rounded-xs" />
              <Skeleton className="h-3.5 w-32 rounded" />
              <Skeleton className="h-2.5 w-28 rounded-xs" />
            </div>
          </div>

          {/* Exam Artifacts */}
          <div className="flex items-start gap-2.5">
            <Skeleton className="h-4 w-4 rounded-xs shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-2.5 w-24 rounded-xs" />
              <div className="flex items-center gap-2 pt-0.5">
                <Skeleton className="h-6 w-32 rounded border border-hairline bg-surface" />
                <Skeleton className="h-6 w-28 rounded border border-hairline bg-surface" />
              </div>
            </div>
          </div>
        </div>

        {/* 4 Performance Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Submissions Evaluated */}
          <div className="rounded-lg border border-hairline bg-surface p-4 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <div className="flex items-baseline gap-1.5 pt-0.5">
              <Skeleton className="h-7 w-12 rounded font-mono" />
              <Skeleton className="h-3 w-14 rounded" />
            </div>
            <div className="w-full bg-[#f1f1ef] h-1.5 rounded-full overflow-hidden mt-2">
              <Skeleton className="h-full w-full rounded-full" />
            </div>
          </div>

          {/* 2. Class Mean Score */}
          <div className="rounded-lg border border-hairline bg-surface p-4 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <div className="flex items-baseline gap-1.5 pt-0.5">
              <Skeleton className="h-7 w-12 rounded font-mono" />
              <Skeleton className="h-3 w-10 rounded" />
            </div>
            <Skeleton className="h-2.5 w-32 rounded" />
          </div>

          {/* 3. Highest Score */}
          <div className="rounded-lg border border-hairline bg-surface p-4 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <div className="flex items-baseline gap-1.5 pt-0.5">
              <Skeleton className="h-7 w-12 rounded font-mono" />
              <Skeleton className="h-3 w-10 rounded" />
            </div>
            <Skeleton className="h-2.5 w-36 rounded" />
          </div>

          {/* 4. Pass Rate */}
          <div className="rounded-lg border border-hairline bg-surface p-4 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <div className="flex items-baseline gap-1.5 pt-0.5">
              <Skeleton className="h-7 w-16 rounded font-mono" />
            </div>
            <div className="w-full bg-[#f1f1ef] h-1.5 rounded-full overflow-hidden mt-2">
              <Skeleton className="h-full w-3/5 rounded-full" />
            </div>
          </div>
        </div>
      </FeatureCard>

      {/* 2. Evaluation Queue Prerequisites Checklist Banner (Distinct Amber-Tinted Card) */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-64 sm:w-80 rounded" />
          </div>
          <Skeleton className="h-4 w-24 rounded-full" />
        </div>
        <Skeleton className="h-3 w-full max-w-2xl rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          {[
            { labelW: "w-28", badgeW: "w-14" },
            { labelW: "w-32", badgeW: "w-20" },
            { labelW: "w-28", badgeW: "w-14" },
          ].map((item, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-lg border border-emerald-300/60 bg-surface flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full shrink-0" />
                <Skeleton className={`h-3 ${item.labelW} rounded`} />
              </div>
              <Skeleton className={`h-5 ${item.badgeW} rounded-full`} />
            </div>
          ))}
        </div>
      </div>

      {/* 3. Student Answer Sheets & Evaluated Scripts (Separate Card) */}
      <FeatureCard className="p-6 space-y-5 border-hairline bg-surface shadow-xs">
        {/* Header & Controls Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-xs" />
              <Skeleton className="h-5 w-64 sm:w-72 rounded" />
            </div>
            <Skeleton className="h-3.5 w-48 sm:w-56 rounded" />
          </div>

          {/* Filter Bar Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Skeleton className="h-7 w-20 rounded-md" />
            <Skeleton className="h-7 w-48 rounded-md" />
            <Skeleton className="h-7 w-24 rounded-md" />
            <Skeleton className="h-7 w-32 rounded-md" />
            <Skeleton className="h-7 w-36 rounded-md" />
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto rounded-lg border border-hairline">
          {/* Table Header */}
          <div className="h-10 bg-canvas-soft border-b border-hairline flex items-center px-4 gap-4 text-xs">
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-3 w-28 rounded ml-4" />
            <Skeleton className="h-3 w-12 rounded mx-auto" />
            <Skeleton className="h-3 w-24 rounded ml-auto" />
            <Skeleton className="h-3 w-14 rounded mx-auto" />
            <Skeleton className="h-3 w-16 rounded mx-auto" />
            <Skeleton className="h-3 w-24 rounded ml-auto" />
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-hairline bg-surface">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-14 flex items-center px-4 gap-4 text-xs">
                {/* Roll Number */}
                <Skeleton className="h-3.5 w-20 rounded" />
                {/* Student Name & Sub ID */}
                <div className="space-y-1 ml-4 flex-1 max-w-[200px]">
                  <Skeleton className="h-3.5 w-28 sm:w-36 rounded" />
                  <Skeleton className="h-2 w-16 rounded-xs" />
                </div>
                {/* Pages */}
                <Skeleton className="h-3.5 w-6 rounded mx-auto" />
                {/* Marks Awarded */}
                <div className="flex items-baseline gap-1 ml-auto">
                  <Skeleton className="h-4 w-10 rounded font-bold" />
                  <Skeleton className="h-3 w-8 rounded" />
                </div>
                {/* Score % */}
                <Skeleton className="h-5.5 w-14 rounded-full mx-auto" />
                {/* Status */}
                <Skeleton className="h-5.5 w-24 rounded-full mx-auto" />
                {/* Audit & Review */}
                <Skeleton className="h-3.5 w-24 rounded ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </FeatureCard>
    </div>
  );
}

// ==========================================
// 7. Rubric Skeleton (/exams/[id]/rubric)
// ==========================================

export function RubricSkeleton() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-in fade-in duration-200">
      <FeatureCard className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-hairline">
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-44" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
        </div>

        {/* 3 Question Criteria Cards */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 sm:p-5 rounded-lg border border-hairline bg-surface space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
                <Skeleton className="h-6 w-20 rounded" />
              </div>
              <Skeleton className="h-3.5 w-full max-w-xl" />
              <div className="rounded border border-hairline p-3 space-y-2 bg-canvas-soft">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </FeatureCard>
    </div>
  );
}

// ==========================================
// 8. Marks Matrix Skeleton (/marks)
// ==========================================

export function MarksMatrixSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56 sm:w-72" />
          <Skeleton className="h-4 w-72 sm:w-96" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-44 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
      </div>

      {/* Table Card */}
      <FeatureCard className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 flex-1 max-w-xs rounded-md" />
          <Skeleton className="h-4 w-28" />
        </div>

        <div className="rounded-lg border border-hairline overflow-hidden">
          <div className="h-10 bg-canvas-soft border-b border-hairline flex items-center px-4 gap-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16 font-mono ml-auto" />
            <Skeleton className="h-3 w-16 font-mono" />
          </div>
          <div className="divide-y divide-hairline bg-surface">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-12 flex items-center px-4 gap-4">
                <Skeleton className="h-3.5 w-16 font-mono" />
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3.5 w-10 font-mono" />
                <Skeleton className="h-3.5 w-10 font-mono" />
                <Skeleton className="h-3.5 w-10 font-mono" />
                <Skeleton className="h-4 w-16 font-mono font-bold ml-auto" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </FeatureCard>
    </div>
  );
}

// ==========================================
// 9. Revaluation Desk Skeleton (/revaluation)
// ==========================================

export function RevaluationDeskSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>

      {/* Horizontal Appeals Queue */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <div className="flex items-center gap-3 overflow-x-auto pb-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="min-w-[240px] p-3 rounded-lg border border-hairline bg-surface space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* Split Workspace Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[500px]">
        {/* Document Canvas (7 cols) */}
        <div className="lg:col-span-7 bg-[#f6f6f4] rounded-lg border border-hairline p-6 flex items-center justify-center min-h-[420px]">
          <div className="w-full max-w-md h-[400px] bg-white rounded shadow-sm border border-hairline p-6 space-y-4">
            <div className="flex justify-between items-start">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-12 w-20 border-dashed rounded" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <div className="h-32 border border-dashed rounded flex items-center justify-center">
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        </div>

        {/* Human Inspector Control Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <FeatureCard className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-hairline">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-16 w-full rounded" />
            </div>
            <div className="space-y-2 pt-2 border-t border-hairline">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-9 w-full rounded" />
            </div>
            <div className="pt-2 flex justify-end">
              <Skeleton className="h-9 w-36 rounded-full" />
            </div>
          </FeatureCard>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 10. Analytics Skeleton (/analytics)
// ==========================================

export function AnalyticsSkeleton() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12 animate-in fade-in duration-200">
      {/* Header */}
      <div className="pb-3 border-b border-hairline space-y-2">
        <Skeleton className="h-4 w-48 rounded-full" />
        <Skeleton className="h-7 w-80 sm:w-96" />
        <Skeleton className="h-3.5 w-full max-w-xl" />
      </div>

      {/* 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <FeatureCard key={i} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-6 w-6 rounded" />
            </div>
            <Skeleton className="h-7 w-24 font-mono" />
            <Skeleton className="h-2.5 w-32" />
          </FeatureCard>
        ))}
      </div>

      {/* Config Box */}
      <FeatureCard className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-hairline">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
        <div className="pt-2 flex justify-end">
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
      </FeatureCard>

      {/* Feasibility Projections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[1, 2].map((i) => (
          <FeatureCard key={i} className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="space-y-2 p-3 bg-canvas-soft rounded-lg">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </FeatureCard>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 11. Student Portal Skeleton (/student/portal)
// ==========================================

export function StudentPortalSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto py-6 sm:py-8 px-4 animate-in fade-in duration-200">
      {/* Student Identity Hero Card */}
      <FeatureCard className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <SkeletonAvatar size="lg" />
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-16 rounded-xs" />
              </div>
              <Skeleton className="h-3.5 w-52" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-28 rounded-full" />
          </div>
        </div>
      </FeatureCard>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <FeatureCard key={i} className="p-3.5 sm:p-4 space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-14 font-mono" />
            <Skeleton className="h-2.5 w-24" />
          </FeatureCard>
        ))}
      </div>

      {/* Submissions Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-8 w-48 rounded-md" />
        </div>

        {/* 3 Submission Cards */}
        <div className="space-y-3.5">
          {[1, 2, 3].map((i) => (
            <FeatureCard key={i} className="p-4 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-44 sm:w-60" />
                    <Skeleton className="h-4 w-14 rounded-xs" />
                  </div>
                  <Skeleton className="h-3 w-36" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-20 rounded font-mono" />
                  <Skeleton className="h-8 w-28 rounded-full" />
                </div>
              </div>
            </FeatureCard>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 12. Evaluation / Submission Viewer Skeleton
//     (/grading/[id] & /student/submissions/[id])
// ==========================================

export function EvaluationViewerSkeleton({ isStudent = false }: { isStudent?: boolean }) {
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-in fade-in duration-200">
      {/* Top Page Action (Export Button) */}
      {!isStudent && (
        <div className="flex items-center justify-end pb-1 border-b border-hairline">
          <Skeleton className="h-8 w-56 rounded-full" />
        </div>
      )}

      {/* Student Overview Banner Card */}
      <div className="p-6 rounded-lg border border-hairline bg-surface shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Left Student Info */}
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-6 w-36 rounded" />
                <Skeleton className="h-5 w-24 rounded-md" />
              </div>
              <Skeleton className="h-3.5 w-64 rounded" />
            </div>
          </div>

          {/* Right Marks & Status Summary */}
          <div className="flex flex-wrap items-center justify-start sm:justify-end gap-5 border-t md:border-t-0 md:border-l border-hairline pt-4 md:pt-0 md:pl-6">
            <div className="space-y-1.5 text-left sm:text-right">
              <Skeleton className="h-2.5 w-20 sm:ml-auto rounded" />
              <Skeleton className="h-7 w-24 rounded" />
            </div>

            <div className="space-y-1.5 text-left sm:text-right">
              <Skeleton className="h-2.5 w-16 sm:ml-auto rounded" />
              <Skeleton className="h-7 w-16 rounded-full" />
            </div>

            <div className="sm:pl-2 flex items-center gap-2">
              <Skeleton className="h-7 w-28 rounded-full" />
              {!isStudent && <Skeleton className="h-7 w-48 rounded-full" />}
            </div>
          </div>
        </div>
      </div>

      {/* Main Workspace: Document Viewer (3 cols) + Right Sidebar (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left: Document Viewer (3 cols on lg) */}
        <div className="lg:col-span-3 h-[560px] sm:h-[680px] lg:h-[820px] rounded-lg overflow-hidden border border-hairline bg-surface shadow-xs flex flex-col">
          {/* Document Viewer Top Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 border-b border-hairline bg-canvas-soft px-3 sm:px-4 py-2 sm:py-2.5 shrink-0">
            {/* Page navigation controls & quick pills */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Skeleton className="h-7 w-7 rounded" />
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-7 w-7 rounded" />
              <div className="hidden sm:flex items-center gap-1 ml-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                  <Skeleton key={p} className="h-6 w-6 rounded" />
                ))}
              </div>
            </div>

            {/* Instruction pill */}
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-hairline">
              <Skeleton className="h-3 w-52 rounded" />
            </div>

            {/* Legend dots */}
            <div className="hidden lg:flex items-center gap-3.5">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/40" />
                <Skeleton className="h-2.5 w-8 rounded" />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500/40" />
                <Skeleton className="h-2.5 w-10 rounded" />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-rose-500/40" />
                <Skeleton className="h-2.5 w-12 rounded" />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-purple-500/40" />
                <Skeleton className="h-2.5 w-10 rounded" />
              </div>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-surface rounded-md p-1 border border-hairline">
              <Skeleton className="h-6 w-6 rounded" />
              <Skeleton className="h-4 w-10 rounded" />
              <Skeleton className="h-6 w-6 rounded" />
              <Skeleton className="h-6 w-6 rounded" />
            </div>
          </div>

          {/* Canvas Area with Clean Paper Sheet Skeleton */}
          <div className="flex-1 bg-canvas-soft p-4 sm:p-6 overflow-hidden flex items-start justify-center">
            {/* Clean White Paper Sheet */}
            <div className="w-full max-w-[620px] h-[720px] bg-surface rounded-xl shadow-xs border border-hairline p-6 sm:p-8 relative space-y-5">
              {/* Top Header Placeholder */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-hairline">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-44 rounded" />
                  <Skeleton className="h-3 w-32 rounded" />
                  <Skeleton className="h-3 w-48 rounded" />
                </div>
                <div className="h-14 w-24 rounded-lg bg-canvas-soft border border-hairline p-2 flex flex-col items-center justify-center space-y-1 shrink-0">
                  <Skeleton className="h-2 w-12 rounded" />
                  <Skeleton className="h-4 w-14 rounded" />
                </div>
              </div>

              {/* Clean Question Skeleton Blocks */}
              <div className="space-y-4 pt-2">
                {[1, 2, 3].map((idx) => (
                  <div key={idx} className="p-3.5 rounded-lg bg-canvas-soft/60 border border-hairline space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-20 rounded" />
                      <Skeleton className="h-4 w-12 rounded font-mono" />
                    </div>
                    <Skeleton className="h-3 w-full rounded" />
                    <Skeleton className="h-3 w-4/5 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Question Breakdown Sidebar (1 col on lg) */}
        <div className="lg:col-span-1 space-y-4">
          {/* Card 1: Detected Answers */}
          <div className="p-4 rounded-lg bg-surface border border-hairline shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-hairline">
              <Skeleton className="h-3.5 w-36 rounded" />
              <Skeleton className="h-2.5 w-16 rounded" />
            </div>

            {/* Flagged Banner Callout */}
            {!isStudent && (
              <div className="p-2.5 rounded-md border border-purple-200 bg-purple-50/60 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-3 w-28 rounded" />
                </div>
                <Skeleton className="h-3 w-12 rounded" />
              </div>
            )}

            {/* Answer Rows List */}
            <div className="space-y-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((item) => (
                <div
                  key={item}
                  className="w-full flex items-center justify-between p-2.5 rounded-md border border-hairline bg-surface"
                >
                  <div className="space-y-1">
                    <Skeleton className="h-3.5 w-10 rounded" />
                    <Skeleton className="h-2.5 w-8 rounded" />
                  </div>
                  <Skeleton className="h-5 w-10 rounded-md" />
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Unattempted / Missing Questions */}
          <div className="rounded-xl border border-rose-200/80 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20 p-4 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-3.5 w-3.5 rounded-full" />
              <Skeleton className="h-3.5 w-36 rounded" />
            </div>
            <Skeleton className="h-2.5 w-full rounded" />
            <Skeleton className="h-2.5 w-4/5 rounded" />
            <div className="pt-1">
              <div className="w-full flex items-center justify-between p-2.5 rounded-lg border border-rose-200/80 dark:border-rose-900/40 bg-surface">
                <div className="space-y-1">
                  <Skeleton className="h-3.5 w-10 rounded" />
                  <Skeleton className="h-2 w-8 rounded" />
                </div>
                <Skeleton className="h-5 w-10 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 13. Notification Drawer Skeleton
// ==========================================

export function NotificationDrawerSkeleton() {
  return (
    <div className="divide-y divide-hairline">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="p-4 flex gap-3">
          <Skeleton className="h-7 w-7 rounded-full shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-2.5 w-12 shrink-0" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ==========================================
// 14. Admin Sidebar Skeleton
// ==========================================

export function AdminSidebarSkeleton() {
  return (
    <aside className="hidden md:flex flex-col w-60 h-screen sticky top-0 shrink-0 z-30 bg-surface text-ink border-r border-hairline select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-5 h-14 border-b border-hairline shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-white shadow-xs shrink-0">
            <div className="h-4 w-4 rounded-xs bg-white/40" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-tight text-ink">
              PaperGrade <span className="text-primary font-semibold">AI</span>
            </span>
            <span className="text-[10px] text-ink-faint">Root Enterprise Desk</span>
          </div>
        </div>
      </div>

      {/* Navigation Groupings Skeleton (Matching real item alignment 1:1) */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Workspace */}
        <div className="space-y-1">
          <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
            WORKSPACE
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between rounded-md px-2.5 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Skeleton className="h-4 w-4 shrink-0" rounded="xs" />
                <Skeleton className="h-3 w-24" rounded="xs" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md px-2.5 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Skeleton className="h-4 w-4 shrink-0" rounded="xs" />
                <Skeleton className="h-3 w-32" rounded="xs" />
              </div>
              <Skeleton className="h-4 w-7 shrink-0" rounded="xs" />
            </div>
          </div>
        </div>

        {/* Academic Operations */}
        <div className="space-y-1">
          <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
            ACADEMIC OPERATIONS
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between rounded-md px-2.5 py-2 bg-canvas-soft/80 border border-hairline/80 shadow-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <Skeleton className="h-4 w-4 shrink-0 bg-primary/20" rounded="xs" />
                <Skeleton className="h-3 w-28" rounded="xs" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md px-2.5 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Skeleton className="h-4 w-4 shrink-0" rounded="xs" />
                <Skeleton className="h-3 w-24" rounded="xs" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md px-2.5 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Skeleton className="h-4 w-4 shrink-0" rounded="xs" />
                <Skeleton className="h-3 w-30" rounded="xs" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md px-2.5 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Skeleton className="h-4 w-4 shrink-0" rounded="xs" />
                <Skeleton className="h-3 w-28" rounded="xs" />
              </div>
            </div>
          </div>
        </div>

        {/* Intelligence & Quota */}
        <div className="space-y-1">
          <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
            INTELLIGENCE & QUOTA
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between rounded-md px-2.5 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Skeleton className="h-4 w-4 shrink-0" rounded="xs" />
                <Skeleton className="h-3 w-28" rounded="xs" />
              </div>
              <Skeleton className="h-4 w-6 shrink-0" rounded="xs" />
            </div>
          </div>
        </div>

        {/* Student Preview */}
        <div className="space-y-1">
          <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
            STUDENT PREVIEW
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between rounded-md px-2.5 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Skeleton className="h-4 w-4 shrink-0" rounded="xs" />
                <Skeleton className="h-3 w-24" rounded="xs" />
              </div>
              <Skeleton className="h-4 w-8 shrink-0" rounded="xs" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom User Profile Section */}
      <div className="p-3 border-t border-hairline bg-canvas-soft/50 shrink-0">
        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface border border-hairline shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Skeleton className="h-7 w-7 rounded-full shrink-0" />
            <div className="flex flex-col min-w-0 space-y-1">
              <Skeleton className="h-3 w-28" rounded="xs" />
              <Skeleton className="h-2.5 w-16" rounded="xs" />
            </div>
          </div>
          <Skeleton className="h-6 w-6 rounded-md shrink-0" />
        </div>

        {/* Quick link to public landing page */}
        <div className="mt-2 flex items-center justify-between px-1 text-[11px]">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-3 rounded-xs" />
            <Skeleton className="h-2.5 w-16 rounded-xs" />
          </div>
          <Skeleton className="h-2.5 w-12 rounded-xs" />
        </div>
      </div>
    </aside>
  );
}

