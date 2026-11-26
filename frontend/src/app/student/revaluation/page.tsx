"use client";

import React, { useEffect, useState, useMemo } from "react";
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
  BookOpen,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useMyAppeals } from "@/lib/queries";
import { useToast } from "@/lib/ToastContext";
import {
  FeatureCard,
  ButtonPrimary,
  ButtonUtility,
  BadgePill,
  StatusWell,
  MetricValue,
  RefetchProgressLine,
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      window.location.replace("/auth/login?role=student&redirect=/student/revaluation");
    }
  }, []);

  // TanStack Query: SWR cached my appeals
  const {
    data: appealsData,
    isLoading,
    isFetching,
    error: queryError,
    refetch: refetchAppeals,
  } = useMyAppeals();

  const requests: StudentRevaluationItem[] = useMemo(() => {
    return Array.isArray(appealsData) ? appealsData : [];
  }, [appealsData]);

  const [activeFilter, setActiveFilter] = useState<"ALL" | "PENDING" | "REVISED" | "UPHELD">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const isColdLoading = isLoading && requests.length === 0;
  const error = queryError ? (queryError as any).message || "Failed to load revaluation requests." : null;

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
    <div className="min-h-screen bg-canvas-soft text-ink pb-20 relative">
      {/* Background Refetch Line */}
      <RefetchProgressLine isFetching={isFetching} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-5 sm:pt-8 space-y-6">
        {/* Navigation Breadcrumb Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-hairline">
          <Link
            href="/student/portal"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline transition-colors py-1 px-1.5 -ml-1.5 rounded-md hover:bg-surface w-fit"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Overview</span>
          </Link>
        </div>

        {/* Header Title Section */}
        <header className="space-y-1.5">
          <p className="notion-eyebrow">Academic Review</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="notion-heading-2 text-ink">
              My Revaluation Appeals
            </h1>
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-surface border border-hairline text-ink-secondary inline-flex items-center gap-1 tabular-nums">
              <MetricValue
                value={totalCount}
                isLoading={isColdLoading}
                width="w-4"
                className="text-xs font-medium"
              />
              <span>Total</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-ink-muted max-w-2xl leading-relaxed">
            Track real-time status, faculty step-marking reviews, and revised marks across your examination appeals.
          </p>
        </header>

        {/* Filter Pills & Search Bar Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          {/* Segmented Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveFilter("ALL")}
              className={`h-8 px-3 rounded-md font-medium border transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                activeFilter === "ALL"
                  ? "bg-primary text-white border-primary"
                  : "bg-surface border-hairline text-ink-secondary hover:text-ink hover:bg-canvas-soft"
              }`}
            >
              <span>All Appeals</span>
              <span className="opacity-80 font-mono tabular-nums">
                (
                <MetricValue
                  value={totalCount}
                  isLoading={isColdLoading}
                  width="w-3"
                  className="font-medium"
                />
                )
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("PENDING")}
              className={`h-8 px-3 rounded-md font-medium border transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                activeFilter === "PENDING"
                  ? "bg-primary text-white border-primary"
                  : "bg-surface border-hairline text-ink-secondary hover:text-ink hover:bg-canvas-soft"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeFilter === "PENDING" ? "bg-white" : "bg-amber-500"}`} />
              <span>Under Review</span>
              <span className="opacity-80 font-mono tabular-nums">
                (
                <MetricValue
                  value={pendingCount}
                  isLoading={isColdLoading}
                  width="w-3"
                  className="font-medium"
                />
                )
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("REVISED")}
              className={`h-8 px-3 rounded-md font-medium border transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                activeFilter === "REVISED"
                  ? "bg-primary text-white border-primary"
                  : "bg-surface border-hairline text-ink-secondary hover:text-ink hover:bg-canvas-soft"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeFilter === "REVISED" ? "bg-white" : "bg-emerald-500"}`} />
              <span>Marks Revised</span>
              <span className="opacity-80 font-mono tabular-nums">
                (
                <MetricValue
                  value={revisedCount}
                  isLoading={isColdLoading}
                  width="w-3"
                  className="font-medium"
                />
                )
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("UPHELD")}
              className={`h-8 px-3 rounded-md font-medium border transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                activeFilter === "UPHELD"
                  ? "bg-primary text-white border-primary"
                  : "bg-surface border-hairline text-ink-secondary hover:text-ink hover:bg-canvas-soft"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeFilter === "UPHELD" ? "bg-white" : "bg-ink-faint"}`} />
              <span>Marks Upheld</span>
              <span className="opacity-80 font-mono tabular-nums">
                (
                <MetricValue
                  value={upheldCount}
                  isLoading={isColdLoading}
                  width="w-3"
                  className="font-medium"
                />
                )
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
            <input
              type="text"
              aria-label="Search revaluation appeals"
              placeholder="Search by exam or subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-12 text-xs bg-surface border border-hairline rounded-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-muted hover:text-ink font-medium cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        {isColdLoading ? (
          <RevaluationListSkeleton />
        ) : error ? (
          <FeatureCard className="p-8 rounded-lg text-center space-y-4 max-w-xl mx-auto">
            <div className="mx-auto h-11 w-11 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-rose-600">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-ink">Failed to Load Appeals</h3>
              <p className="text-xs text-ink-muted">{error}</p>
            </div>
            <ButtonPrimary onClick={() => refetchAppeals()} className="mx-auto">
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Try Again
            </ButtonPrimary>
          </FeatureCard>
        ) : filteredRequests.length === 0 ? (
          <FeatureCard className="p-10 rounded-lg text-center space-y-4 max-w-lg mx-auto">
            <div className="mx-auto h-11 w-11 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-muted">
              {requests.length === 0 ? (
                <RotateCcw className="h-5 w-5 text-primary" />
              ) : (
                <Filter className="h-5 w-5" />
              )}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-ink">
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
                <ButtonUtility onClick={() => { setSearchQuery(""); setActiveFilter("ALL"); }}>
                  Clear Filters
                </ButtonUtility>
              )}
            </div>
          </FeatureCard>
        ) : (
          <div className="space-y-3.5">
            {filteredRequests.map((req) => {
              const qids = parseQuestionIds(req.question_ids_json);
              const isResolved = req.status === "RESOLVED";
              const isRevised = isResolved && req.decision === "MARKS_REVISED";
              const isUpheld = isResolved && req.decision === "MARKS_UPHELD";
              const isPending = req.status === "SUBMITTED" || req.status === "UNDER_REVIEW";

              return (
                <FeatureCard
                  key={req.id}
                  className="p-4 sm:p-5 rounded-lg border-hairline bg-surface space-y-3.5 transition-colors hover:border-hairline-strong"
                >
                  {/* Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <h2 className="notion-heading-3 text-ink truncate">
                        {req.exam_title || "Examination Paper"}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                        <span className="font-medium text-ink-secondary">
                          {req.exam_subject || "General"}
                        </span>
                        <span className="text-ink-faint">•</span>
                        <span>Submitted {formatDate(req.requested_at)}</span>
                        <span className="text-ink-faint">•</span>
                        <span>
                          {qids.length === 0 ? "Entire Paper" : `Question ${qids.join(", ")}`}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-canvas-soft text-ink-secondary border border-hairline">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          <span>Under Faculty Review</span>
                        </span>
                      )}
                      {isRevised && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-canvas-soft text-ink-secondary border border-hairline">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span>
                            Marks Revised ({req.delta_marks && req.delta_marks > 0 ? `+${req.delta_marks}` : req.delta_marks}m)
                          </span>
                        </span>
                      )}
                      {isUpheld && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-canvas-soft text-ink-secondary border border-hairline">
                          <span className="w-1.5 h-1.5 rounded-full bg-ink-faint shrink-0" />
                          <span>Evaluation Upheld</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Student Justification */}
                  {req.student_reason && (
                    <div className="p-3 rounded-md bg-canvas-soft border border-hairline text-xs space-y-1">
                      <div className="font-medium text-ink-secondary">Your Appeal Reason</div>
                      <p className="text-ink-muted leading-relaxed">&ldquo;{req.student_reason}&rdquo;</p>
                    </div>
                  )}

                  {/* Evaluator Notes / Decision Banner */}
                  {isResolved && (req.reviewer_notes || req.resolution_notes) && (
                    <div className="p-3.5 rounded-md border border-hairline bg-canvas-soft text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-semibold text-ink">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span>Faculty Review Decision</span>
                        </span>
                        {req.resolved_at && (
                          <span className="text-[11px] font-normal text-ink-muted">
                            {formatDate(req.resolved_at)}
                          </span>
                        )}
                      </div>
                      <p className="text-ink-secondary leading-relaxed">
                        {req.reviewer_notes || req.resolution_notes}
                      </p>
                    </div>
                  )}

                  {/* Footer: Link to Paper View */}
                  <div className="flex items-center justify-between pt-3 border-t border-hairline text-xs">
                    <span className="text-ink-muted">
                      Paper ID <code className="font-mono text-ink-secondary">{req.submission_id.slice(0, 8)}</code>
                    </span>
                    <Link
                      href={`/student/submissions/${req.submission_id}`}
                      className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline transition-colors"
                    >
                      <span>View Evaluated Script</span>
                      <ExternalLink className="h-3.5 w-3.5" />
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
