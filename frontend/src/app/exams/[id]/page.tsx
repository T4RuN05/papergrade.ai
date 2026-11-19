"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
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
import {
  ExamDetailSkeleton,
  useConfirm,
} from "@/components/ui";

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
  const [isUploadingAk, setIsUploadingAk] = useState(false);
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

  // TanStack Query: Submissions list
  const {
    data: submissions = [],
    isLoading: isSubsLoading,
    isRefetching: isSubsRefetching,
    refetch: refetchSubmissions,
  } = useSubmissionsList(examId);

  // TanStack Query: Submission window status
  const {
    data: windowStatus,
    refetch: refetchWindow,
  } = useWindowStatus(examId);

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
  useExamEvaluationStatus(examId, isEvalActive);

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

  // Mutations
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
    setIsUploadingAk(true);
    const loadingToastId = toast.loading(
      "Uploading Answer Key & generating AI rubric with Gemini Vision...",
      { title: "Processing Answer Key" }
    );
    try {
      const formData = new FormData();
      formData.append("answer_key", file);
      await api.uploadAnswerKey(examId, formData);
      setUploadAkOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.detail(examId) });
      await refetchExam();
      toast.dismiss(loadingToastId);
      toast.success("Official Answer Key uploaded! AI draft rubric generated for your review.", {
        title: "Answer Key Attached",
      });
    } catch (err: any) {
      toast.dismiss(loadingToastId);
      toast.error(err.message || "Failed to upload answer key", { title: "Upload Failed" });
    } finally {
      setIsUploadingAk(false);
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
      const res = await api.deleteExam(exam.id);
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

  if (isExamLoading && !exam) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto pb-16">
        <ExamDetailSkeleton />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center text-xs text-ink-muted">
        Exam not found.
      </div>
    );
  }

  const isPublished = exam.is_published === 1 || exam.lifecycle_status === "PUBLISHED";
  const hasQp = Boolean(exam.question_paper_path);
  const hasAk = Boolean(exam.answer_key_path);
  const isRubricApproved = Boolean(exam.rubric_version?.is_approved || exam.status === "RUBRIC_APPROVED");
  const questionCount = exam.rubric_version?.rubric_data
    ? typeof exam.rubric_version.rubric_data === "string"
      ? (JSON.parse(exam.rubric_version.rubric_data)?.questions || []).length
      : (exam.rubric_version.rubric_data?.questions || []).length
    : 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* 1. Header Toolbar */}
      <ExamActionHeader
        title={exam.title}
        subject={exam.subject}
        totalMarks={exam.total_marks}
        branchName={selectedBranch?.name}
        isPublished={isPublished}
        isPublishing={isPublishing}
        isRootAdmin={isRootAdmin}
        onTogglePublish={handlePublishResults}
        onExportCsv={handleExportRankedCSV}
        onDeleteExam={() => setDeleteExamModalOpen(true)}
      />

      {/* 2. Submission Window Control Bar with Zero-Drift Countdown Hook */}
      <SubmissionWindowControlBar
        windowStatus={windowStatus}
        isOpeningWindow={isOpeningWindow}
        isExtendingWindow={isExtendingWindow}
        isClosingWindow={isClosingWindow}
        onOpenWindowModal={() => setOpenWindowModalOpen(true)}
        onExtendWindow={handleExtendWindow}
        onCloseWindow={handleCloseWindow}
      />

      {/* 3. Academic Materials & Rubric Row */}
      <ExamAcademicMaterialsRow
        examId={examId}
        hasQp={hasQp}
        hasAk={hasAk}
        isRubricApproved={isRubricApproved}
        questionCount={questionCount}
        isRootAdmin={isRootAdmin}
        onViewQp={() => handleViewArtifact("QUESTION_PAPER")}
        onViewAk={() => handleViewArtifact("ANSWER_KEY")}
        onUploadQp={() => setUploadQpOpen(true)}
        onUploadAk={() => setUploadAkOpen(true)}
      />

      {/* 4. Analytics Metrics */}
      <ExamAnalyticsMetrics
        totalSubmissions={stats.total}
        evaluatedCount={stats.completed}
        averagePercentage={stats.avgPct}
        needsReviewCount={stats.needsReview}
      />

      {/* 5. Submissions Ledger & Ranked Grid */}
      <ExamSubmissionsGrid
        examId={examId}
        examTitle={exam.title}
        maxMarks={exam.total_marks || 25}
        submissions={submissions as any}
        isRefreshing={isSubsRefetching}
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
        isUploading={isUploadingAk}
      />

      <ExamSubmissionWindowModal
        isOpen={openWindowModalOpen}
        onClose={() => setOpenWindowModalOpen(false)}
        onSubmit={handleOpenWindow}
        isStarting={isOpeningWindow}
      />

      <ExamDeleteConfirmModal
        isOpen={deleteExamModalOpen}
        onClose={() => setDeleteExamModalOpen(false)}
        examTitle={exam.title}
        onConfirm={handleDeleteExam}
        isDeleting={isDeletingExam}
      />

      {/* Artifact Viewer Modal */}
      <ArtifactViewerModal
        isOpen={viewerModalOpen}
        onClose={() => setViewerModalOpen(false)}
        examId={examId}
        examTitle={exam.title}
        examSubject={exam.subject}
        initialArtifact={viewerArtifactType === "QUESTION_PAPER" ? "question-paper" : "answer-key"}
        hasQuestionPaper={hasQp}
        hasAnswerKey={hasAk}
      />
    </div>
  );
}
