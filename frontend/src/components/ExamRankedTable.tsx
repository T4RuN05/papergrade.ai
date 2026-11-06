"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Trophy,
  Medal,
  Award,
  Search,
  Download,
  ArrowRight,
  TrendingUp,
  Target,
  Sparkles,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  AlertCircle,
  BarChart3,
  X,
  Layers,
} from "lucide-react";
import { BadgePill } from "./ui";
import { useToast } from "@/lib/ToastContext";

export interface ExamRankedItem {
  id: string;
  student_name: string;
  roll_number: string;
  student_id?: string;
  total_awarded_marks: number | null;
  max_marks?: number;
  percentage?: number | null;
  status?: string;
  is_manual_override?: boolean | number;
  page_count?: number;
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
}

export function ExamRankedTable({
  examId,
  examTitle,
  maxMarks = 25,
  submissions,
  isStudentView = false,
  currentStudentRoll = "",
  currentStudentId = "",
}: ExamRankedTableProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [bracketFilter, setBracketFilter] = useState<"ALL" | "TOP10" | "DISTINCTION" | "PASS">("ALL");

  // 1. Filter evaluated submissions with valid marks
  const evaluatedSubmissions = useMemo(() => {
    return submissions.filter(
      (s) =>
        s.total_awarded_marks !== null &&
        s.total_awarded_marks !== undefined &&
        s.status?.toUpperCase() !== "FAILED"
    );
  }, [submissions]);

  // 2. Compute rankings with standard competition tie-break logic
  const rankedAll = useMemo(() => {
    // Sort descending by marks, then percentage, then roll number
    const sorted = [...evaluatedSubmissions].sort((a, b) => {
      const marksA = Number(a.total_awarded_marks ?? 0);
      const marksB = Number(b.total_awarded_marks ?? 0);
      if (Math.abs(marksB - marksA) > 0.001) return marksB - marksA;

      const pctA = Number(a.percentage ?? 0);
      const pctB = Number(b.percentage ?? 0);
      if (Math.abs(pctB - pctA) > 0.001) return pctB - pctA;

      return a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true });
    });

    let currentRank = 1;
    return sorted.map((sub, idx, arr) => {
      const currentScore = Number(sub.total_awarded_marks ?? 0);
      if (idx > 0) {
        const prevScore = Number(arr[idx - 1].total_awarded_marks ?? 0);
        if (Math.abs(currentScore - prevScore) > 0.001) {
          currentRank = idx + 1; // Standard competition ranking (1, 2, 2, 4)
        }
      }

      const totalStudents = arr.length;
      const percentile =
        totalStudents > 1
          ? Math.max(0, Math.min(100, Math.round(((totalStudents - currentRank) / (totalStudents - 1)) * 100)))
          : 100;

      const isCurrentStudent =
        Boolean(currentStudentRoll && sub.roll_number?.toLowerCase() === currentStudentRoll.toLowerCase()) ||
        Boolean(currentStudentId && sub.student_id === currentStudentId);

      return {
        ...sub,
        rank: currentRank,
        percentile,
        isCurrentStudent,
        effectiveMaxMarks: sub.max_marks || maxMarks || 25,
        effectiveScore: currentScore,
        effectivePercentage: Number(sub.percentage ?? (currentScore / (sub.max_marks || maxMarks || 25)) * 100),
      };
    });
  }, [evaluatedSubmissions, maxMarks, currentStudentRoll, currentStudentId]);

  // 3. Compute High-Level Summary Statistics
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

  // 4. Apply search & bracket filtering
  const filteredRanked = useMemo(() => {
    return rankedAll.filter((item) => {
      // Search
      const query = searchTerm.trim().toLowerCase();
      const matchSearch =
        !query ||
        item.student_name.toLowerCase().includes(query) ||
        item.roll_number.toLowerCase().includes(query);

      if (!matchSearch) return false;

      // Bracket
      if (bracketFilter === "TOP10") return item.rank <= 10;
      if (bracketFilter === "DISTINCTION") return item.effectivePercentage >= 75;
      if (bracketFilter === "PASS") return item.effectivePercentage >= 40 && item.effectivePercentage < 75;
      return true;
    });
  }, [rankedAll, searchTerm, bracketFilter]);

  // 5. Export Ranked List as CSV
  const handleExportCSV = () => {
    if (rankedAll.length === 0) {
      toast.warning("No ranked student data available to export.", { title: "Export CSV" });
      return;
    }

    const headers = ["Rank", "Roll Number", "Student Name", "Marks Awarded", "Max Marks", "Percentage", "Percentile", "Status"];
    const rows = rankedAll.map((r) => [
      r.rank,
      `"${r.roll_number}"`,
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

    toast.success("Ranked exam standings exported successfully.", { title: "CSV Download" });
  };

  // Helper to render Rank column badge
  const renderRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span
          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 ring-2 ring-amber-400/25 shadow-2xs shrink-0"
          title="Rank 1 • Gold"
        >
          <Trophy className="h-3.5 w-3.5 text-amber-700 shrink-0" />
          <span>#1</span>
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span
          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-800 border border-slate-300 ring-2 ring-slate-400/20 shadow-2xs shrink-0"
          title="Rank 2 • Silver"
        >
          <Medal className="h-3.5 w-3.5 text-slate-600 shrink-0" />
          <span>#2</span>
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span
          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-orange-50 text-orange-900 border border-[#d7a177] ring-2 ring-[#c08250]/20 shadow-2xs shrink-0"
          title="Rank 3 • Bronze"
        >
          <Award className="h-3.5 w-3.5 text-[#b86227] shrink-0" />
          <span>#3</span>
        </span>
      );
    }
    return (
      <span className="font-mono text-xs font-bold text-ink-muted px-2 py-0.5 inline-block text-center min-w-[28px]">
        #{rank}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* SUMMARY DISTRIBUTION METRICS BANNER */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
          {/* Topper */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-surface border border-hairline shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-ink-muted text-[11px] font-medium">
              <span>Top Score</span>
              <Trophy className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg sm:text-xl font-bold font-mono text-ink">
                {stats.topper?.effectiveScore.toFixed(1)}
              </span>
              <span className="text-xs text-ink-muted font-mono">/ {stats.topper?.effectiveMaxMarks}m</span>
            </div>
            <div className="text-[10.5px] text-ink-muted truncate">
              {stats.topper?.student_name}
            </div>
          </div>

          {/* Average */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-surface border border-hairline shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-ink-muted text-[11px] font-medium">
              <span>Class Mean</span>
              <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg sm:text-xl font-bold font-mono text-ink">
                {stats.average}
              </span>
              <span className="text-xs text-ink-muted font-mono">/ {maxMarks}m</span>
            </div>
            <div className="text-[10.5px] text-ink-muted">
              {((stats.average / (maxMarks || 25)) * 100).toFixed(0)}% avg performance
            </div>
          </div>

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
            <div className="text-[10.5px] text-ink-muted">
              50th percentile score
            </div>
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
              <span className="text-xs text-ink-muted">
                of {stats.total} students
              </span>
            </div>
            <div className="text-[10.5px] text-ink-muted">
              {((stats.distinctionCount / stats.total) * 100).toFixed(0)}% distinction rate
            </div>
          </div>
        </div>
      )}

      {/* SEARCH, BRACKET FILTERS, & EXPORT TOOLBAR */}
      <div className="p-3 sm:p-3.5 rounded-2xl bg-surface border border-hairline shadow-2xs space-y-2.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search student by name or roll number..."
              className="w-full pl-9 pr-8 py-1.5 bg-canvas-soft/80 hover:bg-canvas-soft focus:bg-surface text-xs text-ink placeholder:text-ink-muted rounded-xl border border-hairline focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink rounded transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-hairline bg-surface hover:bg-canvas-soft text-xs font-semibold text-ink transition-colors cursor-pointer shadow-2xs shrink-0 whitespace-nowrap"
            title="Download complete ranked list as CSV"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>Export CSV</span>
          </button>
        </div>

        {/* Quick Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
          <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mr-1">
            Filter:
          </span>
          <button
            type="button"
            onClick={() => setBracketFilter("ALL")}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer ${
              bracketFilter === "ALL"
                ? "bg-primary text-white font-semibold shadow-2xs"
                : "bg-canvas-soft/80 text-ink-muted hover:text-ink hover:bg-canvas-soft border border-hairline/70 font-medium"
            }`}
          >
            All Ranked ({rankedAll.length})
          </button>
          <button
            type="button"
            onClick={() => setBracketFilter("TOP10")}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer ${
              bracketFilter === "TOP10"
                ? "bg-primary text-white font-semibold shadow-2xs"
                : "bg-canvas-soft/80 text-ink-muted hover:text-ink hover:bg-canvas-soft border border-hairline/70 font-medium"
            }`}
          >
            Top 10
          </button>
          <button
            type="button"
            onClick={() => setBracketFilter("DISTINCTION")}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer ${
              bracketFilter === "DISTINCTION"
                ? "bg-emerald-600 text-white font-semibold shadow-2xs"
                : "bg-canvas-soft/80 text-ink-muted hover:text-ink hover:bg-canvas-soft border border-hairline/70 font-medium"
            }`}
          >
            Distinction (≥75%)
          </button>
          <button
            type="button"
            onClick={() => setBracketFilter("PASS")}
            className={`px-2.5 py-1 rounded-lg text-[11px] transition-all cursor-pointer ${
              bracketFilter === "PASS"
                ? "bg-sky-600 text-white font-semibold shadow-2xs"
                : "bg-canvas-soft/80 text-ink-muted hover:text-ink hover:bg-canvas-soft border border-hairline/70 font-medium"
            }`}
          >
            Passing (40% - 74%)
          </button>

          {(searchTerm || bracketFilter !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setBracketFilter("ALL");
              }}
              className="text-[11px] font-semibold text-primary hover:underline ml-1 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* RANKED TABLE VIEW */}
      {filteredRanked.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface p-8 text-center space-y-2 shadow-2xs">
          <BarChart3 className="h-8 w-8 text-ink-faint mx-auto" />
          <h4 className="text-xs sm:text-sm font-semibold text-ink">
            {rankedAll.length === 0
              ? "No evaluated student scores recorded yet."
              : "No students match your filter criteria."}
          </h4>
          <p className="text-xs text-ink-muted max-w-sm mx-auto">
            {rankedAll.length === 0
              ? "Once answer sheets are graded and marks are recorded, the ranked leaderboard will compute automatically."
              : `Try clearing "${searchTerm || bracketFilter}" to view all student standings.`}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-hairline bg-surface shadow-2xs sleek-scrollbar">
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
                          <div className="text-[11px] font-mono text-ink-muted">
                            Roll: <strong className="text-ink font-semibold">{item.roll_number}</strong>
                          </div>
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
                      <BadgePill
                        label={`${item.effectivePercentage.toFixed(1)}%`}
                        color={scoreColor}
                      />
                    </td>

                    {/* Percentile */}
                    <td className="py-3 px-4 text-center whitespace-nowrap font-mono text-xs text-ink-secondary hidden sm:table-cell">
                      {item.percentile}th %ile
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {item.status === "NEEDS_REVIEW" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          Needs Review
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          Finalized
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {isStudentView ? (
                        <Link
                          href={`/student/submissions/${item.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover hover:underline"
                        >
                          <span>View Sheet</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      ) : (
                        <Link
                          href={`/grading/${item.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover hover:underline"
                        >
                          <span>Inspect Sheet</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
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

