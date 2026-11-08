"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Trophy,
  Medal,
  Award,
  Search,
  ArrowRight,
  TrendingUp,
  Target,
  Sparkles,
  FileSpreadsheet,
  CheckCircle2,
  BarChart3,
  X,
} from "lucide-react";
import { BadgePill } from "./ui";
import { useToast } from "@/lib/ToastContext";

export interface ExamRankedItem {
  id: string;
  student_name: string;
  roll_number?: string;
  student_id?: string;
  total_awarded_marks?: number | null;
  score?: number | null;
  max_marks?: number;
  percentage?: number | null;
  status?: string;
  is_manual_override?: boolean | number;
  page_count?: number;
  rank?: number;
  is_current_student?: boolean;
}

export function computeRankedSubmissions(
  submissions: ExamRankedItem[],
  maxMarks: number = 25,
  currentStudentRoll: string = "",
  currentStudentId: string = ""
) {
  const evaluatedSubmissions = submissions.filter((s) => {
    const mark = s.total_awarded_marks ?? s.score;
    return mark !== null && mark !== undefined && s.status?.toUpperCase() !== "FAILED";
  });

  const sorted = [...evaluatedSubmissions].sort((a, b) => {
    const marksA = Number(a.total_awarded_marks ?? a.score ?? 0);
    const marksB = Number(b.total_awarded_marks ?? b.score ?? 0);
    if (Math.abs(marksB - marksA) > 0.001) return marksB - marksA;

    const pctA = Number(a.percentage ?? 0);
    const pctB = Number(b.percentage ?? 0);
    if (Math.abs(pctB - pctA) > 0.001) return pctB - pctA;

    if (a.roll_number && b.roll_number) {
      return a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true });
    }
    return (a.student_name || "").localeCompare(b.student_name || "");
  });

  let currentDenseRank = 1;
  return sorted.map((sub, idx, arr) => {
    const currentScore = Number(sub.total_awarded_marks ?? sub.score ?? 0);
    if (idx > 0) {
      const prevScore = Number(arr[idx - 1].total_awarded_marks ?? arr[idx - 1].score ?? 0);
      if (Math.abs(currentScore - prevScore) > 0.001) {
        currentDenseRank += 1;
      }
    }

    const totalStudents = arr.length;
    const percentile =
      totalStudents > 1
        ? Math.max(0, Math.min(100, Math.round(((totalStudents - idx) / totalStudents) * 100)))
        : 100;

    const isCurrentStudent =
      Boolean(sub.is_current_student) ||
      Boolean(currentStudentRoll && sub.roll_number && sub.roll_number.toLowerCase() === currentStudentRoll.toLowerCase()) ||
      Boolean(currentStudentId && sub.student_id && String(sub.student_id) === String(currentStudentId));

    return {
      ...sub,
      rank: sub.rank || currentDenseRank,
      percentile,
      isCurrentStudent,
      effectiveMaxMarks: sub.max_marks || maxMarks || 25,
      effectiveScore: currentScore,
      effectivePercentage: Number(sub.percentage ?? (currentScore / (sub.max_marks || maxMarks || 25)) * 100),
    };
  });
}

