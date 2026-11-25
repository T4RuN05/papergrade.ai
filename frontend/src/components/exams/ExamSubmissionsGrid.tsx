"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Layers,
  Trophy,
  Search,
  X,
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  FileText,
  Clock,
  ExternalLink,
} from "lucide-react";
import { BadgePill, ButtonUtility, AppleSelect, TableSkeletonRows, RefetchProgressLine } from "@/components/ui";

const ExamRankedTable = dynamic(
  () => import("@/components/ExamRankedTable").then((m) => m.ExamRankedTable),
  { ssr: false }
);

interface SubmissionRow {
  id: string;
  exam_id: string;
  batch_id?: string;
  student_name: string;
  roll_number: string;
  total_awarded_marks: number;
  max_marks: number;
  percentage: number;
  status: string;
  publication_status: string;
  page_count: number;
  submitted_at?: string;
  error_details?: string;
}

interface ExamSubmissionsGridProps {
  examId: string;
  examTitle: string;
  maxMarks: number;
  submissions: SubmissionRow[];
  isRefreshing?: boolean;
  isLoading?: boolean;
  onRefresh: () => void;
  onExportRosterCsv: () => void;
  onExportRankedCsv: () => void;
  needsReviewCount: number;
  onClearAllReviews?: () => void;
  isBulkClearing?: boolean;
}

