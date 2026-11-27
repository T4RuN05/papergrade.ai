"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  CheckCircle2,
  Clock,
  Play,
  RefreshCw,
  Eye,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  api,
  clearApiCache,
} from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import {
  useExamDetail,
  useSubmissionsList,
  useWindowStatus,
  useExamEvaluationStatus,
} from "@/lib/queries";
import { useSetBreadcrumbs } from "@/lib/BreadcrumbContext";
import { useToast } from "@/lib/ToastContext";
import { useTenant } from "@/lib/TenantContext";
import {
  exportRankedStandingsCSV,
  exportRosterCSV,
  computeRankedSubmissions,
} from "@/components/ExamRankedTable";
import { useConfirm, PageBackBar } from "@/components/ui";

// Extracted Microcomponents
import { ExamActionHeader } from "@/components/exams/ExamActionHeader";
import { SubmissionWindowControlBar } from "@/components/exams/SubmissionWindowControlBar";
import { ExamAnalyticsMetrics } from "@/components/exams/ExamAnalyticsMetrics";
import { ExamAcademicMaterialsRow } from "@/components/exams/ExamAcademicMaterialsRow";
import { ExamSubmissionsGrid } from "@/components/exams/ExamSubmissionsGrid";
import { ExamUploadQpModal } from "@/components/exams/modals/ExamUploadQpModal";
import { ExamUploadAkModal } from "@/components/exams/modals/ExamUploadAkModal";
import { ExamSubmissionWindowModal } from "@/components/exams/modals/ExamSubmissionWindowModal";
import { ExamDeleteConfirmModal } from "@/components/exams/modals/ExamDeleteConfirmModal";

const ArtifactViewerModal = dynamic(
  () => import("@/components/ArtifactViewerModal").then((m) => m.ArtifactViewerModal),
  { ssr: false }
);

