"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Layers,
  ArrowLeft,
  CheckCircle2,
  Clock,
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
  Eye,
} from "lucide-react";
import { api } from "@/lib/api";
import { Batch } from "@/lib/types";
import { useSetBreadcrumbs } from "@/lib/BreadcrumbContext";
import { useToast } from "@/lib/ToastContext";
import {
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
  ExamDetailSkeleton,
} from "@/components/ui";

export default function SingleBatchPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const batchId = params.id as string;

  const [batch, setBatch] = useState<Batch | null>(null);
  const [exam, setExam] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [scoreFilter, setScoreFilter] = useState<"ALL" | "TOP" | "MID" | "LOW">("ALL");

  useSetBreadcrumbs(
    useMemo(
      () => ({
        group: "Academic Operations",
        segments: [
          { label: "Batches & Roster", href: "/branch/batches" },
          { label: batch ? batch.name : "..." },
        ],
      }),
      [batch?.name]
    )
  );

  useEffect(() => {
    loadBatchData();
  }, [batchId]);

  const loadBatchData = async () => {
    setLoading(true);
    try {
      const data = await api.getBatch(batchId);
      setBatch(data);

      if (data?.exam_id) {
        const ex = await api.getExam(data.exam_id).catch(() => null);
        setExam(ex);
      }
    } catch (e) {
      console.error("Failed to load batch:", e);
    } finally {
      setLoading(false);
    }
  };

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

  if (loading) {
    return <ExamDetailSkeleton />;
  }

  if (!batch) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <FeatureCard className="p-8 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold text-ink">Batch Not Found</h2>
          <p className="text-xs text-ink-muted">
            The batch ID <code className="font-mono bg-canvas-soft px-1.5 py-0.5 rounded">{batchId}</code> could not be located in the academic registry.
          </p>
          <div className="pt-2">
            <ButtonUtility href="/branch/batches">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Return to Batches & Roster
            </ButtonUtility>
          </div>
        </FeatureCard>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Main Header Card */}
      <FeatureCard className="p-6 sm:p-8 space-y-6 border-hairline bg-surface">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-hairline">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <BadgePill label={`Code: ${batch.code || "BATCH"}`} color="purple" />
              <BadgePill
                label={batch.status === "COMPLETED" ? "Evaluation Completed" : batch.status}
                color={batch.status === "COMPLETED" ? "green" : "orange"}
              />
              <BadgePill label={`AY ${batch.academic_year || "2026"}`} color="gray" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              {batch.name}
            </h1>
            <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
              Enrolled evaluation batch for <span className="font-semibold text-ink">Apex Engineering Institute</span> (Main Campus). Total registered scripts: <span className="font-mono font-bold text-ink">{batch.total_submissions} submissions</span>.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 sm:self-start lg:self-center">
            {batch.exam_id && (
              <ButtonUtility href={`/exams/${batch.exam_id}`}>
                <GraduationCap className="h-3.5 w-3.5 mr-1.5 text-primary" />
                Exam Details
              </ButtonUtility>
            )}

            {batch.exam_id && (
              <ButtonUtility href={`/marks?exam_id=${batch.exam_id}`}>
                <FileCheck2 className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
                Marks Ledger
              </ButtonUtility>
            )}

            {stats.completed > 0 && (
              <a
                href={api.getBatchZipUrl(batch.id, `${(batch.name || "Batch").replace(/\s+/g, "_")}_Graded_PDFs.zip`)}
                download={`${(batch.name || "Batch").replace(/\s+/g, "_")}_Graded_PDFs.zip`}
                onClick={() => toast.info("Preparing and downloading batch graded PDFs archive...", { title: "ZIP Archive Export" })}
                className="inline-flex items-center justify-center font-medium rounded-full bg-primary hover:bg-primary-active text-white text-xs px-4 py-2 transition-all shadow-sm"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download Graded PDFs (ZIP)
              </a>
            )}
          </div>
        </div>

        {/* Academic Context Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs bg-canvas-soft rounded-lg p-4 border border-hairline">
          <div className="flex items-start gap-2.5">
            <Building2 className="h-4 w-4 text-ink-muted mt-0.5 shrink-0" />
            <div>
              <span className="text-ink-muted block text-[11px]">Academic Institution</span>
              <span className="font-semibold text-ink">Apex Engineering Institute</span>
              <span className="text-ink-secondary block text-[11px]">Main Campus (Mumbai)</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <GraduationCap className="h-4 w-4 text-ink-muted mt-0.5 shrink-0" />
            <div>
              <span className="text-ink-muted block text-[11px]">Linked Examination</span>
              {exam ? (
                <Link
                  href={`/exams/${exam.id}`}
                  className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
                >
                  {exam.title} ({exam.subject})
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : (
                <span className="text-ink-secondary font-medium">Official Curriculum Exam</span>
              )}
              <span className="text-ink-muted block text-[11px]">Max Marks: {exam?.total_marks || 25}</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <FileText className="h-4 w-4 text-ink-muted mt-0.5 shrink-0" />
            <div>
              <span className="text-ink-muted block text-[11px]">Evaluated Papers Storage</span>
              <span className="font-semibold text-emerald-600 block">Cloudinary & Supabase Verified</span>
              <span className="text-ink-muted text-[11px]">Zero-Egress Academic Vault</span>
            </div>
          </div>
        </div>

        {/* Performance Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-hairline bg-surface p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
              <span>Evaluated Papers</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-ink">{stats.completed}</span>
              <span className="text-xs text-ink-muted">/ {stats.total} total</span>
            </div>
            <div className="w-full bg-[#f1f1ef] h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="rounded-lg border border-hairline bg-surface p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
              <span>Batch Mean Score</span>
              <Award className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-ink">{stats.avgMarks.toFixed(1)}</span>
              <span className="text-xs text-ink-muted">/ {exam?.total_marks || 25}</span>
            </div>
            <div className="text-[11px] text-ink-secondary font-medium mt-1">
              Batch Average: <span className="font-semibold text-primary">{stats.avgPct.toFixed(1)}%</span>
            </div>
          </div>

          <div className="rounded-lg border border-hairline bg-surface p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
              <span>Top Score</span>
              <Sparkles className="h-4 w-4 text-amber-500" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-emerald-600">{stats.maxScore.toFixed(1)}</span>
              <span className="text-xs text-ink-muted">/ {exam?.total_marks || 25}</span>
            </div>
            <div className="text-[11px] text-ink-muted mt-1">
              Lowest Score: <span className="font-mono font-medium text-ink">{stats.minScore.toFixed(1)}</span>
            </div>
          </div>

          <div className="rounded-lg border border-hairline bg-surface p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
              <span>Pass Rate (≥40%)</span>
              <GraduationCap className="h-4 w-4 text-purple-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-ink">{stats.passRate.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-[#f1f1ef] h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-purple-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${stats.passRate}%` }}
              />
            </div>
          </div>
        </div>
      </FeatureCard>

      {/* Student Answer Sheets Table */}
      <FeatureCard className="p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
          <div>
            <h2 className="text-base font-bold text-ink">
              Student Answer Sheets in this Batch
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Showing {filteredSubmissions.length} of {submissions.length} total student submissions.
            </p>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student or roll #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-hairline bg-surface focus:outline-none focus:border-primary text-ink placeholder:text-ink-faint w-48 transition-all"
              />
            </div>

            <select
              value={scoreFilter}
              onChange={(e: any) => setScoreFilter(e.target.value)}
              className="text-xs rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-ink focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Scores</option>
              <option value="TOP">Distinction (≥75%)</option>
              <option value="MID">Passing (40% - 74%)</option>
              <option value="LOW">Needs Attention (&lt;40%)</option>
            </select>
          </div>
        </div>

        {/* Table View */}
        {filteredSubmissions.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <p className="text-xs font-semibold text-ink">No student submissions found matching current criteria.</p>
            <p className="text-[11px] text-ink-muted">Try clearing the search query or adjusting filters.</p>
            <ButtonUtility onClick={() => { setSearchTerm(""); setScoreFilter("ALL"); }}>
              Reset Search
            </ButtonUtility>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-hairline">
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
                {filteredSubmissions.map((sub) => {
                  const pct = sub.percentage || 0;
                  const scoreBadgeColor =
                    pct >= 75 ? "green" : pct >= 60 ? "teal" : pct >= 40 ? "sky" : "orange";

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
                      <td className="py-3 px-4 text-center font-mono text-ink-secondary">
                        {sub.page_count || 1}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono font-bold text-ink">
                          {sub.total_awarded_marks != null ? sub.total_awarded_marks.toFixed(1) : "—"}
                        </span>
                        <span className="text-ink-muted font-mono text-[11px]"> / {sub.max_marks || exam?.total_marks || 25}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <BadgePill
                          label={`${pct.toFixed(1)}%`}
                          color={scoreBadgeColor}
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        {(() => {
                          const s = (sub.status || "UPLOADED").toUpperCase();
                          if (s === "COMPLETED" || s === "GRADED") {
                            return (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                COMPLETED
                              </span>
                            );
                          }
                          if (s === "PROCESSING") {
                            return (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                                <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
                                PROCESSING
                              </span>
                            );
                          }
                          if (s === "QUEUED") {
                            return (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                <Clock className="h-3 w-3 text-amber-600" />
                                QUEUED
                              </span>
                            );
                          }
                          if (s === "FAILED") {
                            return (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200"
                                title={(sub as any).error_message || "Evaluation failed."}
                              >
                                <AlertCircle className="h-3 w-3 text-red-600" />
                                FAILED
                              </span>
                            );
                          }
                          if (s === "NEEDS_REVIEW") {
                            return (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                                <Eye className="h-3 w-3 text-purple-600" />
                                NEEDS REVIEW
                              </span>
                            );
                          }
                          return (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                              <FileText className="h-3 w-3 text-slate-500" />
                              {s}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {Boolean(
                          sub.status &&
                            ["COMPLETED", "GRADED", "NEEDS_REVIEW", "FAILED"].includes(
                              sub.status.toUpperCase()
                            )
                        ) ? (
                          <Link
                            href={`/grading/${sub.id}`}
                            className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-active transition-colors text-xs px-2.5 py-1 rounded-md hover:bg-canvas-soft"
                          >
                            <span>Inspect Sheet</span>
                            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </Link>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 font-medium text-ink-muted text-xs px-2.5 py-1 rounded-md opacity-45 bg-canvas-soft/40 border border-hairline/60 cursor-not-allowed select-none"
                            title={
                              sub.status === "PROCESSING"
                                ? "AI evaluation is currently processing this paper. Inspect Sheet is disabled until status changes to completed or failed."
                                : sub.status === "QUEUED"
                                ? "Paper is queued for evaluation. Inspect Sheet is disabled until status changes to completed or failed."
                                : "Evaluation in progress. Inspect Sheet is disabled in all runtime statuses until status changes to completed or failed."
                            }
                          >
                            <Lock className="h-3 w-3 text-ink-muted/70" />
                            <span>Inspect Sheet</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </FeatureCard>
    </div>
  );
}
