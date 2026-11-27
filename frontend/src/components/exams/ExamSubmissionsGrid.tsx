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
  ArrowRight,
} from "lucide-react";
import { AppleSelect, TableSkeletonRows, RefetchProgressLine, Skeleton } from "@/components/ui";

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
    const dotColor =
      s === "COMPLETED" || s === "GRADED"
        ? "bg-emerald-500"
        : s === "PROCESSING"
        ? "bg-primary"
        : s === "QUEUED"
        ? "bg-amber-500"
        : s === "FAILED"
        ? "bg-rose-500"
        : s === "NEEDS_REVIEW"
        ? "bg-amber-500"
        : "bg-ink-faint";

    const label =
      s === "COMPLETED" || s === "GRADED"
        ? "Completed"
        : s === "PROCESSING"
        ? "Processing"
        : s === "QUEUED"
        ? "Queued"
        : s === "FAILED"
        ? "Failed"
        : s === "NEEDS_REVIEW"
        ? "Needs Review"
        : s.charAt(0) + s.slice(1).toLowerCase();

    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-secondary bg-canvas-soft px-2.5 py-0.5 rounded-full border border-hairline whitespace-nowrap"
        title={s === "FAILED" ? errorDetails || "Evaluation failed." : undefined}
      >
        {s === "PROCESSING" ? (
          <RefreshCw className="h-3 w-3 animate-spin text-primary shrink-0" />
        ) : (
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />
        )}
        {label}
      </span>
    );
  };

  return (
    <div className="notion-card relative rounded-lg overflow-hidden">
      {/* Background Refetch Progress Line */}
      <RefetchProgressLine isFetching={isRefreshing} />

      {/* Top Header Toolbar */}
      <div className="p-3.5 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-hairline bg-surface">
        {/* Left: View Switcher */}
        <div className="flex items-center w-full lg:w-auto">
          <div className="grid grid-cols-2 sm:inline-flex items-center p-0.5 rounded-md bg-canvas-soft border border-hairline w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setSubmissionViewMode("roster")}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer ${
                submissionViewMode === "roster"
                  ? "bg-surface text-ink border border-hairline shadow-2xs"
                  : "text-ink-muted hover:text-ink border border-transparent"
              }`}
            >
              <Layers className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Roster ({submissions.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setSubmissionViewMode("ranked")}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer ${
                submissionViewMode === "ranked"
                  ? "bg-surface text-ink border border-hairline shadow-2xs"
                  : "text-ink-muted hover:text-ink border border-transparent"
              }`}
            >
              <Trophy className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">Ranked Standings</span>
            </button>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
          <div className="relative w-full sm:w-48 md:w-52">
            <Search className="h-3.5 w-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search student or roll #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-7 h-9 text-xs rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface focus:outline-none focus:border-primary text-ink placeholder:text-ink-faint w-full transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-ink-muted hover:text-ink rounded-xs cursor-pointer"
                title="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
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

            {submissionViewMode === "roster" && (
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
            )}

            <button
              type="button"
              onClick={submissionViewMode === "roster" ? onExportRosterCsv : onExportRankedCsv}
              className="notion-btn-utility justify-center text-xs shrink-0"
              title="Export CSV"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-ink-secondary shrink-0" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="notion-btn-utility justify-center text-xs shrink-0 disabled:opacity-50"
              title="Refresh ledger"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : "text-ink-muted"} shrink-0`} />
              <span>{isRefreshing ? "Updating..." : "Refresh"}</span>
            </button>

            {needsReviewCount > 0 && onClearAllReviews && (
              <button
                type="button"
                onClick={onClearAllReviews}
                disabled={isBulkClearing}
                className="notion-btn-utility justify-center text-xs shrink-0 disabled:opacity-50"
                title="Unflag all flagged papers in this exam"
              >
                {isBulkClearing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
                <span>Unflag ({needsReviewCount})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
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
        <>
          {/* Mobile Card List (< sm) */}
          <div className="sm:hidden divide-y divide-hairline bg-surface">
            {isLoading && submissions.length === 0 ? (
              [1, 2, 3, 4].map((i) => (
                <div key={i} className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-44" />
                </div>
              ))
            ) : filteredSubmissions.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-2">
                <p className="text-xs font-semibold text-ink">No submissions match the search criteria.</p>
                <p className="text-xs text-ink-muted">Clear filters or try another student name or roll number.</p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm("");
                      setScoreFilter("ALL");
                    }}
                    className="notion-btn-utility text-xs"
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            ) : (
              filteredSubmissions.map((sub) => {
                const isGraded = sub.status === "COMPLETED" || sub.status === "GRADED";
                const pct = sub.percentage || 0;
                return (
                  <div
                    key={sub.id}
                    className={`p-3.5 space-y-2.5 ${isRefreshing ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-ink truncate">
                          {sub.student_name}
                        </div>
                        <div className="text-[11px] font-mono text-ink-muted mt-0.5">
                          {sub.roll_number} • {sub.page_count || 1} {sub.page_count === 1 ? "pg" : "pgs"}
                        </div>
                      </div>
                      {renderStatusBadge(sub.status, sub.error_details)}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="text-xs font-mono tabular-nums text-ink">
                        {isGraded ? (
                          <>
                            <span className="font-semibold">{sub.total_awarded_marks} / {sub.max_marks}</span>
                            <span className="text-ink-muted ml-1.5">({pct}%)</span>
                          </>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </div>

                      <Link
                        href={`/grading/${sub.id}`}
                        className="notion-btn-utility min-h-0 h-7 px-2.5 text-primary"
                      >
                        <span>Inspect Sheet</span>
                        <ArrowRight className="h-3 w-3 shrink-0" />
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table (sm+) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-canvas-soft border-b border-hairline text-ink-muted font-medium text-xs">
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
                      <p className="text-xs text-ink-muted">Clear filters or try searching for another student name or roll number.</p>
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTerm("");
                            setScoreFilter("ALL");
                          }}
                          className="notion-btn-utility"
                        >
                          Reset Filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredSubmissions.map((sub) => {
                    const pct = sub.percentage || 0;
                    const isGraded = sub.status === "COMPLETED" || sub.status === "GRADED";

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
                        <td className="py-3 px-4 text-center font-mono tabular-nums text-ink-secondary">
                          {sub.page_count || 1}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-ink">
                          {isGraded ? `${sub.total_awarded_marks} / ${sub.max_marks}` : "—"}
                        </td>
                        <td className="py-3 px-4 text-center font-mono tabular-nums">
                          {isGraded ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-xs font-medium text-ink">
                              {pct}%
                            </span>
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
                            className="notion-btn-utility min-h-0 h-7 px-2.5 text-primary"
                          >
                            <span>Inspect Sheet</span>
                            <ArrowRight className="h-3 w-3 shrink-0" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