export function exportRankedStandingsCSV(
  examTitle: string,
  rankedAll: ReturnType<typeof computeRankedSubmissions>
): boolean {
  if (rankedAll.length === 0) return false;

  const headers = ["Rank", "Roll Number", "Student Name", "Marks Awarded", "Max Marks", "Percentage", "Percentile", "Status"];
  const rows = rankedAll.map((r) => [
    r.rank,
    `"${r.roll_number || ""}"`,
    `"${r.student_name}"`,
    r.effectiveScore.toFixed(1),
    r.effectiveMaxMarks,
    `${r.effectivePercentage.toFixed(1)}%`,
    `${r.percentile}th`,
    `"${r.status || "COMPLETED"}"`,
  ]);

  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${examTitle.replace(/[^a-z0-9]/gi, "_")}_Ranked_Leaderboard.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export function exportRosterCSV(
  examTitle: string,
  submissions: any[],
  maxMarks: number = 25
): boolean {
  if (submissions.length === 0) return false;

  const headers = ["Roll Number", "Student Name", "Pages", "Marks Awarded", "Max Marks", "Percentage", "Status"];
  const rows = submissions.map((s) => [
    `"${s.roll_number || ""}"`,
    `"${s.student_name || ""}"`,
    s.page_count || 1,
    s.total_awarded_marks != null ? Number(s.total_awarded_marks).toFixed(1) : "—",
    maxMarks,
    s.percentage != null ? `${Number(s.percentage).toFixed(1)}%` : "—",
    `"${s.status || "PENDING"}"`,
  ]);

  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${examTitle.replace(/[^a-z0-9]/gi, "_")}_Roster_Ledger.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

interface ExamRankedTableProps {
  examId: string;
  examTitle: string;
  maxMarks?: number;
  submissions: ExamRankedItem[];
  isStudentView?: boolean;
  currentStudentRoll?: string;
  currentStudentId?: string;
  onInspectSubmission?: (submissionId: string) => void;
  hideSummaryCards?: boolean;
  hideToolbar?: boolean;
  searchTerm?: string;
  bracketFilter?: "ALL" | "TOP10" | "DISTINCTION" | "PASS";
}

export function ExamRankedTable({
  examId,
  examTitle,
  maxMarks = 25,
  submissions,
  isStudentView = false,
  currentStudentRoll = "",
  currentStudentId = "",
  hideSummaryCards = false,
  hideToolbar = false,
  searchTerm: propSearchTerm,
  bracketFilter: propBracketFilter,
}: ExamRankedTableProps) {
  const { toast } = useToast();
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [internalBracketFilter, setInternalBracketFilter] = useState<"ALL" | "TOP10" | "DISTINCTION" | "PASS">("ALL");

  const effectiveSearchTerm = propSearchTerm !== undefined ? propSearchTerm : internalSearchTerm;
  const effectiveBracketFilter = propBracketFilter !== undefined ? propBracketFilter : internalBracketFilter;

  // 1. Compute rankings with DENSE RANKING logic (1, 1, 2, 3...) - never skips ranks on ties!
  const rankedAll = useMemo(() => {
    return computeRankedSubmissions(submissions, maxMarks, currentStudentRoll, currentStudentId);
  }, [submissions, maxMarks, currentStudentRoll, currentStudentId]);

  // 2. Compute High-Level Summary Statistics
  const stats = useMemo(() => {
    if (rankedAll.length === 0) {
      return { topper: null, average: 0, median: 0, distinctionCount: 0, total: 0 };
    }

    const topper = rankedAll[0];
    const scores = rankedAll.map((r) => r.effectiveScore);
    const sum = scores.reduce((acc, val) => acc + val, 0);
    const average = sum / scores.length;

    // Median
    const mid = Math.floor(scores.length / 2);
    const median = scores.length % 2 !== 0 ? scores[mid] : (scores[mid - 1] + scores[mid]) / 2;

    // Distinction count (>= 75%)
    const distinctionCount = rankedAll.filter((r) => r.effectivePercentage >= 75).length;

    return {
      topper,
      average: Number(average.toFixed(1)),
      median: Number(median.toFixed(1)),
      distinctionCount,
      total: rankedAll.length,
    };
  }, [rankedAll]);

  // Current logged in student entry (if any)
  const currentStudentEntry = useMemo(() => {
    return rankedAll.find((r) => r.isCurrentStudent);
  }, [rankedAll]);

  // 3. Apply search & bracket filtering
  const filteredRanked = useMemo(() => {
    return rankedAll.filter((item) => {
      // Search
      const query = effectiveSearchTerm.trim().toLowerCase();
      const matchSearch =
        !query ||
        item.student_name.toLowerCase().includes(query) ||
        (item.roll_number && !isStudentView && item.roll_number.toLowerCase().includes(query));

      if (!matchSearch) return false;

      // Bracket
      if (effectiveBracketFilter === "TOP10") return item.rank <= 10;
      if (effectiveBracketFilter === "DISTINCTION") return item.effectivePercentage >= 75;
      if (effectiveBracketFilter === "PASS") return item.effectivePercentage >= 40 && item.effectivePercentage < 75;
      return true;
    });
  }, [rankedAll, effectiveSearchTerm, effectiveBracketFilter, isStudentView]);

  // 4. Export Ranked List as CSV (Faculty only)
  const handleExportCSV = () => {
    const success = exportRankedStandingsCSV(examTitle, rankedAll);
    if (!success) {
      toast.warning("No ranked student data available to export.", { title: "Export CSV" });
      return;
    }
    toast.success("Ranked exam standings exported successfully.", { title: "CSV Download" });
  };

  // Helper to render Rank column badge
  const renderRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span
          className="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_1px_2px_rgba(0,0,0,0.06)] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_1px_3px_rgba(0,0,0,0.3)] shrink-0"
          title="Rank 1 • Gold"
        >
          <Trophy className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-[#b07b30] dark:text-[#e5ad68] shrink-0" />
          <span>#1</span>
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span
          className="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#f1f0ee] text-[#4d4a46] border border-[#dedcd8] shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_1px_2px_rgba(0,0,0,0.06)] dark:bg-[#1e1e1e] dark:text-[#a8a6a2] dark:border-[#2f2f2f] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_1px_3px_rgba(0,0,0,0.3)] shrink-0"
          title="Rank 2 • Silver"
        >
          <Medal className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-[#6c6964] dark:text-[#a8a6a2] shrink-0" />
          <span>#2</span>
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span
          className="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#f4f1ec] text-[#594532] border border-[#ded5c7] shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_1px_2px_rgba(0,0,0,0.06)] dark:bg-[#221b14] dark:text-[#c4ae97] dark:border-[#382b20] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_1px_3px_rgba(0,0,0,0.3)] shrink-0"
          title="Rank 3 • Bronze"
        >
          <Award className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-[#8b6542] dark:text-[#c4ae97] shrink-0" />
          <span>#3</span>
        </span>
      );
    }
    return (
      <span className="font-mono text-xs font-bold text-ink-muted px-1.5 py-0.5 inline-block text-center min-w-[24px]">
        #{rank}
      </span>
    );
  };

  return (
    <div className={hideSummaryCards && hideToolbar ? "w-full" : "space-y-3.5 w-full"}>
      {/* SUMMARY DISTRIBUTION METRICS BANNER */}
      {!hideSummaryCards && stats.total > 0 && (
        <div
          className={`grid gap-2 sm:gap-3.5 ${
            isStudentView ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"
          }`}
        >
          {/* Top Score */}
          <div className="p-2.5 sm:p-3.5 rounded-xl bg-surface border border-hairline shadow-2xs space-y-0.5 sm:space-y-1 min-w-0">
            <div className="flex items-center justify-between text-ink-muted text-[10px] sm:text-[11px] font-medium">
              <span className="truncate">Top Score</span>
              <Trophy className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-amber-600 shrink-0" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-sm sm:text-xl font-bold font-mono text-ink">
                {stats.topper?.effectiveScore.toFixed(1)}
              </span>
              <span className="text-[10px] sm:text-xs text-ink-muted font-mono">
                / {stats.topper?.effectiveMaxMarks}m
              </span>
            </div>
            <div className="text-[9.5px] sm:text-[10.5px] text-ink-muted truncate">
              {stats.topper?.student_name}
            </div>
          </div>

          {/* Class Mean */}
          <div className="p-2.5 sm:p-3.5 rounded-xl bg-surface border border-hairline shadow-2xs space-y-0.5 sm:space-y-1 min-w-0">
            <div className="flex items-center justify-between text-ink-muted text-[10px] sm:text-[11px] font-medium">
              <span className="truncate">Class Mean</span>
              <TrendingUp className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-primary shrink-0" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-sm sm:text-xl font-bold font-mono text-ink">
                {stats.average}
              </span>
              <span className="text-[10px] sm:text-xs text-ink-muted font-mono">/ {maxMarks}m</span>
            </div>
            <div className="text-[9.5px] sm:text-[10.5px] text-ink-muted truncate">
              {((stats.average / (maxMarks || 25)) * 100).toFixed(0)}% avg
            </div>
          </div>

          {/* Student View: Your Standing | Faculty View: Median & Distinctions */}
          {isStudentView ? (
            <div className="p-2.5 sm:p-3.5 rounded-xl bg-surface border border-hairline shadow-2xs space-y-0.5 sm:space-y-1 min-w-0">
              <div className="flex items-center justify-between text-ink-muted text-[10px] sm:text-[11px] font-medium">
                <span className="truncate">Your Standing</span>
                <Award className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-primary shrink-0" />
              </div>
              <div className="flex items-baseline gap-1">
                {currentStudentEntry ? (
                  <>
                    <span className="text-sm sm:text-xl font-bold font-mono text-primary">
                      #{currentStudentEntry.rank}
                    </span>
                    <span className="text-[10px] text-ink-muted truncate">of {stats.total}</span>
                  </>
                ) : (
                  <span className="text-xs font-semibold text-ink-secondary">Evaluated</span>
                )}
              </div>
              <div className="text-[9.5px] sm:text-[10.5px] text-ink-muted truncate">
                {currentStudentEntry
                  ? `${currentStudentEntry.effectiveScore.toFixed(1)} marks`
                  : "Rank computed"}
              </div>
            </div>
          ) : (
            <>
              {/* Median */}
              <div className="p-3 sm:p-3.5 rounded-xl bg-surface border border-hairline shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-ink-muted text-[11px] font-medium">
                  <span>Median Score</span>
                  <Target className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg sm:text-xl font-bold font-mono text-ink">
                    {stats.median}
                  </span>
                  <span className="text-xs text-ink-muted font-mono">/ {maxMarks}m</span>
                </div>
                <div className="text-[10.5px] text-ink-muted">50th percentile</div>
              </div>

              {/* Distinction Count */}
              <div className="p-3 sm:p-3.5 rounded-xl bg-surface border border-hairline shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-ink-muted text-[11px] font-medium">
                  <span>Distinctions (≥75%)</span>
                  <Sparkles className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg sm:text-xl font-bold font-mono text-ink">
                    {stats.distinctionCount}
                  </span>
                  <span className="text-xs text-ink-muted">of {stats.total} students</span>
                </div>
                <div className="text-[10.5px] text-ink-muted">
                  {((stats.distinctionCount / stats.total) * 100).toFixed(0)}% distinction rate
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* SEARCH, BRACKET FILTERS, & TOOLBAR */}
      {!hideToolbar && (
        <div className="p-2.5 sm:p-3 rounded-2xl bg-surface border border-hairline shadow-2xs space-y-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
              <input
                type="text"
                value={effectiveSearchTerm}
                onChange={(e) => setInternalSearchTerm(e.target.value)}
                placeholder={isStudentView ? "Search student name..." : "Search student by name or roll number..."}
                className="w-full pl-8 pr-7 py-1.5 bg-canvas-soft/80 hover:bg-canvas-soft focus:bg-surface text-xs text-ink placeholder:text-ink-muted rounded-xl border border-hairline focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-2xs"
              />
              {effectiveSearchTerm && (
                <button
                  type="button"
                  onClick={() => setInternalSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink rounded transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Export CSV Button (Faculty Only) */}
            {!isStudentView && (
              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-hairline bg-surface hover:bg-canvas-soft text-xs font-semibold text-ink transition-colors cursor-pointer shadow-2xs shrink-0 whitespace-nowrap"
                title="Download complete ranked list as CSV"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Export CSV</span>
              </button>
            )}
          </div>

          {/* Quick Filter Pills (Inline and Horizontally Scrollable) */}
          <div className="flex items-center gap-1.5 text-xs overflow-x-auto no-scrollbar py-0.5 shrink-0 select-none" data-no-swipe="true">
            <span className="text-[10px] sm:text-[11px] font-bold text-ink-muted uppercase tracking-wider mr-0.5 shrink-0">
              Filter:
            </span>
            <button
              type="button"
              onClick={() => setInternalBracketFilter("ALL")}
              className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                effectiveBracketFilter === "ALL"
                  ? "bg-primary text-white font-semibold shadow-2xs"
                  : "bg-canvas-soft/80 text-ink-muted hover:text-ink hover:bg-canvas-soft border border-hairline/70 font-medium"
              }`}
            >
              All Ranked ({rankedAll.length})
            </button>
            <button
              type="button"
              onClick={() => setInternalBracketFilter("TOP10")}
              className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                effectiveBracketFilter === "TOP10"
                  ? "bg-primary text-white font-semibold shadow-2xs"
                  : "bg-canvas-soft/80 text-ink-muted hover:text-ink hover:bg-canvas-soft border border-hairline/70 font-medium"
              }`}
            >
              Top 10
            </button>
            <button
              type="button"
              onClick={() => setInternalBracketFilter("DISTINCTION")}
              className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer shrink-0 whitespace-nowrap ${
                effectiveBracketFilter === "DISTINCTION"
                  ? "bg-emerald-600 text-white font-semibold shadow-2xs"
                  : "bg-canvas-soft/80 text-ink-muted hover:text-ink hover:bg-canvas-soft border border-hairline/70 font-medium"
              }`}
            >
              Distinction (≥75%)
            </button>

            {(effectiveSearchTerm || effectiveBracketFilter !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setInternalSearchTerm("");
                  setInternalBracketFilter("ALL");
                }}
                className="text-[10.5px] sm:text-[11px] font-semibold text-primary hover:underline ml-1 cursor-pointer shrink-0 whitespace-nowrap"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {/* RANKED TABLE VIEW */}
      {filteredRanked.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface p-6 sm:p-8 text-center space-y-2 shadow-2xs w-full">
          <BarChart3 className="h-8 w-8 text-ink-faint mx-auto" />
          <h4 className="text-xs sm:text-sm font-semibold text-ink">
            {rankedAll.length === 0
              ? "No evaluated student scores recorded yet."
              : "No students match your filter criteria."}
          </h4>
          <p className="text-xs text-ink-muted max-w-sm mx-auto">
            {rankedAll.length === 0
              ? "Once answer sheets are graded and marks are recorded, the ranked leaderboard will compute automatically."
              : `Try clearing "${effectiveSearchTerm || effectiveBracketFilter}" to view all student standings.`}
          </p>
        </div>
      ) : isStudentView ? (
        /* =========================================================================
           STUDENT PWA VIEW: EXACTLY 3 COLUMNS (Rank, Student, Score)
           Full-size dignified rows with smooth bottom-fade scrolling experience.
           ========================================================================= */
        <div className="w-full rounded-xl border border-hairline bg-surface shadow-2xs overflow-hidden">
          <div
            className="max-h-[50vh] sm:max-h-[55vh] overflow-y-auto relative sleek-scrollbar overscroll-contain"
            style={{
              maskImage: "linear-gradient(to bottom, black calc(100% - 44px), transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 44px), transparent 100%)",
            }}
          >
            <table className="w-full text-left text-xs border-collapse table-fixed">
              <thead className="sticky top-0 z-10 bg-canvas-soft border-b border-hairline shadow-2xs">
                <tr className="text-ink-muted font-medium text-[10.5px] sm:text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-2.5 sm:px-3 text-center w-14 sm:w-16">Rank</th>
                  <th className="py-2.5 px-2.5 sm:px-3">Student</th>
                  <th className="py-2.5 px-2.5 sm:px-3 text-right w-20 sm:w-24">Score (/{maxMarks}m)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {filteredRanked.map((item) => {
                  const isYou = item.isCurrentStudent;
                  const isRank1 = item.rank === 1;
                  const isRank2 = item.rank === 2;
                  const isRank3 = item.rank === 3;

                  // Subtle row-wise gold, silver, bronze tint from left fading to right
                  const rowTintClass = isYou
                    ? "bg-gradient-to-r from-primary/20 via-primary/5 to-transparent border-l-4 border-l-primary font-medium"
                    : isRank1
                    ? "bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent dark:from-amber-400/20 dark:via-amber-400/5 dark:to-transparent hover:from-amber-500/20"
                    : isRank2
                    ? "bg-gradient-to-r from-slate-400/15 via-slate-400/5 to-transparent dark:from-slate-300/20 dark:via-slate-300/5 dark:to-transparent hover:from-slate-400/20"
                    : isRank3
                    ? "bg-gradient-to-r from-amber-700/15 via-amber-700/5 to-transparent dark:from-amber-600/20 dark:via-amber-600/5 dark:to-transparent hover:from-amber-700/20"
                    : "bg-surface hover:bg-canvas-soft/50";

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors h-12 ${rowTintClass}`}
                    >
                      {/* Column 1: Rank */}
                      <td className="py-2.5 px-2.5 sm:px-3 text-center whitespace-nowrap">
                        {renderRankBadge(item.rank)}
                      </td>

                      {/* Column 2: Student (NO Roll Number) */}
                      <td className="py-2.5 px-2.5 sm:px-3 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`truncate text-xs sm:text-sm ${isYou ? "font-bold text-ink" : "font-medium text-ink"}`}>
                            {item.student_name}
                          </span>
                          {isYou && (
                            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-primary text-white tracking-wide uppercase shrink-0">
                              You
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 3: Score (Minimal: only score number, total marks in header) */}
                      <td className="py-2.5 px-2.5 sm:px-3 text-right whitespace-nowrap">
                        <span className="font-mono font-bold text-ink text-xs sm:text-sm">
                          {item.effectiveScore.toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* =========================================================================
           FACULTY / ROSTER VIEW: Comprehensive 7 columns with inspection links
           ========================================================================= */
        <div className={`overflow-x-auto ${hideToolbar ? "rounded-none border-0 shadow-none" : "rounded-xl border border-hairline shadow-2xs"} bg-surface sleek-scrollbar w-full`}>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas-soft border-b border-hairline text-ink-muted font-medium text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4 text-center w-20">Rank</th>
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4 text-right">Score</th>
                <th className="py-3 px-4 text-center">Percentage</th>
                <th className="py-3 px-4 text-center hidden sm:table-cell">Percentile</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filteredRanked.map((item) => {
                const isTop3 = item.rank <= 3;
                const pct = item.effectivePercentage;
                const scoreColor =
                  pct >= 75 ? "green" : pct >= 60 ? "teal" : pct >= 40 ? "sky" : "orange";

                const isYou = item.isCurrentStudent;

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      isYou
                        ? "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary font-medium"
                        : isTop3
                        ? "bg-surface hover:bg-canvas-soft/70"
                        : "hover:bg-canvas-soft/50"
                    }`}
                  >
                    {/* Rank Badge Column */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {renderRankBadge(item.rank)}
                    </td>

                    {/* Student Identity */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-semibold text-ink flex items-center gap-1.5">
                            <span>{item.student_name}</span>
                            {isYou && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-primary text-white tracking-wide uppercase">
                                You
                              </span>
                            )}
                            {Boolean(item.is_manual_override) && (
                              <span className="px-1.5 py-0.2 rounded text-[9.5px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                Overridden
                              </span>
                            )}
                          </div>
                          {item.roll_number && (
                            <div className="text-[11px] font-mono text-ink-muted">
                              Roll: <strong className="text-ink font-semibold">{item.roll_number}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Score */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span className="font-mono font-bold text-ink text-sm">
                        {item.effectiveScore.toFixed(1)}
                      </span>
                      <span className="font-mono text-ink-muted text-[11px] ml-1">
                        / {item.effectiveMaxMarks}m
                      </span>
                    </td>

                    {/* Percentage */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span className="font-mono font-bold text-ink text-xs">
                        {item.effectivePercentage.toFixed(1)}%
                      </span>
                    </td>

                    {/* Percentile */}
                    <td className="py-3 px-4 text-center whitespace-nowrap font-mono text-xs text-ink-secondary hidden sm:table-cell">
                      {item.percentile}th %ile
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {item.status === "NEEDS_REVIEW" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800/40">
                          Needs Review
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/40">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          Finalized
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <Link
                        href={`/grading/${item.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover hover:underline"
                      >
                        <span>Inspect Sheet</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
