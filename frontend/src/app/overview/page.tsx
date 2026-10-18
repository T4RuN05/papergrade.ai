"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  BarChart3,
  Layers,
  CheckCircle2,
  AlertTriangle,
  GraduationCap,
  Sparkles,
  ArrowRight,
  Upload,
  Cpu,
  Clock,
  ShieldCheck,
  RotateCcw,
  Users,
  Building2,
  Lock,
  LogIn,
} from "lucide-react";
import { api, getAuthToken } from "@/lib/api";
import { Exam, UsageMetrics } from "@/lib/types";
import { useToast } from "@/lib/ToastContext";
import { useTenant } from "@/lib/TenantContext";
import {
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
  DashboardSkeleton,
} from "@/components/ui";

export default function RootAdminOverviewPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { switchTenancy, currentUser, loading: tenantLoading } = useTenant();
  const [status, setStatus] = useState<any>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

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

  useEffect(() => {
    if (tenantLoading) return;
    if (!currentUser) {
      setLoading(false);
      return;
    }

    if (currentUser.role === "BRANCH_MANAGER") {
      router.replace("/branch/batches");
      return;
    }

    if (currentUser.role === "ROOT_ADMIN") {
      loadOverviewData();
    } else {
      setLoading(false);
    }
  }, [currentUser, tenantLoading]);

  const loadOverviewData = async () => {
    setLoading(true);
    try {
      const [sysStatus, examList, usageData] = await Promise.all([
        api.getStatus().catch(() => null),
        api.listExams().catch(() => []),
        api.getUsageMetrics().catch(() => null),
      ]);
      setStatus(sysStatus);
      setExams(examList);
      setMetrics(usageData);
    } catch (e) {
      console.error("Failed to load Root Admin overview:", e);
    } finally {
      setLoading(false);
    }
  };

  // 1. Loading State
  if (loading) {
    return <DashboardSkeleton />;
  }

  // 2. Unauthenticated Barrier
  if (!currentUser) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <FeatureCard className="p-8 text-center space-y-5 border-amber-200 bg-[#fffdfa]">
          <div className="mx-auto h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
            <Lock className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <BadgePill label="Authentication Required" color="orange" />
            <h1 className="text-xl font-bold text-ink mt-2">Root Admin Console Restricted</h1>
            <p className="text-xs text-ink-secondary leading-relaxed">
              This overview dashboard contains sensitive multi-tenant system controls, API quota analytics, and exam publication tools reserved exclusively for Root Administrators.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <ButtonPrimary href="/auth/login?redirect=/overview">
              <LogIn className="h-4 w-4 mr-2" />
              Sign In as Root Admin
            </ButtonPrimary>
            <ButtonUtility href="/">Back to Public Home</ButtonUtility>
          </div>

          <div className="pt-3 border-t border-hairline text-[11px] text-ink-muted">
            Seeded Admin: <span className="font-mono font-semibold text-ink">admin@papergrade.ai</span>
          </div>
        </FeatureCard>
      </div>
    );
  }

  // 3. Unauthorized Role Barrier (Branch Manager or Student)
  if (currentUser.role !== "ROOT_ADMIN") {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <FeatureCard className="p-8 text-center space-y-5 border-red-200 bg-[#fffafa]">
          <div className="mx-auto h-12 w-12 rounded-full bg-red-50 flex items-center justify-center text-red-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <BadgePill label={`Role: ${currentUser.role}`} color="purple" />
            <h1 className="text-xl font-bold text-ink mt-2">Elevated Access Required</h1>
            <p className="text-xs text-ink-secondary leading-relaxed">
              You are signed in as <span className="font-semibold text-ink">{currentUser.full_name}</span> with role{" "}
              <span className="font-mono font-semibold text-primary">{currentUser.role}</span>. The /overview desk is restricted to Root Administrators.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            {currentUser.role === "BRANCH_MANAGER" ? (
              <ButtonPrimary href="/branch/batches">
                <Users className="h-4 w-4 mr-2" />
                Go to Branch Manager Batches →
              </ButtonPrimary>
            ) : (
              <ButtonPrimary href="/student/portal">
                <Clock className="h-4 w-4 mr-2" />
                Go to Student Portal →
              </ButtonPrimary>
            )}
            <ButtonUtility href="/">Public Home</ButtonUtility>
          </div>
        </FeatureCard>
      </div>
    );
  }

  // 4. Authorized Root Admin Operations Console
  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Hero Header Card */}
      <div className="relative overflow-hidden rounded-xl border border-hairline bg-surface p-6 sm:p-8 shadow-notion-card">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <BadgePill label="Root Admin Operations Console" color="purple" />
            <span className="text-xs text-ink-muted">• Connected to Supabase PostgreSQL & Cloudinary</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink leading-tight">
            PaperGrade AI Mission Control
          </h1>

          <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
            Full authority cockpit: configure multi-tenant coaching chains, review AI rubric generation, manage 30-minute exam windows, observe Gemini API quotas, and resolve student revaluation appeals.
          </p>

          <div className="pt-3 flex flex-wrap items-center gap-3">
            <ButtonPrimary href="/exams/new">
              <GraduationCap className="h-4 w-4 mr-2" />
              Create Exam & Rubric
            </ButtonPrimary>
            <ButtonUtility href="/admin/tenancy" className="py-2.5 px-4 text-sm font-medium">
              <Building2 className="h-4 w-4 mr-2 text-primary" />
              Coaching Institutes & Branches →
            </ButtonUtility>
            <ButtonUtility href="/analytics" className="py-2.5 px-4 text-sm font-medium">
              <BarChart3 className="h-4 w-4 mr-2 text-ink-muted" />
              Telemetry & Quotas →
            </ButtonUtility>
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/admin/tenancy" className="group">
          <FeatureCard hoverable className="h-full flex flex-col justify-between">
            <div className="space-y-2">
              <div className="h-8 w-8 rounded-md bg-[#f5eefc] text-[#793caf] flex items-center justify-center">
                <Building2 className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-ink group-hover:text-primary transition-colors">
                Tenancy Desk
              </h3>
              <p className="text-xs text-ink-muted">
                Create coaching institutes, physical branches, and provision scoped manager credentials.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between text-xs text-primary font-medium">
              <span>Manage Tenancy</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </FeatureCard>
        </Link>

        <Link href="/branch/batches" className="group">
          <FeatureCard hoverable className="h-full flex flex-col justify-between">
            <div className="space-y-2">
              <div className="h-8 w-8 rounded-md bg-[#e6f6f6] text-[#2a9d99] flex items-center justify-center">
                <Users className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-ink group-hover:text-primary transition-colors">
                Branch Batches
              </h3>
              <p className="text-xs text-ink-muted">
                Review batch rosters, CSV student registrations, and scheduled 30-min submission windows.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between text-xs text-primary font-medium">
              <span>View Batches</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </FeatureCard>
        </Link>

        <Link href="/exams" className="group">
          <FeatureCard hoverable className="h-full flex flex-col justify-between">
            <div className="space-y-2">
              <div className="h-8 w-8 rounded-md bg-[#edf5fd] text-primary flex items-center justify-center">
                <GraduationCap className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-ink group-hover:text-primary transition-colors">
                Exams & Rubrics
              </h3>
              <p className="text-xs text-ink-muted">
                Inspect question papers, AI draft rubrics, criteria scores, and publication status.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between text-xs text-primary font-medium">
              <span>Exams Console</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </FeatureCard>
        </Link>

        <Link href="/revaluation" className="group">
          <FeatureCard hoverable className="h-full flex flex-col justify-between">
            <div className="space-y-2">
              <div className="h-8 w-8 rounded-md bg-[#fef4ea] text-[#dd5b00] flex items-center justify-center">
                <RotateCcw className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold text-ink group-hover:text-primary transition-colors">
                Revaluation Desk
              </h3>
              <p className="text-xs text-ink-muted">
                Strict human-verified grievance adjudication within 7-calendar-day window.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between text-xs text-primary font-medium">
              <span>Resolve Appeals</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </FeatureCard>
        </Link>
      </div>

      {/* Metrics & System Health Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FeatureCard className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-hairline">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">Examinations</span>
            <BadgePill label="Active" color="green" />
          </div>
          <div className="text-3xl font-bold text-ink">
            {status?.total_exams || exams.length || 0}
          </div>
          <p className="text-xs text-ink-muted">
            Total examinations registered across branches.
          </p>
        </FeatureCard>

        <FeatureCard className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-hairline">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">Submissions</span>
            <BadgePill label="Cloudinary Backed" color="teal" />
          </div>
          <div className="text-3xl font-bold text-ink">
            {status?.total_submissions || 0}
          </div>
          <p className="text-xs text-ink-muted">
            Answer sheets ingested via single-PDF canonical flow.
          </p>
        </FeatureCard>

        <FeatureCard className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-hairline">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">Evaluation Engine</span>
            <BadgePill
              label={status?.gemini_configured ? "Multi-Key Active" : "Local Mode"}
              color={status?.gemini_configured ? "green" : "orange"}
            />
          </div>
          <div className="text-sm font-mono font-bold text-ink truncate">
            {status?.model || "gemini-3.8-flash"}
          </div>
          <p className="text-xs text-ink-muted">
            Round-robin rotation across 4 API keys with tiered 500 RPD fallback.
          </p>
        </FeatureCard>
      </div>

      {/* Recent Examinations List */}
      <FeatureCard className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-hairline">
          <div>
            <h2 className="text-sm font-bold text-ink">Registered Examinations</h2>
            <p className="text-xs text-ink-muted">Official lifecycle and publication control.</p>
          </div>
          <ButtonUtility href="/exams">View All Examinations</ButtonUtility>
        </div>

        <div className="divide-y divide-hairline">
          {exams.slice(0, 10).map((exam) => (
            <div key={exam.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-ink">{exam.title}</span>
                  {(exam.institute_name || exam.branch_name) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-secondary bg-canvas-soft border border-hairline px-2 py-0.5 rounded-md">
                      <Building2 className="h-3 w-3 text-primary shrink-0" />
                      <span>{exam.institute_name || "Institution"}</span>
                      <span className="text-hairline">/</span>
                      <span>{exam.branch_name || "Branch"}</span>
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-ink-muted flex flex-wrap items-center gap-2">
                  <span>Subject: {exam.subject}</span>
                  <span>•</span>
                  <span>Total: {exam.total_marks && exam.total_marks > 0 ? `${exam.total_marks} marks` : "N/A"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <BadgePill
                  label={exam.is_published ? "Published" : exam.lifecycle_status || "Draft"}
                  color={exam.is_published ? "purple" : "gray"}
                />
                <ButtonUtility onClick={(e) => handleInspectExam(e, exam)}>
                  Inspect Exam & Papers
                </ButtonUtility>
              </div>
            </div>
          ))}

          {exams.length === 0 && (
            <div className="py-8 text-center text-xs text-ink-muted">
              No examinations configured yet. Click "Create Exam & Rubric" above to start.
            </div>
          )}
        </div>
      </FeatureCard>
    </div>
  );
}
