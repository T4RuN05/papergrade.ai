"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  RotateCcw,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  FileText,
  Search,
  Filter,
  Award,
  ChevronRight,
  TrendingUp,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { api, getAuthToken, getStoredUser } from "@/lib/api";
import { useToast } from "@/lib/ToastContext";
import {
  FeatureCard,
  ButtonPrimary,
  ButtonUtility,
  BadgePill,
  StatusWell,
} from "@/components/ui";

interface StudentRevaluationItem {
  id: string;
  submission_id: string;
  student_id?: string;
  question_ids_json: string | string[];
  student_reason?: string;
  status: "SUBMITTED" | "UNDER_REVIEW" | "RESOLVED";
  decision?: "MARKS_REVISED" | "MARKS_UPHELD" | null;
  reviewer_notes?: string;
  resolution_notes?: string;
  delta_marks?: number | null;
  resolved_by?: string;
  requested_at: string;
  resolved_at?: string | null;
  student_name?: string;
  roll_number?: string;
  total_awarded_marks?: number;
  max_marks?: number;
  exam_title?: string;
  exam_subject?: string;
}

function parseQuestionIds(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
      return [String(parsed)];
    } catch {
      return raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

function formatDate(isoString?: string | null): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    return DATE_FORMATTER.format(d);
  } catch {
    return isoString;
  }
}

function getSubjectBadgeColor(subject?: string): "sky" | "orange" | "purple" | "teal" | "indigo" {
  if (!subject) return "indigo";
  const s = subject.toLowerCase();
  if (s.includes("phys")) return "sky";
  if (s.includes("chem")) return "orange";
  if (s.includes("math")) return "purple";
  if (s.includes("bio")) return "teal";
  return "indigo";
}

function RevaluationListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-hairline bg-surface p-5 sm:p-6 shadow-xs animate-pulse space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-2">
              <div className="h-4 w-24 bg-canvas-soft rounded" />
              <div className="h-5 w-64 bg-canvas-soft rounded" />
            </div>
            <div className="h-6 w-32 bg-canvas-soft rounded-full" />
          </div>
          <div className="h-16 w-full bg-canvas-soft rounded-lg" />
          <div className="flex items-center justify-between pt-2 border-t border-hairline/60">
            <div className="h-4 w-36 bg-canvas-soft rounded" />
            <div className="h-8 w-28 bg-canvas-soft rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StudentRevaluationPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [requests, setRequests] = useState<StudentRevaluationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"ALL" | "PENDING" | "REVISED" | "UPHELD">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const loadRevaluations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getMyRevaluations();
      setRequests(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Failed to load student revaluations:", err);
      setError(err.message || "Failed to load revaluation requests.");
      toast.error(err.message || "Could not retrieve revaluations.", {
        title: "Load Error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.push("/auth/login?role=student&redirect=/student/revaluation");
      return;
    }
    loadRevaluations();
  }, [router, loadRevaluations]);

  // Derived KPI metrics
  const totalCount = requests.length;
  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "SUBMITTED" || r.status === "UNDER_REVIEW").length,
    [requests]
  );
  const revisedCount = useMemo(
    () => requests.filter((r) => r.status === "RESOLVED" && r.decision === "MARKS_REVISED").length,
    [requests]
  );
  const upheldCount = useMemo(
    () => requests.filter((r) => r.status === "RESOLVED" && r.decision === "MARKS_UPHELD").length,
    [requests]
  );
  const totalMarksGained = useMemo(() => {
    return requests.reduce((acc, r) => {
      if (r.status === "RESOLVED" && r.decision === "MARKS_REVISED" && typeof r.delta_marks === "number") {
        return acc + Math.max(0, r.delta_marks);
      }
      return acc;
    }, 0);
  }, [requests]);

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // 1. Status Filter
      if (activeFilter === "PENDING") {
        if (r.status !== "SUBMITTED" && r.status !== "UNDER_REVIEW") return false;
      } else if (activeFilter === "REVISED") {
        if (r.status !== "RESOLVED" || r.decision !== "MARKS_REVISED") return false;
      } else if (activeFilter === "UPHELD") {
        if (r.status !== "RESOLVED" || r.decision !== "MARKS_UPHELD") return false;
      }

      // 2. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (r.exam_title || "").toLowerCase().includes(q);
        const subjectMatch = (r.exam_subject || "").toLowerCase().includes(q);
        const reasonMatch = (r.student_reason || "").toLowerCase().includes(q);
        const qidsMatch = parseQuestionIds(r.question_ids_json).some((qid) =>
          qid.toLowerCase().includes(q)
        );
        if (!titleMatch && !subjectMatch && !reasonMatch && !qidsMatch) {
          return false;
        }
      }

      return true;
    });
  }, [requests, activeFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-canvas text-ink pb-20">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 space-y-6">
        {/* Navigation Breadcrumb Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
          <Link
            href="/student/portal"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover transition-colors py-1.5 px-2 -ml-2 rounded-lg hover:bg-canvas-soft w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/student/portal?tab=exams"
              className="h-8 px-3 rounded-md btn-glass-utility text-ink text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs hover:bg-canvas-soft transition-colors"
            >
              <BookOpen className="h-3.5 w-3.5 text-ink-muted" />
              <span>Past Exams</span>
            </Link>
          </div>
        </div>

        {/* Header Title Section */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              My Revaluation Appeals
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-surface border border-hairline text-ink-secondary">
              {totalCount} Total
            </span>
          </div>
          <p className="text-xs sm:text-sm text-ink-secondary max-w-2xl leading-relaxed">
            Track real-time status, faculty step-marking reviews, and revised marks across your examination appeals.
          </p>
        </div>

        {/* 4-Column KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Total Appeals */}
          <FeatureCard className="p-4 sm:p-5 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-xs text-ink-muted font-medium">
              <span>Total Lodged</span>
              <RotateCcw className="h-4 w-4 text-ink-muted" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-ink">{totalCount}</span>
              <span className="text-[11px] text-ink-muted">requests</span>
            </div>
          </FeatureCard>

          {/* Under Review */}
          <FeatureCard className="p-4 sm:p-5 flex flex-col justify-between space-y-2 border-amber-500/20 bg-amber-500/[0.02]">
            <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400 font-medium">
              <span>Under Review</span>
              <Clock className="h-4 w-4 text-amber-600 animate-pulse" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-amber-700 dark:text-amber-300">
                {pendingCount}
              </span>
              <span className="text-[11px] text-amber-600/80">pending faculty</span>
            </div>
          </FeatureCard>

          {/* Marks Revised */}
          <FeatureCard className="p-4 sm:p-5 flex flex-col justify-between space-y-2 border-emerald-500/20 bg-emerald-500/[0.02]">
            <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              <span>Marks Revised</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-emerald-700 dark:text-emerald-300">
                {revisedCount}
              </span>
              {totalMarksGained > 0 && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  +{totalMarksGained.toFixed(1)} pts
                </span>
              )}
            </div>
          </FeatureCard>

          {/* Marks Upheld */}
          <FeatureCard className="p-4 sm:p-5 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-xs text-ink-muted font-medium">
              <span>Marks Upheld</span>
              <ShieldCheck className="h-4 w-4 text-ink-muted" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-ink">{upheldCount}</span>
              <span className="text-[11px] text-ink-muted">confirmed accurate</span>
            </div>
          </FeatureCard>
        </div>

        {/* Filter Pills & Search Bar Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {/* Segmented Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveFilter("ALL")}
              className={`h-8 px-3 rounded-lg font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeFilter === "ALL"
                  ? "bg-primary text-white shadow-xs"
                  : "bg-surface border border-hairline text-ink-secondary hover:text-ink hover:bg-canvas-soft"
              }`}
            >
              All Appeals ({totalCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("PENDING")}
              className={`h-8 px-3 rounded-lg font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                activeFilter === "PENDING"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-surface border border-hairline text-ink-secondary hover:text-amber-700 hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
              }`}
            >
              <Clock className="h-3 w-3" />
              <span>Under Review ({pendingCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("REVISED")}
              className={`h-8 px-3 rounded-lg font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                activeFilter === "REVISED"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-surface border border-hairline text-ink-secondary hover:text-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
              }`}
            >
              <CheckCircle2 className="h-3 w-3" />
              <span>Marks Revised ({revisedCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("UPHELD")}
              className={`h-8 px-3 rounded-lg font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                activeFilter === "UPHELD"
                  ? "bg-slate-700 text-white shadow-xs"
                  : "bg-surface border border-hairline text-ink-secondary hover:text-ink hover:bg-canvas-soft"
              }`}
            >
              <ShieldCheck className="h-3 w-3" />
              <span>Marks Upheld ({upheldCount})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
            <input
              type="text"
              aria-label="Search revaluation appeals"
              placeholder="Search by exam or subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs bg-surface border border-hairline rounded-lg text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2 text-[10px] text-ink-muted hover:text-ink font-semibold"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <RevaluationListSkeleton />
        ) : error ? (
          <FeatureCard className="p-8 text-center space-y-4 max-w-xl mx-auto">
            <div className="mx-auto h-12 w-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 dark:bg-rose-950/30 dark:border-rose-800">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-ink">Failed to Load Appeals</h3>
              <p className="text-xs text-ink-muted">{error}</p>
            </div>
            <ButtonPrimary onClick={loadRevaluations} className="mx-auto">
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Try Again
            </ButtonPrimary>
          </FeatureCard>
        ) : filteredRequests.length === 0 ? (
          <FeatureCard className="p-10 text-center space-y-4 max-w-lg mx-auto">
            <div className="mx-auto h-12 w-12 rounded-full bg-canvas-soft border border-hairline flex items-center justify-center text-ink-muted">
              {requests.length === 0 ? (
                <RotateCcw className="h-6 w-6 text-primary" />
              ) : (
                <Filter className="h-6 w-6" />
              )}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-ink">
                {requests.length === 0 ? "No Revaluation Appeals Found" : "No Appeals Match Filter"}
              </h3>
              <p className="text-xs text-ink-muted leading-relaxed">
                {requests.length === 0
                  ? "You have not submitted any revaluation appeals yet. If you believe a step was overlooked during grading on a published exam, you can challenge it directly from your exam paper."
                  : "Try clearing your search query or switching to 'All Appeals' to view other records."}
              </p>
            </div>
            <div className="pt-2">
              {requests.length === 0 ? (
                <ButtonPrimary href="/student/portal?tab=exams">
                  <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                  View Past Exam Papers
                </ButtonPrimary>
              ) : (
                <ButtonUtility
                  onClick={() => {
                    setActiveFilter("ALL");
                    setSearchQuery("");
                  }}
                >
                  Reset All Filters
                </ButtonUtility>
              )}
            </div>
          </FeatureCard>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((item) => {
              const qids = parseQuestionIds(item.question_ids_json);
              const isPending = item.status === "SUBMITTED" || item.status === "UNDER_REVIEW";
              const isResolved = item.status === "RESOLVED";
              const isRevised = isResolved && item.decision === "MARKS_REVISED";
              const isUpheld = isResolved && item.decision === "MARKS_UPHELD";

              return (
                <FeatureCard
                  key={item.id}
                  className="p-5 sm:p-6 space-y-4 border-hairline bg-surface hover:border-hairline-strong transition-colors"
                >
                  {/* Card Header Row */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-hairline/60">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.exam_subject && (
                          <BadgePill
                            label={item.exam_subject}
                            color={getSubjectBadgeColor(item.exam_subject)}
                          />
                        )}
                        <h2 className="text-sm sm:text-base font-bold text-ink">
                          {item.exam_title || "Examination"}
                        </h2>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                        <span>
                          Requested on <strong className="text-ink-secondary">{formatDate(item.requested_at)}</strong>
                        </span>
                        <span>•</span>
                        <span className="font-mono text-[10px]">ID: {item.id}</span>
                      </div>
                    </div>

                    {/* Status Pill Badge */}
                    <div className="shrink-0">
                      {isPending && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shadow-2xs">
                          <RotateCcw className="h-3 w-3 animate-spin text-amber-600" />
                          <span>Under Faculty Review</span>
                        </div>
                      )}
                      {isRevised && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Marks Revised {typeof item.delta_marks === "number" && item.delta_marks > 0 ? `(+${item.delta_marks})` : ""}</span>
                        </div>
                      )}
                      {isUpheld && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20 shadow-2xs">
                          <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
                          <span>Marks Upheld</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Challenged Questions Row */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                      Challenged Question{qids.length > 1 ? "s" : ""}:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {qids.length > 0 ? (
                        qids.map((qid) => (
                          <span
                            key={qid}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold font-mono bg-canvas-soft border border-hairline text-ink"
                          >
                            <FileText className="h-3 w-3 text-primary" />
                            Question {qid}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-ink-muted italic">Entire Script Review</span>
                      )}
                    </div>
                  </div>

                  {/* Student Reason Callout */}
                  {item.student_reason && (
                    <div className="p-3 rounded-lg bg-canvas-soft border border-hairline/80 space-y-1 text-xs">
                      <div className="text-[10.5px] font-semibold text-ink-secondary">
                        Your Submitted Grievance Justification:
                      </div>
                      <p className="text-ink leading-relaxed italic">
                        &ldquo;{item.student_reason}&rdquo;
                      </p>
                    </div>
                  )}

                  {/* Faculty Resolution Panel (Only if RESOLVED) */}
                  {isResolved && (
                    <div
                      className={`p-3.5 sm:p-4 rounded-xl border text-xs space-y-2.5 transition-all ${
                        isRevised
                          ? "bg-emerald-500/[0.04] border-emerald-500/20 dark:bg-emerald-950/20"
                          : "bg-surface border-hairline"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-hairline/50">
                        <div className="flex items-center gap-2">
                          {isRevised ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          ) : (
                            <ShieldCheck className="h-4 w-4 text-slate-500 shrink-0" />
                          )}
                          <span className="font-bold text-ink">
                            Senior Faculty Verdict:{" "}
                            <span className={isRevised ? "text-emerald-700 dark:text-emerald-400" : "text-ink"}>
                              {isRevised ? "Marks Adjusted & Revised" : "Marks Upheld (Original Accurate)"}
                            </span>
                          </span>
                        </div>
                        {item.resolved_at && (
                          <span className="text-[10.5px] text-ink-muted">
                            Resolved on {formatDate(item.resolved_at)}
                          </span>
                        )}
                      </div>

                      {/* Marks Scorecard Comparison */}
                      {typeof item.total_awarded_marks === "number" && (
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-ink-secondary font-medium">Final Paper Score:</span>
                          <span className="font-bold text-sm text-ink font-mono">
                            {item.total_awarded_marks.toFixed(1)} / {item.max_marks || 25}
                          </span>
                          {isRevised && typeof item.delta_marks === "number" && (
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              {item.delta_marks > 0 ? `+${item.delta_marks}` : item.delta_marks} Marks
                            </span>
                          )}
                        </div>
                      )}

                      {/* Examiner Written Remarks */}
                      {item.reviewer_notes ? (
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold text-ink-secondary">
                            Examiner Step-Marking Remarks:
                          </span>
                          <p className="text-ink-secondary leading-relaxed bg-surface/80 p-2.5 rounded-lg border border-hairline text-xs">
                            {item.reviewer_notes}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-ink-muted italic">
                          Senior faculty reviewed the step evaluations and finalized this appeal.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Card Footer Action: Deep Link to Evaluated Paper */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-hairline/60">
                    <span className="text-[11px] text-ink-muted">
                      {isPending
                        ? "Faculty is re-checking the handwritten paper against the step rubric."
                        : "Official marks and annotated answer sheet have been updated in your records."}
                    </span>

                    <Link
                      href={`/student/submissions/${item.submission_id}`}
                      className="h-8 px-3.5 rounded-md btn-glass-utility text-xs font-semibold text-primary hover:text-primary-hover inline-flex items-center justify-center gap-1.5 shadow-2xs transition-colors w-full sm:w-auto text-center"
                    >
                      <span>View Graded Paper</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </FeatureCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