export function ExamSubmissionsGrid({
  examId,
  examTitle,
  maxMarks,
  submissions,
  isRefreshing = false,
  isLoading = false,
  onRefresh,
  onExportRosterCsv,
  onExportRankedCsv,
  needsReviewCount,
  onClearAllReviews,
  isBulkClearing = false,
}: ExamSubmissionsGridProps) {
  const [submissionViewMode, setSubmissionViewMode] = useState<"roster" | "ranked">("roster");
  const [searchTerm, setSearchTerm] = useState("");
  const [scoreFilter, setScoreFilter] = useState<"ALL" | "TOP" | "MID" | "LOW">("ALL");
  const [rankedBracket, setRankedBracket] = useState<"ALL" | "TOP10" | "DISTINCTION" | "PASS">("ALL");
  const [sortBy, setSortBy] = useState<"roll" | "marks_desc" | "marks_asc" | "name">("roll");

  // Roster Filter & Sort
  const filteredSubmissions = useMemo(() => {
    let list = [...submissions];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (s) =>
          s.student_name?.toLowerCase().includes(q) ||
          s.roll_number?.toLowerCase().includes(q)
      );
    }

    if (scoreFilter === "TOP") {
      list = list.filter((s) => (s.percentage || 0) >= 75);
    } else if (scoreFilter === "MID") {
      list = list.filter((s) => (s.percentage || 0) >= 40 && (s.percentage || 0) < 75);
    } else if (scoreFilter === "LOW") {
      list = list.filter((s) => (s.percentage || 0) < 40);
    }

    if (sortBy === "roll") {
      list.sort((a, b) => (a.roll_number || "").localeCompare(b.roll_number || ""));
    } else if (sortBy === "marks_desc") {
      list.sort((a, b) => (b.total_awarded_marks || 0) - (a.total_awarded_marks || 0));
    } else if (sortBy === "marks_asc") {
      list.sort((a, b) => (a.total_awarded_marks || 0) - (b.total_awarded_marks || 0));
    } else if (sortBy === "name") {
      list.sort((a, b) => (a.student_name || "").localeCompare(b.student_name || ""));
    }

    return list;
  }, [submissions, searchTerm, scoreFilter, sortBy]);

  const renderStatusBadge = (status: string, errorDetails?: string) => {
    const s = (status || "UPLOADED").toUpperCase();
    if (s === "COMPLETED" || s === "GRADED") {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800/40">
          <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          COMPLETED
        </span>
      );
    }
    if (s === "PROCESSING") {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400 px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-800/40">
          <RefreshCw className="h-3 w-3 animate-spin text-blue-600 dark:text-blue-400" />
          PROCESSING
        </span>
      );
    }
    if (s === "QUEUED") {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-800/40">
          <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
          QUEUED
        </span>
      );
    }
    if (s === "FAILED") {
      return (
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-400 px-2.5 py-1 rounded-md border border-red-200 dark:border-red-800/40"
          title={errorDetails || "Evaluation failed."}
        >
          <AlertCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
          FAILED
        </span>
      );
    }
    if (s === "NEEDS_REVIEW") {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-purple-700 bg-purple-50 dark:bg-purple-950/30 dark:text-purple-400 px-2.5 py-1 rounded-md border border-purple-200 dark:border-purple-800/40">
          <Eye className="h-3 w-3 text-purple-600 dark:text-purple-400" />
          NEEDS REVIEW
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-50 dark:bg-white/5 dark:text-slate-300 px-2.5 py-1 rounded-md border border-slate-200 dark:border-white/10">
        <FileText className="h-3 w-3 text-slate-500" />
        {s}
      </span>
    );
  };

  return (
    <div className="relative rounded-lg border border-hairline overflow-hidden bg-surface shadow-xs">
      {/* Background Refetch Progress Line */}
      <RefetchProgressLine isFetching={isRefreshing} />

      {/* Top Header Toolbar */}
      <div className="p-3 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 border-b border-hairline bg-surface">
        {/* Left: View Switcher */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="grid grid-cols-2 sm:inline-flex items-center p-0.5 rounded-md bg-canvas-soft border border-hairline w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setSubmissionViewMode("roster")}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                submissionViewMode === "roster"
                  ? "bg-surface text-ink shadow-2xs border border-hairline/80"
                  : "text-ink-muted hover:text-ink border border-transparent"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Roster Ledger ({submissions.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSubmissionViewMode("ranked")}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                submissionViewMode === "ranked"
                  ? "bg-surface text-ink shadow-2xs border border-hairline/80"
                  : "text-ink-muted hover:text-ink border border-transparent"
              }`}
            >
              <Trophy className="h-3.5 w-3.5 text-amber-600" />
              <span>Ranked Standings</span>
            </button>
          </div>
        </div>

        {/* Right: Controls (Search, Filter, Sort, Export, Refresh) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
          <div className="relative w-full sm:w-48 md:w-52">
            <Search className="h-3.5 w-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search student or roll #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-7 h-9 text-xs rounded-md border border-hairline bg-canvas-soft/80 hover:bg-canvas-soft focus:bg-surface focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-ink placeholder:text-ink-muted w-full transition-all shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-ink-muted hover:text-ink rounded cursor-pointer"
                title="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
            <div className="flex-1 sm:flex-none">
              {submissionViewMode === "roster" ? (
                <AppleSelect
                  value={scoreFilter}
                  onChange={(val: any) => setScoreFilter(val)}
                  className="w-full sm:w-auto"
                  options={[
                    { value: "ALL", label: "All Scores" },
                    { value: "TOP", label: "Distinction (≥75%)" },
                    { value: "MID", label: "Passing (40% - 74%)" },
                    { value: "LOW", label: "Needs Attention (<40%)" },
                  ]}
                />
              ) : (
                <AppleSelect
                  value={rankedBracket}
                  onChange={(val: any) => setRankedBracket(val)}
                  className="w-full sm:w-auto"
                  options={[
                    { value: "ALL", label: `All Ranked (${submissions.filter((s) => s.status === "COMPLETED" || s.status === "GRADED").length})` },
                    { value: "TOP10", label: "Top 10" },
                    { value: "DISTINCTION", label: "Distinction (≥75%)" },
                    { value: "PASS", label: "Passing (40% - 74%)" },
                  ]}
                />
              )}
            </div>

            {submissionViewMode === "roster" && (
              <div className="flex-1 sm:flex-none">
                <AppleSelect
                  value={sortBy}
                  onChange={(val: any) => setSortBy(val)}
                  className="w-full sm:w-auto"
                  options={[
                    { value: "roll", label: "Sort: Roll Number" },
                    { value: "marks_desc", label: "Sort: Highest Marks" },
                    { value: "marks_asc", label: "Sort: Lowest Marks" },
                    { value: "name", label: "Sort: Student Name" },
                  ]}
                />
              </div>
            )}

            <button
              type="button"
              onClick={submissionViewMode === "roster" ? onExportRosterCsv : onExportRankedCsv}
              className="btn-glass-utility h-9 px-3 rounded-md text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
              title="Export CSV"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="btn-glass-utility h-9 px-2.5 rounded-md text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
              title="Refresh ledger"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin text-primary" : "text-ink-muted"}`} />
              <span className="hidden sm:inline">{isRefreshing ? "Updating..." : "Refresh"}</span>
            </button>

            {needsReviewCount > 0 && onClearAllReviews && (
              <button
                type="button"
                onClick={onClearAllReviews}
                disabled={isBulkClearing}
                className="h-9 px-2.5 rounded-md text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs shrink-0"
                title="Unflag all flagged papers in this exam"
              >
                {isBulkClearing ? (
                  <RefreshCw className="h-3 w-3 animate-spin text-purple-600" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 text-purple-600" />
                )}
                <span>Unflag ({needsReviewCount})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table Content */}
      {submissionViewMode === "ranked" ? (
        <ExamRankedTable
          examId={examId}
          examTitle={examTitle}
          maxMarks={maxMarks || 25}
          submissions={submissions}
          hideSummaryCards={true}
          hideToolbar={true}
          searchTerm={searchTerm}
          bracketFilter={rankedBracket}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas-soft border-b border-hairline text-ink-muted font-medium text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4">Roll Number</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4 text-center">Pages</th>
                <th className="py-3 px-4 text-right">Marks Awarded</th>
                <th className="py-3 px-4 text-center">Score %</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Audit &amp; Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline bg-surface">
              {isLoading && submissions.length === 0 ? (
                <TableSkeletonRows
                  rowCount={6}
                  columns={[
                    { width: "w-24" },
                    { width: "w-36" },
                    { width: "w-10", align: "center" },
                    { width: "w-20", align: "right" },
                    { width: "w-14", align: "center" },
                    { width: "w-16", align: "center" },
                    { width: "w-16", align: "right" },
                  ]}
                />
              ) : filteredSubmissions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center space-y-2">
                    <p className="text-xs font-semibold text-ink">No submissions match the search criteria.</p>
                    <p className="text-[11px] text-ink-muted">Clear filters or try searching for another student name or roll number.</p>
                    <div className="pt-2">
                      <ButtonUtility onClick={() => { setSearchTerm(""); setScoreFilter("ALL"); }}>
                        Reset Filters
                      </ButtonUtility>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSubmissions.map((sub) => {
                  const pct = sub.percentage || 0;
                  const scoreBadgeColor =
                    pct >= 75 ? "green" : pct >= 60 ? "teal" : pct >= 40 ? "sky" : "orange";

                  return (
                    <tr
                      key={sub.id}
                      className={`hover:bg-canvas-soft/60 transition-colors group ${
                        isRefreshing ? "opacity-60" : ""
                      }`}
                    >
                    <td className="py-3 px-4 font-mono font-semibold text-ink">
                      {sub.roll_number}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-ink block">{sub.student_name}</span>
                      <span className="text-[10px] text-ink-faint font-mono">{sub.id.slice(0, 8)}...</span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-ink-secondary">
                      {sub.page_count || 1}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-ink">
                      {sub.status === "COMPLETED" || sub.status === "GRADED"
                        ? `${sub.total_awarded_marks} / ${sub.max_marks}`
                        : "—"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {sub.status === "COMPLETED" || sub.status === "GRADED" ? (
                        <BadgePill label={`${pct}%`} color={scoreBadgeColor} />
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {renderStatusBadge(sub.status, sub.error_details)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/grading/${sub.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                      >
                        <span>Canvas</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
