"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  BarChart3,
  Layers,
  GraduationCap,
  ArrowRight,
  Cpu,
  Clock,
  ShieldCheck,
  RotateCcw,
  Users,
  Building2,
  Lock,
  LogIn,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { getAuthToken } from "@/lib/api";
import { formatExamDate, resolveExamDate } from "@/lib/dateFormat";
import { Exam } from "@/lib/types";
import { useToast } from "@/lib/ToastContext";
import { useTenant } from "@/lib/TenantContext";
import {
  useSystemStatus,
  useExamsList,
} from "@/lib/queries";
import {
  MetricValue,
  Skeleton,
} from "@/components/ui";

export default function RootAdminOverviewPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { switchTenancy, currentUser, isMounted, loading: tenantLoading, isLoggingOut } = useTenant();

  // TanStack Queries (Cached in-memory, instant back-nav, CLS = 0.00)
  const { data: status, isLoading: isStatusLoading } = useSystemStatus();
  const { data: exams = [], isLoading: isExamsLoading } = useExamsList();

  const publishedCount = useMemo(
    () => exams.filter((exam) => Boolean(exam.is_published)).length,
    [exams]
  );

  const handleInspectExam = (e: React.MouseEvent, exam: Exam) => {
    e.preventDefault();
    const targetInstId = exam.institute_id;
    const targetBranchId = exam.branch_id;
    const targetInstName = exam.institute_name || "Coaching Institute";
    const targetBranchName = exam.branch_name || "Branch";

    const res = switchTenancy(
      targetInstId,
      targetBranchId,
      targetInstName,
      targetBranchName
    );

    if (res.switched) {
      toast.info(`Switching to ${res.instituteName || targetInstName} and ${res.branchName || targetBranchName}`, {
        title: "Tenancy Switched",
        duration: 4000,
      });
    }

    router.push(`/exams/${exam.id}`);
  };

  // 1. Protective Auth Gates (Only for auth state, never for data loading)
  const hasToken = isMounted && Boolean(getAuthToken());
  if (!isMounted || tenantLoading || isLoggingOut || !hasToken) {
    return (
      <div className="max-w-6xl mx-auto py-8 space-y-6">
        <div className="notion-card p-6 space-y-3">
          <Skeleton className="h-3.5 w-36 rounded-xs" />
          <Skeleton className="h-7 w-64 rounded-md" />
          <Skeleton className="h-4 w-full max-w-lg rounded-xs" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="notion-card p-4 space-y-3 min-h-[104px]">
              <Skeleton className="h-3.5 w-20 rounded-xs" />
              <Skeleton className="h-6 w-14 rounded-md" />
              <Skeleton className="h-3 w-28 rounded-xs" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 2. Unauthenticated Barrier
  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <div className="notion-card p-6 sm:p-8 text-center space-y-5">
          <div className="mx-auto h-11 w-11 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-center text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <p className="notion-eyebrow text-ink-muted">Authentication Required</p>
            <h1 className="notion-heading-3 text-xl text-ink">Root Admin Console Restricted</h1>
            <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
              This overview dashboard contains sensitive multi-tenant system controls, API quota analytics, and exam publication tools reserved exclusively for Root Administrators.
            </p>
          </div>

          <div className="pt-2 grid grid-cols-2 sm:flex sm:items-center sm:justify-center gap-2.5">
            <Link
              href="/auth/login?role=staff&redirect=/overview"
              className="notion-btn-primary justify-center"
            >
              <LogIn className="h-3.5 w-3.5 shrink-0" />
              <span>Sign In as Admin</span>
            </Link>
            <Link href="/" className="notion-btn-utility justify-center">
              <span>Public Home</span>
            </Link>
          </div>

          <div className="pt-3 border-t border-hairline text-xs text-ink-muted">
            Seeded Admin: <span className="font-mono font-medium text-ink">admin@papergrade.ai</span>
          </div>
        </div>
      </div>
    );
  }

  // 3. Unauthorized Role Barrier (Branch Manager or Student)
  if (currentUser.role !== "ROOT_ADMIN") {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <div className="notion-card p-6 sm:p-8 text-center space-y-5">
          <div className="mx-auto h-11 w-11 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <p className="notion-eyebrow text-ink-muted">Role: {currentUser.role}</p>
            <h1 className="notion-heading-3 text-xl text-ink">Elevated Access Required</h1>
            <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
              You are signed in as <span className="font-medium text-ink">{currentUser.full_name}</span> with role{" "}
              <span className="font-mono font-medium text-primary">{currentUser.role}</span>. The overview desk is restricted to Root Administrators.
            </p>
          </div>

          <div className="pt-2 grid grid-cols-2 sm:flex sm:items-center sm:justify-center gap-2.5">
            {currentUser.role === "BRANCH_MANAGER" || currentUser.role === "INSTITUTE_DIRECTOR" ? (
              <Link href="/branch/batches" className="notion-btn-primary justify-center">
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span>Academic Batches</span>
              </Link>
            ) : (
              <Link href="/student/portal" className="notion-btn-primary justify-center">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>Student Portal</span>
              </Link>
            )}
            <Link href="/" className="notion-btn-utility justify-center">
              <span>Public Home</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 4. Authorized Root Admin Operations Console
  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12 cascade-group">
      {/* Page Header */}
      <header className="pb-4 border-b border-hairline flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p className="notion-eyebrow text-ink-muted">Root Admin Operations</p>
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Supabase PostgreSQL &amp; Cloudflare R2</span>
            </span>
          </div>

          <h1 className="notion-heading-2 text-2xl sm:text-[26px] text-ink">
            PaperGrade AI Mission Control
          </h1>

          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed max-w-2xl">
            Configure multi-tenant coaching chains, review AI rubric generation, manage 30-minute exam windows, monitor Gemini quotas, and resolve student appeals.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0 w-full lg:w-auto">
          <Link href="/exams/new" className="notion-btn-primary justify-center w-full sm:w-auto">
            <GraduationCap className="h-3.5 w-3.5 shrink-0" />
            <span>Create Exam &amp; Rubric</span>
          </Link>
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <Link href="/admin/tenancy" className="notion-btn-utility justify-center">
              <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">Institutes</span>
            </Link>
            <Link href="/analytics" className="notion-btn-utility justify-center">
              <BarChart3 className="h-3.5 w-3.5 text-ink-secondary shrink-0" />
              <span className="truncate">Telemetry</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Section 1: System Snapshot */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-1">
          <div className="min-w-0 space-y-0.5">
            <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
              System Snapshot
            </h2>
            <p className="text-xs sm:text-[13px] text-ink-muted leading-relaxed">
              Live examination inventory, Cloudflare R2 document flow, and active evaluation engine.
            </p>
          </div>
          <Link
            href="/analytics"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-active transition-colors shrink-0 self-start sm:self-end"
          >
            <span>Open Telemetry</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 cascade-fast">
          <div className="notion-card p-3.5 sm:p-4 flex flex-col justify-between min-h-[108px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">Examinations</span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <Layers className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2">
              <MetricValue
                isLoading={isStatusLoading && isExamsLoading}
                value={status?.total_exams || exams.length || 0}
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
                width="w-12"
              />
            </div>
            <div className="text-xs text-ink-muted mt-1 truncate">
              Registered across branches
            </div>
          </div>

          <div className="notion-card p-3.5 sm:p-4 flex flex-col justify-between min-h-[108px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">Published</span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2">
              <MetricValue
                isLoading={isExamsLoading}
                value={publishedCount}
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
                width="w-10"
              />
            </div>
            <div className="text-xs text-ink-muted mt-1 truncate">
              Released to student portals
            </div>
          </div>

          <div className="notion-card p-3.5 sm:p-4 flex flex-col justify-between min-h-[108px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">Submissions</span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <FileText className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2">
              <MetricValue
                isLoading={isStatusLoading}
                value={status?.total_submissions || 0}
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
                width="w-14"
              />
            </div>
            <div className="text-xs text-ink-muted mt-1 truncate">
              Cloudflare R2 canonical PDFs
            </div>
          </div>

          <div className="notion-card p-3.5 sm:p-4 flex flex-col justify-between min-h-[108px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">Grading Engine</span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <Cpu className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2 min-w-0">
              {isStatusLoading ? (
                <Skeleton className="h-6 w-28 rounded-md" />
              ) : (
                <div className="text-sm sm:text-base font-mono font-semibold text-ink truncate" title={status?.model || "gemini-3.8-flash"}>
                  {status?.model || "gemini-3.8-flash"}
                </div>
              )}
            </div>
            <div className="text-xs text-ink-muted mt-1 flex items-center gap-1.5 truncate">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  status?.gemini_configured ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span className="truncate">
                {status?.gemini_configured ? "Multi-Key Rotation" : "Local Mode"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Quick Navigation */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-1">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
                Operations Workspace
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface border border-hairline text-ink-muted tabular-nums">
                4 modules
              </span>
            </div>
            <p className="text-xs sm:text-[13px] text-ink-muted leading-relaxed">
              Jump directly to tenancy setup, branch rosters, exam rubrics, or revaluation adjudication.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 cascade-fast">
          <Link href="/admin/tenancy" className="group">
            <div className="notion-card p-4 sm:p-5 h-full flex flex-col justify-between hover:border-[#d0d0d0] dark:hover:border-[#444444] transition-colors">
              <div className="space-y-2.5">
                <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline text-ink-secondary group-hover:text-primary flex items-center justify-center transition-colors">
                  <Building2 className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-ink group-hover:text-primary transition-colors">
                  Tenancy Desk
                </h3>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Create coaching institutes, physical branches, and provision manager credentials.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between text-xs text-primary font-medium">
                <span>Manage Tenancy</span>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </Link>

          <Link href="/branch/batches" className="group">
            <div className="notion-card p-4 sm:p-5 h-full flex flex-col justify-between hover:border-[#d0d0d0] dark:hover:border-[#444444] transition-colors">
              <div className="space-y-2.5">
                <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline text-ink-secondary group-hover:text-primary flex items-center justify-center transition-colors">
                  <Users className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-ink group-hover:text-primary transition-colors">
                  Branch Batches
                </h3>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Review batch rosters, CSV student registrations, and 30-minute submission windows.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between text-xs text-primary font-medium">
                <span>View Batches</span>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </Link>

          <Link href="/exams" className="group">
            <div className="notion-card p-4 sm:p-5 h-full flex flex-col justify-between hover:border-[#d0d0d0] dark:hover:border-[#444444] transition-colors">
              <div className="space-y-2.5">
                <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline text-ink-secondary group-hover:text-primary flex items-center justify-center transition-colors">
                  <GraduationCap className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-ink group-hover:text-primary transition-colors">
                  Exams &amp; Rubrics
                </h3>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Inspect question papers, AI draft rubrics, criteria scores, and publication state.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between text-xs text-primary font-medium">
                <span>Exams Console</span>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </Link>

          <Link href="/revaluation" className="group">
            <div className="notion-card p-4 sm:p-5 h-full flex flex-col justify-between hover:border-[#d0d0d0] dark:hover:border-[#444444] transition-colors">
              <div className="space-y-2.5">
                <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline text-ink-secondary group-hover:text-primary flex items-center justify-center transition-colors">
                  <RotateCcw className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-ink group-hover:text-primary transition-colors">
                  Revaluation Desk
                </h3>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Human-verified grievance adjudication within the 7-calendar-day appeal window.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between text-xs text-primary font-medium">
                <span>Resolve Appeals</span>
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* Section 3: Registered Examinations List */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-1">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
                Registered Examinations
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface border border-hairline text-ink-muted tabular-nums">
                {exams.length}
              </span>
            </div>
            <p className="text-xs sm:text-[13px] text-ink-muted leading-relaxed">
              Official lifecycle, tenant branch scope, and publication control across recent exams.
            </p>
          </div>
          <Link
            href="/exams"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-active transition-colors shrink-0 self-start sm:self-end"
          >
            <span>View All Examinations</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="notion-card px-4 sm:px-5 divide-y divide-hairline">
          {isExamsLoading && exams.length === 0 ? (
            [1, 2, 3, 4].map((i) => (
              <div key={i} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-48 rounded-xs" />
                  <Skeleton className="h-3 w-32 rounded-xs" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-20 rounded-xs" />
                  <Skeleton className="h-8 w-36 rounded-md" />
                </div>
              </div>
            ))
          ) : (
            exams.slice(0, 10).map((exam) => (
              <div
                key={exam.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink truncate max-w-full">
                      {exam.title}
                    </span>
                    {(exam.institute_name || exam.branch_name) && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-secondary bg-canvas-soft border border-hairline px-2 py-0.5 rounded-xs max-w-full">
                        <Building2 className="h-3 w-3 text-ink-muted shrink-0" />
                        <span className="truncate">{exam.institute_name || "Institution"}</span>
                        <span className="text-ink-faint">/</span>
                        <span className="truncate">{exam.branch_name || "Branch"}</span>
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>Subject: {exam.subject}</span>
                    <span className="text-ink-faint">•</span>
                    <span className="tabular-nums">
                      Total: {exam.total_marks && exam.total_marks > 0 ? `${exam.total_marks} marks` : "N/A"}
                    </span>
                    {formatExamDate(resolveExamDate(exam)) && (
                      <>
                        <span className="text-ink-faint">•</span>
                        <span className="inline-flex items-center gap-1 tabular-nums whitespace-nowrap" title="Exam Date">
                          <Calendar className="h-3 w-3 text-ink-faint shrink-0" />
                          <span>{formatExamDate(resolveExamDate(exam))}</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 w-full sm:w-auto">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xs bg-canvas-soft border border-hairline text-xs font-medium text-ink-secondary">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        exam.is_published ? "bg-emerald-500" : "bg-ink-faint"
                      }`}
                    />
                    <span>{exam.is_published ? "Published" : exam.lifecycle_status || "Draft"}</span>
                  </span>

                  <button
                    type="button"
                    onClick={(e) => handleInspectExam(e, exam)}
                    className="notion-btn-utility"
                  >
                    Inspect Exam
                  </button>
                </div>
              </div>
            ))
          )}

          {!isExamsLoading && exams.length === 0 && (
            <div className="py-10 text-center text-xs text-ink-muted">
              No examinations configured yet. Click &quot;Create Exam &amp; Rubric&quot; above to start.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