export default function ExamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const examId = params.id as string;
  const { selectedBranch, isRootAdmin } = useTenant();

  // Modal states
  const [uploadQpOpen, setUploadQpOpen] = useState(false);
  const [uploadAkOpen, setUploadAkOpen] = useState(false);
  const [openWindowModalOpen, setOpenWindowModalOpen] = useState(false);
  const [deleteExamModalOpen, setDeleteExamModalOpen] = useState(false);

  // Action loading states
  const [isUploadingQp, setIsUploadingQp] = useState(false);
  const [akUploadStage, setAkUploadStage] = useState<"idle" | "uploading" | "generating">("idle");
  const [isPublishing, setIsPublishing] = useState(false);
  const [isStartingEval, setIsStartingEval] = useState(false);
  const [isOpeningWindow, setIsOpeningWindow] = useState(false);
  const [isClosingWindow, setIsClosingWindow] = useState(false);
  const [isExtendingWindow, setIsExtendingWindow] = useState(false);
  const [isDeletingExam, setIsDeletingExam] = useState(false);
  const [isBulkClearing, setIsBulkClearing] = useState(false);

  // Artifact Viewer Modal State
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [viewerArtifactType, setViewerArtifactType] = useState<"QUESTION_PAPER" | "ANSWER_KEY">("QUESTION_PAPER");

  // TanStack Query: Exam details
  const {
    data: exam,
    isLoading: isExamLoading,
    refetch: refetchExam,
  } = useExamDetail(examId);

  const isPublished = exam
    ? Boolean(
        exam.is_published ||
        exam.is_published === 1 ||
        exam.status === "PUBLISHED" ||
        exam.lifecycle_status === "PUBLISHED"
      )
    : false;

  // TanStack Query: Submissions list
  const {
    data: submissions = [],
    isLoading: isSubsLoading,
    isRefetching: isSubsRefetching,
    refetch: refetchSubmissions,
  } = useSubmissionsList(examId);

  // TanStack Query: Submission window status (polls ONLY while !isPublished && window.is_active)
  const {
    data: windowStatus,
    refetch: refetchWindow,
  } = useWindowStatus(examId, isPublished);

  // Active evaluation detection
  const isQueueActive = useMemo(() => {
    return submissions.some((s: any) => s.status === "QUEUED" || s.status === "PROCESSING");
  }, [submissions]);

  const isEvalActive = Boolean(
    isStartingEval ||
    exam?.status === "EVALUATING" ||
    exam?.lifecycle_status === "EVALUATING" ||
    isQueueActive
  );

  // TanStack Query: Lightweight evaluation poller (<5ms, auto-stops when finished)
  const { data: evalStatus } = useExamEvaluationStatus(examId, isEvalActive);
  const lastEvalFinishedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!evalStatus) return;
    const finishedCount = evalStatus.summary?.finished ?? 0;
    const prevFinished = lastEvalFinishedRef.current;
    lastEvalFinishedRef.current = finishedCount;

    if (prevFinished !== null && finishedCount > prevFinished) {
      queryClient.invalidateQueries({ queryKey: queryKeys.submissions.list(examId) });
    }
    if (evalStatus.is_active === false && (exam?.status === "EVALUATING" || exam?.lifecycle_status === "EVALUATING" || isQueueActive)) {
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.detail(examId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.submissions.list(examId) });
      refetchExam();
      refetchSubmissions();
    }
  }, [evalStatus, examId, exam?.status, exam?.lifecycle_status, isQueueActive, queryClient, refetchExam, refetchSubmissions]);

  useSetBreadcrumbs(
    {
      group: "Academic Operations",
      segments: [
        { label: "Exams & Rubrics", href: "/exams" },
        { label: exam?.title || (examId ? `Exam (${examId.slice(0, 8)})` : "Exam Details") },
      ],
    },
    [exam?.title, examId]
  );

  // Artifact Viewer handler
  const handleViewArtifact = (type: "QUESTION_PAPER" | "ANSWER_KEY") => {
    setViewerArtifactType(type);
    setViewerModalOpen(true);
  };

  // Calculations for KPI Cards
  const stats = useMemo(() => {
    if (!submissions || submissions.length === 0) {
      return { total: 0, completed: 0, avgPct: 0, needsReview: 0 };
    }
    const evaluatedSubs = submissions.filter((s: any) =>
      ["COMPLETED", "NEEDS_REVIEW", "GRADED"].includes(s.status)
    );
    const count = evaluatedSubs.length;
    const needsReview = submissions.filter((s: any) => s.status === "NEEDS_REVIEW").length;

    if (count === 0) {
      return { total: submissions.length, completed: 0, avgPct: 0, needsReview };
    }

    const avgPct = evaluatedSubs.reduce((acc: number, curr: any) => acc + (curr.percentage || 0), 0) / count;

    return {
      total: submissions.length,
      completed: count,
      avgPct: Math.round(avgPct),
      needsReview,
    };
  }, [submissions]);

  const unprocessedCount = useMemo(() => {
    return submissions.filter(
      (s: any) =>
        !["COMPLETED", "GRADED", "NEEDS_REVIEW", "PROCESSING", "QUEUED"].includes(
          (s.status || "").toUpperCase()
        )
    ).length;
  }, [submissions]);

  const hasFailedPapers = useMemo(() => {
    return submissions.some((s: any) => (s.status || "").toUpperCase() === "FAILED");
  }, [submissions]);

  // Mutations
  const handleStartEvaluation = async () => {
    if (!exam) return;
    const ok = await confirm({
      title: "Start Automated Evaluation",
      message: `Start automated evaluation for all accepted student papers in "${exam.title}"? Jobs will be processed in roll number ascending order.`,
      confirmText: "Start Evaluation",
      variant: "primary",
    });
    if (!ok) return;

    setIsStartingEval(true);
    try {
      clearApiCache(`submissions:list:all`);
      clearApiCache(`exams:list:`);

      const res = await api.startEvaluation(examId);

      queryClient.invalidateQueries({ queryKey: queryKeys.exams.detail(examId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.submissions.list(examId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.all() });

      toast.success(
        `Evaluation started! ${res?.enqueued_papers || "All"} submissions enqueued in roll number order.`,
        { title: "Evaluation Triggered" }
      );
      await Promise.all([refetchExam(), refetchSubmissions()]);
    } catch (err: any) {
      toast.error(err.message || "Failed to start evaluation", { title: "Evaluation Blocked" });
      await Promise.all([refetchExam(), refetchSubmissions()]);
    } finally {
      setIsStartingEval(false);
    }
  };

  const handlePublishResults = async () => {
    if (!exam) return;
    const ok = await confirm({
      title: "Publish Official Results",
      message:
        "Are you sure you want to officially publish evaluation results? Marks and rubrics will become visible on student portals.",
      confirmText: "Publish Results",
      variant: "primary",
    });
    if (!ok) return;

    setIsPublishing(true);
    try {
      await api.publishResults(examId);
      toast.success("Results successfully published to the student portal!", {
        title: "Results Published",
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.detail(examId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.submissions.all() });
      await refetchExam();
    } catch (err: any) {
      toast.error(err.message || "Failed to publish results", { title: "Publish Failed" });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUploadQp = async (file: File) => {
    setIsUploadingQp(true);
    try {
      const formData = new FormData();
      formData.append("question_paper", file);
      await api.uploadQuestionPaper(examId, formData);
      setUploadQpOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.detail(examId) });
      await refetchExam();
      toast.success("Question Paper uploaded successfully!", { title: "Paper Attached" });
    } catch (err: any) {
      toast.error(err.message || "Failed to upload question paper", { title: "Upload Failed" });
    } finally {
      setIsUploadingQp(false);
    }
  };

  const handleUploadAk = async (file: File) => {
    setAkUploadStage("uploading");
    const uploadToastId = toast.loading("Uploading official Answer Key...", {
      title: "Uploading Answer Key",
    });
    let activeToastId: string | null = uploadToastId;
    try {
      const formData = new FormData();
      formData.append("answer_key", file);
      formData.append("auto_generate_rubric", "false");
      await api.uploadAnswerKey(examId, formData);

      toast.dismiss(uploadToastId);
      activeToastId = null;
      toast.success("Answer Key uploaded successfully!", {
        title: "Answer Key Attached",
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.exams.detail(examId) });

      setAkUploadStage("generating");
      const genToastId = toast.loading(
        "Generating AI draft rubric with Gemini Vision...",
        { title: "Generating Rubrics" }
      );
      activeToastId = genToastId;

      await api.generateRubric(examId);

      toast.dismiss(genToastId);
      activeToastId = null;
      setUploadAkOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.detail(examId) });
      await refetchExam();
      toast.success("AI draft rubric generated for your review!", {
        title: "Rubric Ready",
      });
    } catch (err: any) {
      if (activeToastId) toast.dismiss(activeToastId);
      toast.error(err.message || "Failed to process answer key", {
        title: akUploadStage === "generating" ? "Rubric Generation Failed" : "Upload Failed",
      });
    } finally {
      setAkUploadStage("idle");
    }
  };

  const handleOpenWindow = async (data: { durationMinutes: number; reason: string; scope: string }) => {
    if (!exam) return;
    setIsOpeningWindow(true);
    try {
      const hasPriorWindow = Boolean(windowStatus?.has_window);
      if (hasPriorWindow) {
        await api.reopenWindow(exam.id, {
          duration_minutes: data.durationMinutes,
          reason: data.reason,
          reopen_reason: data.reason,
          reopen_scope: data.scope,
        });
      } else {
        await api.openWindow(exam.id, data.durationMinutes, 2);
      }
      toast.success(`Submission window opened for "${exam.title}" (${data.durationMinutes}m)!`, {
        title: "Window Opened",
      });
      setOpenWindowModalOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.windows.status(examId) });
      await Promise.all([refetchWindow(), refetchExam()]);
    } catch (err: any) {
      toast.error(err.message || "Failed to open window", { title: "Window Open Failed" });
    } finally {
      setIsOpeningWindow(false);
    }
  };

  const handleExtendWindow = async () => {
    if (!exam) return;
    setIsExtendingWindow(true);
    try {
      await api.extendWindow(exam.id, 15, "Extended by teacher from exam dashboard");
      toast.success("Submission window extended by 15 minutes!", { title: "Window Extended" });
      queryClient.invalidateQueries({ queryKey: queryKeys.windows.status(examId) });
      await refetchWindow();
    } catch (err: any) {
      toast.error(err.message || "Failed to extend submission window", {
        title: "Window Extension Failed",
      });
    } finally {
      setIsExtendingWindow(false);
    }
  };

  const handleCloseWindow = async () => {
    if (!exam) return;
    const ok = await confirm({
      title: "Close Submission Window",
      message:
        "Are you sure you want to close the student submission window immediately? Students will no longer be able to submit answer sheets.",
      confirmText: "Close Window",
      variant: "danger",
    });
    if (!ok) return;

    setIsClosingWindow(true);
    try {
      await api.closeWindow(exam.id, "Closed early by administrator");
      toast.success("Submission window closed successfully.", { title: "Window Closed" });
      queryClient.invalidateQueries({ queryKey: queryKeys.windows.status(examId) });
      await Promise.all([refetchWindow(), refetchExam()]);
    } catch (err: any) {
      toast.error(err.message || "Failed to close submission window", {
        title: "Window Close Failed",
      });
    } finally {
      setIsClosingWindow(false);
    }
  };

  const handleDeleteExam = async () => {
    if (!exam) return;
    setIsDeletingExam(true);
    try {
      const res = await api.deleteExam(exam.id, exam.title);
      clearApiCache();
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.all() });
      toast.success(
        res.message || `Exam "${exam.title}" permanently deleted.`,
        { title: "Exam Deleted" }
      );
      setDeleteExamModalOpen(false);
      router.push("/exams");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete exam", { title: "Deletion Failed" });
    } finally {
      setIsDeletingExam(false);
    }
  };

  const handleClearAllExamReviews = async () => {
    if (stats.needsReview === 0) return;
    const ok = await confirm({
      title: "Clear All Review Flags",
      message: `Are you sure you want to clear review flags on all ${stats.needsReview} flagged papers and mark them as Completed?`,
      confirmText: "Clear Flags",
      variant: "warning",
    });
    if (!ok) return;

    setIsBulkClearing(true);
    try {
      const res = await api.clearExamReviews(examId);
      queryClient.invalidateQueries({ queryKey: queryKeys.submissions.list(examId) });
      await refetchSubmissions();
      toast.success(
        `Cleared review flags on ${res.cleared_count || stats.needsReview} papers. All marked as Completed!`,
        { title: "Review Flags Cleared" }
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to clear exam review flags", { title: "Bulk Unflag Failed" });
    } finally {
      setIsBulkClearing(false);
    }
  };

  const handleExportRosterCSV = () => {
    if (!exam) return;
    const ok = exportRosterCSV(exam.title, submissions as any, exam.total_marks || 25);
    if (!ok) {
      toast.info("No submissions available to export.", { title: "Empty Ledger" });
    }
  };

  const handleExportRankedCSV = () => {
    if (!exam) return;
    const rankedAll = computeRankedSubmissions(submissions as any, exam.total_marks || 25);
    const ok = exportRankedStandingsCSV(exam.title, rankedAll);
    if (!ok) {
      toast.info("No evaluated submissions available to rank.", { title: "Leaderboard Empty" });
    }
  };

  if (!isExamLoading && !exam) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <div className="notion-card rounded-lg p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-ink">Exam not found</p>
          <p className="text-xs text-ink-muted">
            The requested examination could not be located in the registry.
          </p>
          <div className="pt-2">
            <Link href="/exams" className="notion-btn-utility">
              Return to Examinations
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isWindowOpen = Boolean(windowStatus?.is_active);
  const hasQp = Boolean(exam?.question_paper_path || (exam as any)?.has_question_paper);
  const hasAk = Boolean(exam?.answer_key_path || (exam as any)?.has_answer_key);
  const isRubricApproved = Boolean(
    exam?.is_rubric_approved ||
    exam?.has_approved_rubric ||
    exam?.status === "RUBRIC_APPROVED" ||
    (exam as any)?.rubric_version?.is_approved
  );

  const canStartEvaluation =
    !isEvalActive &&
    !isWindowOpen &&
    hasAk &&
    isRubricApproved &&
    unprocessedCount > 0;

  const evaluationDisabledReason = isWindowOpen
    ? "Submission window is active. Please wait until window closes."
    : !hasAk
    ? "Upload Official Answer Key first."
    : !isRubricApproved
    ? "Review & approve Rubric first."
    : unprocessedCount === 0
    ? "All submissions have already been evaluated."
    : undefined;

  const questionCount = exam?.rubric_version?.rubric_data
    ? typeof exam.rubric_version.rubric_data === "string"
      ? (JSON.parse(exam.rubric_version.rubric_data)?.questions || []).length
      : (exam.rubric_version.rubric_data?.questions || []).length
    : 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 cascade-group">
      {/* Fixed Backing Navigation */}
      <PageBackBar backHref="/exams" backLabel="Back to Examinations" />

      {/* 1. Header Toolbar */}
      <ExamActionHeader
        title={exam?.title}
        subject={exam?.subject}
        totalMarks={exam?.total_marks}
        branchName={selectedBranch?.name}
        examDate={exam?.exam_date || windowStatus?.opened_at || exam?.created_at}
        isPublished={isPublished}
        isPublishing={isPublishing}
        isRubricApproved={isRubricApproved}
        hasRubric={Boolean(exam?.current_rubric_version_id)}
        totalSubmissions={stats.total}
        isRootAdmin={isRootAdmin}
        isLoading={isExamLoading}
        isEvaluating={isEvalActive}
        canStartEvaluation={canStartEvaluation}
        isStartingEval={isStartingEval}
        unprocessedCount={unprocessedCount}
        evaluatedCount={stats.completed}
        hasFailedPapers={hasFailedPapers}
        evaluationDisabledReason={evaluationDisabledReason}
        onStartEvaluation={handleStartEvaluation}
        onTogglePublish={handlePublishResults}
        onExportCsv={handleExportRankedCSV}
        onDeleteExam={() => setDeleteExamModalOpen(true)}
      />

      {/* 2. Submission Window Control Bar */}
      <SubmissionWindowControlBar
        windowStatus={windowStatus}
        isLoading={isExamLoading}
        isOpeningWindow={isOpeningWindow}
        isExtendingWindow={isExtendingWindow}
        isClosingWindow={isClosingWindow}
        isPublished={isPublished}
        isRubricApproved={isRubricApproved}
        onOpenWindowModal={() => {
          if (isPublished) return;
          setOpenWindowModalOpen(true);
        }}
        onExtendWindow={handleExtendWindow}
        onCloseWindow={handleCloseWindow}
      />

      {/* 3. Academic Materials & Rubric */}
      <section className="space-y-3">
        <div className="space-y-0.5">
          <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
            Academic Materials &amp; Rubric
          </h2>
          <p className="text-xs sm:text-[13px] text-ink-muted">
            Source question paper, official answer key, and structured grading rubric.
          </p>
        </div>

        <ExamAcademicMaterialsRow
          examId={examId}
          hasQp={hasQp}
          hasAk={hasAk}
          isRubricApproved={isRubricApproved}
          questionCount={questionCount}
          isRootAdmin={isRootAdmin}
          isLoading={isExamLoading}
          onViewQp={() => handleViewArtifact("QUESTION_PAPER")}
          onViewAk={() => handleViewArtifact("ANSWER_KEY")}
          onUploadQp={() => setUploadQpOpen(true)}
          onUploadAk={() => setUploadAkOpen(true)}
        />
      </section>

      {/* 4. Analytics Metrics */}
      <section className="space-y-3">
        <div className="space-y-0.5">
          <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
            Evaluation Summary
          </h2>
          <p className="text-xs sm:text-[13px] text-ink-muted">
            Submission progress, grading completion, and class average.
          </p>
        </div>

        <ExamAnalyticsMetrics
          totalSubmissions={stats.total}
          evaluatedCount={stats.completed}
          averagePercentage={stats.avgPct}
          needsReviewCount={stats.needsReview}
          isLoading={isSubsLoading && submissions.length === 0}
        />
      </section>

      {/* AI Evaluation In-Progress Banner */}
      {isEvalActive && (
        <div className="notion-card rounded-lg border-primary/30 p-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center shrink-0">
              <RefreshCw className="h-4 w-4 text-primary animate-spin" />
            </div>
            <div>
              <p className="font-semibold text-ink">AI Grading in Progress</p>
              <p className="text-xs text-ink-muted mt-0.5">
                Processing queued student answer scripts via Gemini Vision AI. Results update automatically.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <span className="font-mono tabular-nums font-semibold text-ink text-xs sm:text-sm bg-canvas-soft px-3 py-1.5 rounded-md border border-hairline">
              {evalStatus?.summary?.finished ?? stats.completed} / {evalStatus?.summary?.total ?? stats.total} Evaluated
            </span>
          </div>
        </div>
      )}

      {/* Ready to Evaluate Banner */}
      {canStartEvaluation && (
        <div className="notion-card rounded-lg p-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-ink">All Evaluation Prerequisites Satisfied</p>
              <p className="text-xs text-ink-muted mt-0.5">
                Submission window closed, answer key uploaded, and rubric locked. Ready to evaluate {unprocessedCount} student {unprocessedCount === 1 ? "paper" : "papers"} in FIFO order.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleStartEvaluation}
            disabled={isStartingEval}
            className="notion-btn-primary w-full sm:w-auto justify-center shrink-0"
          >
            <Play className="h-3.5 w-3.5 shrink-0" />
            <span>
              {isStartingEval
                ? "Starting Evaluation..."
                : `Start Evaluation (${unprocessedCount})`}
            </span>
          </button>
        </div>
      )}

      {/* Evaluation Invariant Checklist Banner when requirements are pending */}
      {!isPublished && !isEvalActive && !canStartEvaluation && (
        <div className="notion-card rounded-lg p-4 sm:p-5 text-xs space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <span className="font-semibold text-sm text-ink flex items-center gap-2">
              <Clock className="h-4 w-4 text-ink-secondary shrink-0" />
              <span>
                Evaluation Prerequisites Checklist{" "}
                <span className="font-normal text-ink-muted">
                  {unprocessedCount > 0 ? `(${unprocessedCount} papers stored)` : "(Awaiting Submissions & Key)"}
                </span>
              </span>
            </span>
            <span className="text-xs text-ink-muted">Evaluation Invariants</span>
          </div>
          <p className="text-xs text-ink-muted leading-relaxed">
            Per examination guidelines, automated evaluation cannot begin while students are still uploading or until the official answer key and locked rubric are verified.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 rounded-md border border-hairline bg-canvas-soft flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className={`h-4 w-4 shrink-0 ${!isWindowOpen ? "text-emerald-600" : "text-amber-600"}`} />
                <span className="font-medium text-ink truncate">1. Submission Window</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface border border-hairline text-ink-secondary shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${!isWindowOpen ? "bg-emerald-500" : "bg-amber-500"}`} />
                {!isWindowOpen ? "Closed" : "Active"}
              </span>
            </div>

            <div className="p-3 rounded-md border border-hairline bg-canvas-soft flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className={`h-4 w-4 shrink-0 ${hasAk ? "text-emerald-600" : "text-amber-600"}`} />
                <span className="font-medium text-ink truncate">2. Answer Key</span>
              </div>
              {hasAk ? (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface border border-hairline text-ink-secondary">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Uploaded
                  </span>
                  <button
                    type="button"
                    onClick={() => handleViewArtifact("ANSWER_KEY")}
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium cursor-pointer"
                    title="View Answer Key in Modal"
                  >
                    <Eye className="h-3 w-3" />
                    View
                  </button>
                </div>
              ) : isRootAdmin ? (
                <button
                  type="button"
                  onClick={() => setUploadAkOpen(true)}
                  className="font-semibold text-primary hover:underline text-xs shrink-0 cursor-pointer"
                >
                  Upload →
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface border border-hairline text-ink-muted shrink-0">
                  Pending Admin
                </span>
              )}
            </div>

            <div className="p-3 rounded-md border border-hairline bg-canvas-soft flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className={`h-4 w-4 shrink-0 ${isRubricApproved ? "text-emerald-600" : "text-amber-600"}`} />
                <span className="font-medium text-ink truncate">3. Grading Rubric</span>
              </div>
              {isRubricApproved ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface border border-hairline text-ink-secondary shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Locked
                </span>
              ) : (
                <Link
                  href={`/exams/${examId}/rubric`}
                  className="font-semibold text-primary hover:underline text-xs shrink-0"
                >
                  Review &amp; Lock →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Submissions Ledger & Ranked Grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
                Submissions &amp; Standings
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface border border-hairline text-ink-muted tabular-nums">
                {stats.total}
              </span>
            </div>
            <p className="text-xs sm:text-[13px] text-ink-muted">
              Inspect candidate scripts, marks, and class standings.
            </p>
          </div>
        </div>

        <ExamSubmissionsGrid
          examId={examId}
          examTitle={exam?.title || "Exam"}
          maxMarks={exam?.total_marks || 25}
          submissions={submissions as any}
          isRefreshing={isSubsRefetching}
          isLoading={isSubsLoading}
          onRefresh={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.submissions.list(examId) });
            refetchSubmissions();
          }}
          onExportRosterCsv={handleExportRosterCSV}
          onExportRankedCsv={handleExportRankedCSV}
          needsReviewCount={stats.needsReview}
          onClearAllReviews={handleClearAllExamReviews}
          isBulkClearing={isBulkClearing}
        />
      </section>

      {/* Extracted Modular Modals */}
      <ExamUploadQpModal
        isOpen={uploadQpOpen}
        onClose={() => setUploadQpOpen(false)}
        onSubmit={handleUploadQp}
        isUploading={isUploadingQp}
      />

      <ExamUploadAkModal
        isOpen={uploadAkOpen}
        onClose={() => setUploadAkOpen(false)}
        onSubmit={handleUploadAk}
        uploadStage={akUploadStage}
      />

      <ExamSubmissionWindowModal
        isOpen={openWindowModalOpen}
        onClose={() => setOpenWindowModalOpen(false)}
        examTitle={exam?.title}
        hasPriorWindow={Boolean(windowStatus?.has_window || windowStatus?.deadline_at)}
        onSubmit={handleOpenWindow}
        isStarting={isOpeningWindow}
      />

      <ExamDeleteConfirmModal
        isOpen={deleteExamModalOpen}
        onClose={() => setDeleteExamModalOpen(false)}
        examTitle={exam?.title || "Exam"}
        onConfirm={handleDeleteExam}
        isDeleting={isDeletingExam}
      />

      {/* Artifact Viewer Modal */}
      <ArtifactViewerModal
        isOpen={viewerModalOpen}
        onClose={() => setViewerModalOpen(false)}
        examId={examId}
        examTitle={exam?.title || "Exam"}
        examSubject={exam?.subject || ""}
        examDate={exam?.exam_date || windowStatus?.opened_at || exam?.created_at}
        initialArtifact={viewerArtifactType === "QUESTION_PAPER" ? "question-paper" : "answer-key"}
        hasQuestionPaper={hasQp}
        hasAnswerKey={hasAk}
      />
    </div>
  );
}
