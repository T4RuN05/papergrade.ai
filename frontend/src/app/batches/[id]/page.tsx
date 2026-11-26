"use client";

import React, { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  GraduationCap,
  Sparkles,
  Award,
  Search,
  ArrowRight,
  FileCheck2,
  Building2,
  AlertCircle,
  FileText,
  Lock,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { useSetBreadcrumbs } from "@/lib/BreadcrumbContext";
import { useToast } from "@/lib/ToastContext";
import { useTenant } from "@/lib/TenantContext";
import { useBatchDetail, useExamDetail } from "@/lib/queries";
import {
  AppleSelect,
  MetricValue,
  TableSkeletonRows,
  Skeleton,
} from "@/components/ui";

export default function SingleBatchPage() {
  const params = useParams();
  const { toast } = useToast();
  const { selectedInstitute, selectedBranch } = useTenant();
  const batchId = params.id as string;

  const [searchTerm, setSearchTerm] = useState("");
  const [scoreFilter, setScoreFilter] = useState<"ALL" | "TOP" | "MID" | "LOW">("ALL");

  // TanStack Queries (Cached in-memory, instant back-nav, CLS = 0.00)
  const { data: batch, isLoading: isBatchLoading } = useBatchDetail(batchId);
  const { data: exam } = useExamDetail(batch?.exam_id || "");

  useSetBreadcrumbs(
    {
      group: "Academic Operations",
      segments: [
        { label: "Batches & Roster", href: "/branch/batches" },
        { label: batch?.name || (batchId ? `Batch (${batchId.slice(0, 8)})` : "Batch Details") },
      ],
    },
    [batch?.name, batchId]
  );

  const submissions = useMemo(() => batch?.submissions || [], [batch?.submissions]);

  // Calculations for KPI Cards
  const stats = useMemo(() => {
    if (!submissions || submissions.length === 0) {
      return { total: batch?.total_submissions || 0, completed: batch?.completed_submissions || 0, avgMarks: 0, avgPct: 0, maxScore: 0, minScore: 0, passRate: 0 };
    }
    const completedSubs = submissions.filter((s) => s.status === "COMPLETED");
    const count = completedSubs.length;
    if (count === 0) {
      return { total: submissions.length, completed: 0, avgMarks: 0, avgPct: 0, maxScore: 0, minScore: 0, passRate: 0 };
    }

    const totalMarks = completedSubs.reduce((acc, curr) => acc + (curr.total_awarded_marks || 0), 0);
    const avgMarks = totalMarks / count;
    const avgPct = completedSubs.reduce((acc, curr) => acc + (curr.percentage || 0), 0) / count;

    let maxScore = -Infinity;
    let minScore = Infinity;
    let passCount = 0;

    completedSubs.forEach((s) => {
      const m = s.total_awarded_marks || 0;
      if (m > maxScore) maxScore = m;
      if (m < minScore) minScore = m;
      if ((s.percentage || 0) >= 40) passCount++;
    });

    const passRate = (passCount / count) * 100;

    return {
      total: submissions.length,
      completed: count,
      avgMarks,
      avgPct,
      maxScore: maxScore === -Infinity ? 0 : maxScore,
      minScore: minScore === Infinity ? 0 : minScore,
      passRate,
    };
  }, [submissions, batch]);

  // Filtered Submissions
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((sub) => {
      const query = searchTerm.toLowerCase().trim();
      const matchesQuery =
        !query ||
        sub.student_name.toLowerCase().includes(query) ||
        sub.roll_number.toLowerCase().includes(query);

      if (!matchesQuery) return false;

      if (scoreFilter === "TOP") return (sub.percentage || 0) >= 75;
      if (scoreFilter === "MID") return (sub.percentage || 0) >= 40 && (sub.percentage || 0) < 75;
      if (scoreFilter === "LOW") return (sub.percentage || 0) < 40;
      return true;
    });
  }, [submissions, searchTerm, scoreFilter]);

  if (!isBatchLoading && !batch) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <div className="notion-card rounded-lg p-8 text-center space-y-4">
          <div className="mx-auto h-11 w-11 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-center text-red-600 dark:text-[#f28b82]">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h2 className="notion-heading-3 text-base text-ink">Batch Not Found</h2>
          <p className="text-xs text-ink-muted">
            The batch ID <code className="font-mono bg-canvas-soft border border-hairline px-1.5 py-0.5 rounded-xs">{batchId}</code> could not be located in the academic registry.
          </p>
          <div className="pt-2">
            <Link href="/branch/batches" className="notion-btn-utility">
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
              <span>Return to Batches &amp; Roster</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const renderStatusBadge = (sub: any) => {
    const s = (sub.status || "UPLOADED").toUpperCase();
    const dot =
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
        title={s === "FAILED" ? sub.error_message || "Evaluation failed." : undefined}
      >
        {s === "PROCESSING" ? (
          <RefreshCw className="h-3 w-3 animate-spin text-primary shrink-0" />
        ) : (
          <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
        )}
        {label}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Main Header Card */}
      <div className="notion-card rounded-lg p-4 sm:p-6 md:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-5 border-b border-hairline">
          <div className="space-y-2 max-w-2xl min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {isBatchLoading && !batch ? (
                <>
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary">
                    <span className={`w-1.5 h-1.5 rounded-full ${batch?.status === "COMPLETED" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    {batch?.status === "COMPLETED" ? "Evaluation Completed" : batch?.status || "Active"}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-muted tabular-nums">
                    AY {batch?.academic_year || "2026"}
                  </span>
                </>
              )}
            </div>
            {isBatchLoading && !batch ? (
              <Skeleton className="h-8 w-64 rounded-md my-0.5" />
            ) : (
              <h1 className="notion-heading-2 text-2xl sm:text-[28px] text-ink break-words">
                {batch?.name}
              </h1>
            )}
            <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
              Enrolled evaluation batch for{" "}
              <span className="font-medium text-ink">
                {selectedInstitute?.name || "Coaching Institute"}
              </span>
              {selectedBranch?.name ? ` (${selectedBranch.name})` : ""}. Total registered scripts:{" "}
              {isBatchLoading && !batch ? (
                <span className="font-mono font-semibold text-ink">...</span>
              ) : (
                <span className="font-mono tabular-nums font-semibold text-ink">
                  {batch?.total_submissions || 0} submissions
                </span>
              )}.
            </p>
          </div>

          {/* Balanced Action Buttons */}
          <div className="grid grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:flex sm:flex-wrap sm:items-center gap-2 w-full lg:w-auto shrink-0">
            {batch?.exam_id && (
              <Link href={`/exams/${batch.exam_id}`} className="notion-btn-utility justify-center">
                <GraduationCap className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Exam Details</span>
              </Link>
            )}

            {batch?.exam_id && (
              <Link href={`/marks?exam_id=${batch.exam_id}`} className="notion-btn-utility justify-center">
                <FileCheck2 className="h-3.5 w-3.5 text-ink-secondary shrink-0" />
                <span>Marks Ledger</span>
              </Link>
            )}

            {stats.completed > 0 && batch && (
              <a
                href={api.getBatchZipUrl(batch.id, `${(batch.name || "Batch").replace(/\s+/g, "_")}_Graded_PDFs.zip`)}
                download={`${(batch.name || "Batch").replace(/\s+/g, "_")}_Graded_PDFs.zip`}
                onClick={() => toast.info("Preparing and downloading batch graded PDFs archive...", { title: "ZIP Archive Export" })}
                className="notion-btn-primary justify-center"
              >
                <Download className="h-3.5 w-3.5 shrink-0" />
                <span>Download Graded PDFs (ZIP)</span>
              </a>
            )}
          </div>
        </div>

        {/* Academic Context Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs bg-canvas-soft rounded-lg p-4 border border-hairline">
          <div className="flex items-start gap-2.5">
            <Building2 className="h-4 w-4 text-ink-muted mt-0.5 shrink-0" />
            <div className="min-w-0">
              <span className="text-ink-muted block text-[11px]">Academic Institution</span>
              <span className="font-semibold text-ink block truncate">
                {selectedInstitute?.name || "Coaching Institute"}
              </span>
              <span className="text-ink-secondary block text-[11px] truncate">
                {selectedBranch ? `${selectedBranch.name}${selectedBranch.city ? ` (${selectedBranch.city})` : ""}` : "Assigned Branch"}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <GraduationCap className="h-4 w-4 text-ink-muted mt-0.5 shrink-0" />
            <div className="min-w-0">
              <span className="text-ink-muted block text-[11px]">Linked Examination</span>
              {exam ? (
                <Link
                  href={`/exams/${exam.id}`}
                  className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
                >
                  <span className="truncate">{exam.title} ({exam.subject})</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </Link>
              ) : (
                <span className="text-ink-secondary font-medium">Official Curriculum Exam</span>
              )}
              <span className="text-ink-muted block text-[11px] tabular-nums">
                Max Marks: {exam?.total_marks && exam.total_marks > 0 ? exam.total_marks : "N/A"}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <FileText className="h-4 w-4 text-ink-muted mt-0.5 shrink-0" />
            <div className="min-w-0">
              <span className="text-ink-muted block text-[11px]">Evaluated Papers Storage</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400 block">
                Cloudflare R2 &amp; Supabase Verified
              </span>
              <span className="text-ink-muted text-[11px]">Zero-Egress Academic Vault</span>
            </div>
          </div>
        </div>

        {/* Performance Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-lg border border-hairline bg-canvas-soft p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
              <span className="font-medium truncate">Evaluated Papers</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <MetricValue
                isLoading={isBatchLoading}
                value={stats.completed}
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
                width="w-10"
              />
              <span className="text-xs text-ink-muted tabular-nums">/ {stats.total} total</span>
            </div>
            <div className="w-full bg-surface border border-hairline h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="rounded-lg border border-hairline bg-canvas-soft p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
              <span className="font-medium truncate">Batch Mean Score</span>
              <Award className="h-4 w-4 text-primary shrink-0" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <MetricValue
                isLoading={isBatchLoading}
                value={stats.avgMarks.toFixed(1)}
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
                width="w-12"
              />
              <span className="text-xs text-ink-muted tabular-nums">
                / {exam?.total_marks && exam.total_marks > 0 ? exam.total_marks : "—"}
              </span>
            </div>
            <div className="text-xs text-ink-muted mt-1.5 tabular-nums">
              Average: <span className="font-semibold text-ink">{stats.avgPct.toFixed(1)}%</span>
            </div>
          </div>

          <div className="rounded-lg border border-hairline bg-canvas-soft p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
              <span className="font-medium truncate">Top Score</span>
              <Sparkles className="h-4 w-4 text-ink-secondary shrink-0" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <MetricValue
                isLoading={isBatchLoading}
                value={stats.maxScore.toFixed(1)}
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
                width="w-12"
              />
              <span className="text-xs text-ink-muted tabular-nums">
                / {exam?.total_marks && exam.total_marks > 0 ? exam.total_marks : "—"}
              </span>
            </div>
            <div className="text-xs text-ink-muted mt-1.5 tabular-nums">
              Lowest: <span className="font-mono font-medium text-ink">{stats.minScore.toFixed(1)}</span>
            </div>
          </div>

          <div className="rounded-lg border border-hairline bg-canvas-soft p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-ink-muted mb-2">
              <span className="font-medium truncate">Pass Rate (≥40%)</span>
              <GraduationCap className="h-4 w-4 text-ink-secondary shrink-0" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <MetricValue
                isLoading={isBatchLoading}
                value={`${stats.passRate.toFixed(1)}%`}
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
                width="w-14"
              />
            </div>
            <div className="w-full bg-surface border border-hairline h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${stats.passRate}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Student Answer Sheets Table */}
      <div className="notion-card rounded-lg p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-hairline">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
                Student Answer Sheets
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-canvas-soft border border-hairline text-ink-muted tabular-nums">
                {filteredSubmissions.length} of {submissions.length}
              </span>
            </div>
            <p className="text-xs text-ink-muted">
              Inspect submitted scripts and per-question grading breakdown.
            </p>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-52">
              <Search className="h-3.5 w-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search student or roll #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 h-9 text-xs rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface focus:outline-none focus:border-primary text-ink placeholder:text-ink-faint w-full transition-colors"
              />
            </div>

            <AppleSelect
              size="sm"
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
          </div>
        </div>

        {/* Mobile Card View (< sm) */}
        <div className="sm:hidden divide-y divide-hairline rounded-lg border border-hairline overflow-hidden bg-surface">
          {isBatchLoading && submissions.length === 0 ? (
            [1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3.5 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-44" />
              </div>
            ))
          ) : filteredSubmissions.length === 0 ? (
            <div className="py-10 px-4 text-center space-y-2">
              <p className="text-xs font-semibold text-ink">No student submissions found matching current criteria.</p>
              <p className="text-xs text-ink-muted">Try clearing the search query or adjusting filters.</p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setScoreFilter("ALL");
                  }}
                  className="notion-btn-utility text-xs"
                >
                  Reset Search
                </button>
              </div>
            </div>
          ) : (
            filteredSubmissions.map((sub) => {
              const pct = sub.percentage || 0;
              const isQueuedOrEvaluating = ["QUEUED", "PROCESSING", "EVALUATING"].includes(
                (sub.status || "").toUpperCase()
              );

              return (
                <div key={sub.id} className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-ink truncate">
                        {sub.student_name}
                      </div>
                      <div className="text-[11px] font-mono text-ink-muted mt-0.5">
                        {sub.roll_number} • {sub.page_count || 1} {sub.page_count === 1 ? "pg" : "pgs"}
                      </div>
                    </div>
                    {renderStatusBadge(sub)}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="text-xs font-mono tabular-nums text-ink">
                      <span className="font-semibold">
                        {sub.total_awarded_marks != null ? sub.total_awarded_marks.toFixed(1) : "—"}
                      </span>
                      <span className="text-ink-muted">
                        {exam?.total_marks && exam.total_marks > 0 ? ` / ${exam.total_marks}` : ""}
                      </span>
                      <span className="text-ink-muted ml-1.5">({pct.toFixed(1)}%)</span>
                    </div>

                    {isQueuedOrEvaluating ? (
                      <span className="inline-flex items-center gap-1 text-xs text-ink-muted px-2.5 py-1 rounded-md bg-canvas-soft border border-hairline">
                        <Lock className="h-3 w-3 shrink-0" />
                        <span>Evaluating...</span>
                      </span>
                    ) : (
                      <Link
                        href={`/grading/${sub.id}`}
                        className="notion-btn-utility min-h-[30px] h-7 px-2.5 text-xs text-primary"
                      >
                        <span>Inspect</span>
                        <ArrowRight className="h-3 w-3 shrink-0" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View (sm+) */}
        <div className="hidden sm:block overflow-x-auto rounded-lg border border-hairline">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas-soft border-b border-hairline text-ink-muted font-medium">
                <th className="py-3 px-4">Roll Number</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4 text-center">Pages</th>
                <th className="py-3 px-4 text-right">Marks Awarded</th>
                <th className="py-3 px-4 text-center">Score %</th>
                <th className="py-3 px-4 text-center">Evaluation Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline bg-surface">
              {isBatchLoading && submissions.length === 0 ? (
                <TableSkeletonRows
                  rowCount={6}
                  columns={[
                    { width: "w-24" },
                    { width: "w-36" },
                    { width: "w-10", align: "center" },
                    { width: "w-20", align: "right" },
                    { width: "w-14", align: "center" },
                    { width: "w-24", align: "center" },
                    { width: "w-16", align: "right" },
                  ]}
                />
              ) : filteredSubmissions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center space-y-2">
                    <p className="text-xs font-semibold text-ink">No student submissions found matching current criteria.</p>
                    <p className="text-xs text-ink-muted">Try clearing the search query or adjusting filters.</p>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm("");
                          setScoreFilter("ALL");
                        }}
                        className="notion-btn-utility"
                      >
                        Reset Search
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSubmissions.map((sub) => {
                  const pct = sub.percentage || 0;

                  return (
                    <tr
                      key={sub.id}
                      className="hover:bg-canvas-soft/60 transition-colors group"
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
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <span className="font-semibold text-ink">
                          {sub.total_awarded_marks != null ? sub.total_awarded_marks.toFixed(1) : "—"}
                        </span>
                        <span className="text-ink-muted text-[11px]">
                          {exam?.total_marks && exam.total_marks > 0 ? ` / ${exam.total_marks}` : ""}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono tabular-nums">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-xs font-medium text-ink">
                          {pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {renderStatusBadge(sub)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {["QUEUED", "PROCESSING", "EVALUATING"].includes(
                          (sub.status || "").toUpperCase()
                        ) ? (
                          <span
                            className="inline-flex items-center gap-1.5 font-medium text-ink-muted text-xs px-2.5 py-1 rounded-md opacity-55 bg-canvas-soft border border-hairline cursor-not-allowed select-none"
                            title="AI evaluation is currently processing this paper. Sheet inspection will unlock once completed."
                          >
                            <Lock className="h-3 w-3 shrink-0" />
                            <span>Evaluating...</span>
                          </span>
                        ) : (
                          <Link
                            href={`/grading/${sub.id}`}
                            className="inline-flex items-center gap-1 font-medium text-primary hover:text-primary-active transition-colors text-xs px-2.5 py-1 rounded-md hover:bg-canvas-soft"
                          >
                            <span>Inspect Sheet</span>
                            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
