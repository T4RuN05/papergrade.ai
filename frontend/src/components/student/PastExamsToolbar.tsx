"use client";

import React from "react";
import { Search, X, Sliders, ChevronDown } from "lucide-react";

export interface PastExamsToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  examSubjectFilter: string;
  onSubjectFilterChange: (subject: string) => void;
  examStatusFilter: string;
  onStatusFilterChange: (status: string) => void;
  uniqueExamSubjects: string[];
  isFilterExpanded: boolean;
  onToggleFilterExpanded: () => void;
  loadedCount: number;
  totalCount: number;
  onToggleAllCards: (expand: boolean) => void;
  onResetFilters: () => void;
}

export const PastExamsToolbar = React.memo(function PastExamsToolbar({
  searchQuery,
  onSearchChange,
  examSubjectFilter,
  onSubjectFilterChange,
  examStatusFilter,
  onStatusFilterChange,
  uniqueExamSubjects,
  isFilterExpanded,
  onToggleFilterExpanded,
  loadedCount,
  totalCount,
  onToggleAllCards,
  onResetFilters,
}: PastExamsToolbarProps) {
  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    examSubjectFilter !== "ALL" ||
    examStatusFilter !== "ALL";

  return (
    <div className="p-2 sm:p-2.5 rounded-2xl bg-surface border border-hairline shadow-2xs space-y-2">
      {/* Search Bar & Filter Toggle Row (Always Visible) */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search exams by title or subject..."
            className="w-full pl-8 pr-8 py-1.5 bg-canvas-soft/80 hover:bg-canvas-soft focus:bg-surface dark:bg-[#1a1a1a] dark:focus:bg-[#202020] text-xs sm:text-sm text-ink placeholder:text-ink-muted rounded-xl border border-hairline/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink rounded-md transition-colors cursor-pointer"
              title="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Filter Drawer Toggle Button */}
        <button
          type="button"
          onClick={onToggleFilterExpanded}
          className={`btn-glass-utility inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0 select-none ${
            isFilterExpanded || examSubjectFilter !== "ALL" || examStatusFilter !== "ALL"
              ? "border-primary text-primary font-bold shadow-2xs"
              : "text-ink-muted hover:text-ink"
          }`}
          title={isFilterExpanded ? "Collapse filters" : "Expand filters"}
          aria-expanded={isFilterExpanded}
        >
          <Sliders className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filters</span>
          {(examSubjectFilter !== "ALL" || examStatusFilter !== "ALL") && (
            <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
          )}
          <ChevronDown
            className={`h-3 w-3 transition-transform duration-200 ${
              isFilterExpanded ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {/* Collapsible Filters Drawer */}
      <div
        className={`grid transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isFilterExpanded
            ? "grid-rows-[1fr] opacity-100 pt-2 border-t border-hairline/70"
            : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden space-y-2.5">
          {/* Quick Expand / Collapse All Controls & Paper Count */}
          {loadedCount > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[11px] font-medium text-ink-muted">
                Showing {loadedCount} of {totalCount} {totalCount === 1 ? "paper" : "papers"}
              </span>
              <div className="inline-flex items-center rounded-lg border border-hairline bg-canvas-soft/80 p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => onToggleAllCards(true)}
                  className="text-[10.5px] font-medium text-ink-secondary hover:text-ink px-2 py-1 rounded hover:bg-surface transition-colors cursor-pointer whitespace-nowrap"
                  title="Expand all cards"
                >
                  Expand All
                </button>
                <div className="h-2.5 w-px bg-hairline" />
                <button
                  type="button"
                  onClick={() => onToggleAllCards(false)}
                  className="text-[10.5px] font-medium text-ink-secondary hover:text-ink px-2 py-1 rounded hover:bg-surface transition-colors cursor-pointer whitespace-nowrap"
                  title="Collapse all cards"
                >
                  Collapse All
                </button>
              </div>
            </div>
          )}

          {/* Subject Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-xs">
            <span className="text-[10px] font-mono text-ink-muted uppercase tracking-wider shrink-0 mr-0.5">
              Subject:
            </span>
            <button
              type="button"
              onClick={() => onSubjectFilterChange("ALL")}
              className={`px-2 py-0.5 rounded-md text-[11px] transition-all shrink-0 cursor-pointer ${
                examSubjectFilter === "ALL"
                  ? "bg-primary text-white font-semibold shadow-2xs"
                  : "bg-canvas-soft/80 text-ink-secondary hover:text-ink hover:bg-canvas-soft border border-hairline font-medium"
              }`}
            >
              All Subjects
            </button>
            {uniqueExamSubjects.map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => onSubjectFilterChange(sub)}
                className={`px-2 py-0.5 rounded-md text-[11px] transition-all shrink-0 cursor-pointer ${
                  examSubjectFilter === sub
                    ? "bg-primary text-white font-semibold shadow-2xs"
                    : "bg-canvas-soft/80 text-ink-secondary hover:text-ink hover:bg-canvas-soft border border-hairline font-medium"
                }`}
              >
                {sub}
              </button>
            ))}
          </div>

          {/* Status Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-xs">
            <span className="text-[10px] font-mono text-ink-muted uppercase tracking-wider shrink-0 mr-0.5">
              Status:
            </span>
            <button
              type="button"
              onClick={() => onStatusFilterChange("ALL")}
              className={`px-2 py-0.5 rounded-md text-[11px] transition-all shrink-0 cursor-pointer ${
                examStatusFilter === "ALL"
                  ? "bg-primary text-white font-semibold shadow-2xs"
                  : "bg-canvas-soft/80 text-ink-muted hover:text-ink hover:bg-canvas-soft border border-hairline/60 font-medium"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => onStatusFilterChange("PUBLISHED")}
              className={`px-2 py-0.5 rounded-md text-[11px] transition-all shrink-0 cursor-pointer ${
                examStatusFilter === "PUBLISHED"
                  ? "bg-primary text-white font-semibold shadow-2xs"
                  : "bg-canvas-soft/80 text-ink-muted hover:text-ink hover:bg-canvas-soft border border-hairline/60 font-medium"
              }`}
            >
              Published
            </button>
            <button
              type="button"
              onClick={() => onStatusFilterChange("IN_PROGRESS")}
              className={`px-2 py-0.5 rounded-md text-[11px] transition-all shrink-0 cursor-pointer ${
                examStatusFilter === "IN_PROGRESS"
                  ? "bg-primary text-white font-semibold shadow-2xs"
                  : "bg-canvas-soft/80 text-ink-muted hover:text-ink hover:bg-canvas-soft border border-hairline/60 font-medium"
              }`}
            >
              In Progress
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="text-[10.5px] font-semibold text-primary hover:underline ml-1 cursor-pointer shrink-0 whitespace-nowrap"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
