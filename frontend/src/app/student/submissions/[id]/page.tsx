"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  FileText,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  Award,
  Flag,
  AlertCircle,
  Archive,
  BookOpen,
  ExternalLink,
  Loader2,
  Calendar,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { api, getAuthToken } from "@/lib/api";
import { formatExamDate, resolveExamDate } from "@/lib/dateFormat";
import { queryKeys } from "@/lib/queryKeys";
import { useSubmissionDetail } from "@/lib/queries";
import { GoogleDriveIcon } from "@/components/student/PastExamCard";
import {
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
  MetricValue,
  RefetchProgressLine,
  Skeleton,
  EvaluationViewerSkeleton,
  PageBackBar,
} from "@/components/ui";
import { useToast } from "@/lib/ToastContext";
import { GradedAnswer, Submission } from "@/lib/types";

const StudentQuestionModal = dynamic(
  () => import("@/components/StudentQuestionModal").then((mod) => mod.StudentQuestionModal),
  { ssr: false }
);

const ArtifactViewerModal = dynamic(
  () => import("@/components/ArtifactViewerModal").then((mod) => mod.ArtifactViewerModal),
  { ssr: false }
);

const DocumentViewer = dynamic(
  () => import("@/components/DocumentViewer").then((mod) => mod.DocumentViewer),
  {
    ssr: false,
    loading: () => <EvaluationViewerSkeleton isStudent />,
  }
);

export default function StudentSubmissionViewerPage() {
  const params = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const submissionId = params.id as string;

  // Guard: token check
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      window.location.replace(`/auth/login?role=student&redirect=/student/submissions/${submissionId}`);
    }
  }, [submissionId]);

  // TanStack Query: SWR cached submission detail
  const {
    data: fetchedSubmission,
    isLoading,
    isFetching,
    error: queryError,
    refetch: refetchSubmission,
  } = useSubmissionDetail(submissionId);

  // Local state overlay for optimistic revaluations
  const [localSubmission, setLocalSubmission] = useState<any>(null);

  useEffect(() => {
    setLocalSubmission(null);
    setSelectedAnswer(null);
    setIsModalOpen(false);
  }, [submissionId]);

  const submission: any = useMemo(() => {
    if (localSubmission && localSubmission.id === submissionId) {
      return localSubmission;
    }
    return fetchedSubmission || null;
  }, [localSubmission, fetchedSubmission, submissionId]);

  const [selectedAnswer, setSelectedAnswer] = useState<GradedAnswer | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [artifactModalOpen, setArtifactModalOpen] = useState(false);
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [driveArchiveOverride, setDriveArchiveOverride] = useState<any>(null);

  useEffect(() => {
    setDriveArchiveOverride(null);
  }, [submissionId]);

  const driveArchive = driveArchiveOverride ?? submission?.drive_archive;

  const handleManualDriveSync = async () => {
    if (!submission?.id || syncingDrive) return;
    try {
      setSyncingDrive(true);
      const res = await api.syncSubmissionToDrive(submission.id);
      if (res.archive_status === "EXPORTED") {
        setDriveArchiveOverride({
          archive_status: "EXPORTED",
          drive_web_view_link: res.web_view_link,
          exported_at: res.exported_at || new Date().toISOString(),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.submissions.all() });
        toast.success(
          `${submission?.exam?.title || "Exam paper"} successfully backed up to your Google Drive!`,
          { title: "Drive Synced", duration: 5000 }
        );
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not sync exam paper to Google Drive.", {
        title: "Sync Failed",
      });
    } finally {
      setSyncingDrive(false);
    }
  };

  // Auto-select first answer when loaded
  useEffect(() => {
    if (submission?.answers && submission.answers.length > 0 && !selectedAnswer) {
      setSelectedAnswer(submission.answers[0]);
    }
  }, [submission?.id, submission?.answers, selectedAnswer]);

  const handleSelectAnswer = (ans: GradedAnswer, openModal: boolean = true) => {
    setSelectedAnswer(ans);
    const targetPage = ans.page_number || ans.regions?.[0]?.page_number;
    if (targetPage && targetPage >= 1) {
      setCurrentPage(targetPage);
    }
    if (openModal) {
      setIsModalOpen(true);
    }
  };

  const handleRevaluationSubmitted = (answerId: string, revalData: any) => {
    const updatedAnswers = (submission?.answers || []).map((a: any) => {
      if (a.id === answerId) {
        return {
          ...a,
          revaluation: revalData,
        };
      }
      return a;
    });

    const nextSub = {
      ...submission,
      answers: updatedAnswers,
    };

    setLocalSubmission(nextSub);
    queryClient.setQueryData(queryKeys.submissions.detail(submissionId), nextSub);
    queryClient.invalidateQueries({ queryKey: queryKeys.revaluations.all() });

    if (selectedAnswer && selectedAnswer.id === answerId) {
      setSelectedAnswer((prev: any) => ({
        ...prev,
        revaluation: revalData,
      }));
    }
  };

  const isColdLoading = isLoading && !submission;
  const loadError = queryError ? (queryError as any).message || "Failed to load submission" : null;

  if (!isColdLoading && !submission && loadError) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <FeatureCard className="p-8 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold text-ink">Submission Not Found</h2>
          <p className="text-xs text-ink-muted">
            The examination submission <code className="font-mono bg-canvas-soft px-1.5 py-0.5 rounded">{submissionId}</code> could not be loaded.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <ButtonUtility href="/student/portal">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Back to Dashboard
            </ButtonUtility>
            <ButtonPrimary size="sm" onClick={() => refetchSubmission()}>
              Retry
            </ButtonPrimary>
          </div>
        </FeatureCard>
      </div>
    );
  }

  const answers: GradedAnswer[] = submission?.answers || [];
  const pct = submission?.percentage || 0;
  const scoreBadgeColor = pct >= 75 ? "green" : pct >= 60 ? "teal" : pct >= 40 ? "sky" : "orange";

  const totalScore = Number(submission?.total_awarded_marks || 0).toFixed(1);
  const maxScore = submission?.max_marks || submission?.exam?.total_marks || 25;
  const isPurged = Boolean(submission?.is_document_purged);
  const isPublished = Boolean(
    submission?.is_published ||
    submission?.publication_status === "PUBLISHED" ||
    submission?.exam?.is_published === 1 ||
    submission?.exam?.lifecycle_status === "PUBLISHED"
  );

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto pt-5 sm:pt-8 pb-20 px-4 sm:px-6 cascade-group relative">
      {/* Background Refetch Line */}
      <RefetchProgressLine isFetching={isFetching} />

      {/* Fixed Backing Navigation & Actions Bar — Permanently Mounted (CLS = 0.00) */}
      <PageBackBar
        backHref="/student/portal"
        backLabel="Back to Student Portal"
        actions={
          <div className="grid grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1 sm:flex sm:flex-wrap sm:items-center gap-2 w-full sm:w-auto">
            {isPublished && (submission?.exam?.has_question_paper || submission?.exam?.has_answer_key || submission?.has_question_paper || submission?.has_answer_key) && (
              <button
                type="button"
                onClick={() => setArtifactModalOpen(true)}
                className="notion-btn-utility !min-h-8 h-8 min-w-0 px-3 text-xs"
                title="View Question Paper and Official Answer Key"
              >
                <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="sm:hidden truncate">QP &amp; Key</span>
                <span className="hidden sm:inline">Question Paper &amp; Key</span>
              </button>
            )}

            {/* Download Graded PDF Button */}
            {isColdLoading || !submission ? (
              <Skeleton className="h-8 w-40 rounded-md" />
            ) : !isPublished ? (
              <button
                type="button"
                disabled
                className="notion-btn-utility !min-h-8 h-8 min-w-0 px-3 text-xs opacity-55 cursor-not-allowed text-ink-muted"
                title="Graded PDF copy with annotations will become available once results are officially published by faculty."
              >
                <Clock className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                <span className="truncate">Graded PDF Pending</span>
              </button>
            ) : isPurged ? (
              <button
                type="button"
                disabled
                className="notion-btn-utility !min-h-8 h-8 min-w-0 px-3 text-xs opacity-55 cursor-not-allowed text-ink-muted"
                title="Scanned PDF was permanently deleted after retention period."
              >
                <AlertCircle className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                <span className="truncate">Document Expired</span>
              </button>
            ) : (
              <a
                href={api.getAnnotatedPdfUrl(submission.id)}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  toast.info("Downloading official annotated PDF...", { title: "Graded Paper" })
                }
                className="notion-btn-utility !min-h-8 h-8 min-w-0 px-3 text-xs"
              >
                <Download className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="sm:hidden truncate">Graded PDF</span>
                <span className="hidden sm:inline">Download Graded PDF</span>
                {submission.days_remaining !== undefined && submission.days_remaining !== null && (
                  <span className="text-[11px] text-ink-muted font-mono tabular-nums shrink-0">
                    ({Math.max(0, Math.round(submission.days_remaining))}d)
                  </span>
                )}
              </a>
            )}

            {isPublished && !submission?.is_document_purged && (
              driveArchive?.archive_status === "EXPORTED" && driveArchive.drive_web_view_link ? (
                <a
                  href={driveArchive.drive_web_view_link}
                  target="_blank"
                  rel="noreferrer"
                  className="notion-btn-utility !min-h-8 h-8 justify-center px-3 text-xs whitespace-nowrap"
                  title="Open backed up script in personal Google Drive"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <GoogleDriveIcon className="h-3.5 w-3.5 shrink-0" />
                  <span>In Drive</span>
                  <ExternalLink className="h-3 w-3 text-ink-muted shrink-0" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={handleManualDriveSync}
                  disabled={syncingDrive}
                  className="notion-btn-utility !min-h-8 h-8 justify-center px-3 text-xs disabled:opacity-50 whitespace-nowrap"
                  title="Backup graded paper to personal Google Drive"
                >
                  {syncingDrive ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-ink-muted" />
                  ) : (
                    <GoogleDriveIcon className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{syncingDrive ? "Syncing..." : "Backup to Drive"}</span>
                </button>
              )
            )}
          </div>
        }
      />

      {/* Student & Examination Banner */}
      <FeatureCard className="p-4 sm:p-5 rounded-lg border-hairline bg-surface">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {isColdLoading || !submission ? (
                <>
                  <Skeleton className="h-6 w-56 rounded" />
                  <Skeleton className="h-5 w-20 rounded" />
                </>
              ) : (
                <>
                  <h1 className="notion-heading-3 text-ink truncate max-w-[280px] sm:max-w-none">
                    {submission.exam?.title || submission.exam_title || "Examination Answer Sheet"}
                  </h1>
                  <span className="font-mono text-xs font-medium rounded-xs bg-canvas-soft border border-hairline px-2 py-0.5 text-ink-secondary">
                    {submission.roll_number}
                  </span>
                  {formatExamDate(resolveExamDate(submission)) && (
                    <span
                      className="inline-flex items-center gap-1 text-xs font-medium rounded-xs bg-canvas-soft border border-hairline px-2 py-0.5 text-ink-secondary tabular-nums whitespace-nowrap"
                      title="Exam Date"
                    >
                      <Calendar className="h-3 w-3 text-ink-muted shrink-0" />
                      <span>{formatExamDate(resolveExamDate(submission))}</span>
                    </span>
                  )}
                  <span className="text-xs text-ink-muted hidden sm:inline">
                    • {submission.student_name}
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              {isColdLoading || !submission
                ? "Loading evaluated examination record..."
                : !isPublished
                ? "Read-only preview of your registered answer script. Evaluated marks and rubrics will appear here once officially published."
                : isPurged
                ? "Archived question marks record. Scanned pages removed after 15 days to conserve storage."
                : "Read-only paper viewer. Tap any question box on the canvas to inspect marks and request revaluation."}
            </p>
          </div>

          {/* Scores Overview Cluster */}
          <div className="grid grid-cols-3 sm:flex items-center gap-3 border-t md:border-t-0 md:border-l border-hairline pt-3 md:pt-0 md:pl-6 shrink-0">
            {isColdLoading || !submission ? (
              <div className="flex items-center gap-4">
                <Skeleton className="h-8 w-20 rounded" />
                <Skeleton className="h-8 w-16 rounded" />
              </div>
            ) : isPublished ? (
              <>
                <div>
                  <span className="text-[11px] text-ink-muted block font-medium leading-none">
                    Marks
                  </span>
                  <span className="font-mono tabular-nums text-base sm:text-lg font-semibold text-ink mt-1 block leading-tight">
                    <MetricValue
                      value={totalScore}
                      isLoading={isColdLoading}
                      width="w-10"
                      className="font-mono tabular-nums text-base sm:text-lg font-semibold text-ink inline-block"
                    />
                    <span className="text-xs text-ink-muted font-normal"> / {maxScore}</span>
                  </span>
                </div>

                <div className="text-center sm:text-right">
                  <span className="text-[11px] text-ink-muted block font-medium leading-none">
                    Score
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-canvas-soft border border-hairline text-xs font-mono tabular-nums font-semibold text-ink mt-1">
                    {pct.toFixed(1)}%
                  </span>
                </div>

                <div className="text-right sm:text-left sm:pl-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas-soft border border-hairline px-2.5 py-0.5 text-[11px] font-medium text-ink-secondary">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span><span className="hidden sm:inline">Results </span>Published</span>
                  </span>
                </div>
              </>
            ) : (
              <div className="col-span-3 sm:flex items-center gap-3">
                <div className="text-left">
                  <span className="text-[11px] text-ink-muted block font-medium leading-none">
                    Marks
                  </span>
                  <span className="text-xs font-semibold text-ink-secondary mt-1 block leading-tight">
                    Pending Publication
                  </span>
                </div>
                <div className="text-right sm:text-left sm:pl-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas-soft border border-hairline px-2.5 py-1 text-xs font-medium text-ink-secondary">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    Grading in Progress
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </FeatureCard>

      {/* Main Workspace: Document Viewer OR Archived Marks Ledger (if purged) + Right Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 items-start">
        {/* Left: Interactive Document Viewer OR Archived Ledger (3 cols) */}
        {isPurged ? (
          <div className="lg:col-span-3 rounded-lg border border-hairline bg-surface p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-hairline">
              <div>
                <h2 className="notion-heading-3 text-ink">Official Archived Marks Ledger</h2>
                <p className="text-xs text-ink-muted mt-0.5">
                  Scanned document was purged per 15-day storage retention policy. Question marks and evaluator remarks are permanently preserved.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-canvas-soft text-ink-secondary border border-hairline shrink-0">
                <ShieldCheck className="h-3.5 w-3.5 text-ink-muted" />
                Marks Verified & Preserved
              </span>
            </div>

            {/* Question Breakdown Table */}
            <div className="overflow-x-auto -mx-1 sm:mx-0">
              <table className="w-full min-w-[640px] text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-hairline text-ink-muted font-medium text-[11px]">
                    <th className="py-2.5 px-3 whitespace-nowrap">Question</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Awarded Marks</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Max Marks</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Score %</th>
                    <th className="py-2.5 px-3 min-w-[220px]">Evaluation Rationale</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap w-[130px] min-w-[130px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {answers.map((ans) => {
                    const ansScore = Number(ans.awarded_marks || 0);
                    const ansMax = Number(ans.max_marks || 1);
                    const ansPct = Math.round((ansScore / ansMax) * 100);
                    const isFull = ansScore >= ansMax;
                    const isZero = ansScore === 0;

                    return (
                      <tr key={ans.id} className="hover:bg-canvas-soft/50 transition-colors">
                        <td className="py-3 px-3 font-semibold text-ink whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{ans.question_id}</span>
                            {ans.is_manual_override && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-canvas-soft border border-hairline text-ink-secondary font-medium">
                                Override
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums font-semibold text-ink whitespace-nowrap">
                          {ansScore.toFixed(1)}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-ink-muted whitespace-nowrap">
                          {ansMax.toFixed(1)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-block font-mono tabular-nums text-[11px] font-semibold px-2 py-0.5 rounded-xs border border-hairline bg-canvas-soft ${
                              isFull
                                ? "text-emerald-700 dark:text-emerald-300"
                                : isZero
                                ? "text-rose-700 dark:text-rose-300"
                                : "text-ink-secondary"
                            }`}
                          >
                            {ansPct}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-ink-secondary max-w-xs min-w-[200px] truncate" title={ans.grading_rationale}>
                          {ans.grading_rationale || "Evaluated against approved rubric."}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap w-[130px] min-w-[130px]">
                          <button
                            type="button"
                            onClick={() => handleSelectAnswer(ans, true)}
                            className="inline-flex items-center gap-1 text-primary hover:underline font-semibold text-xs cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <span>Inspect Details</span>
                            <span aria-hidden="true">→</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-3 h-[380px] sm:h-[540px] md:h-[680px] lg:h-[820px] rounded-lg overflow-hidden border border-hairline bg-surface shadow-xs relative w-full max-w-full">
            {isColdLoading || !submission ? (
              <EvaluationViewerSkeleton isStudent />
            ) : (
              <DocumentViewer
                submissionId={submission.id}
                pageCount={submission.page_count || 1}
                answers={answers}
                onSelectAnswer={(ans) => handleSelectAnswer(ans, false)}
                onInspectAnswer={(ans) => handleSelectAnswer(ans, true)}
                selectedAnswerId={selectedAnswer?.id}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                totalAwardedMarks={isPublished ? submission.total_awarded_marks : undefined}
                maxMarks={submission.max_marks}
                readOnly={true}
                hideScoreStamp={!isPublished}
                isDocumentPurged={Boolean(submission.is_document_purged)}
                examDate={resolveExamDate(submission)}
              />
            )}
          </div>
        )}

        {/* Right Sidebar: Questions List & Revaluation Badges (1 col) */}
        <div className="space-y-4">
          <FeatureCard className="p-4 rounded-lg space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-hairline">
              <h3 className="text-xs font-semibold text-ink">
                Questions ({answers.length})
              </h3>
              <span className="text-[11px] text-ink-muted">Tap to inspect</span>
            </div>

            <div className="space-y-1.5 max-h-[580px] overflow-y-auto pr-1">
              {isColdLoading || !submission ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-md border border-hairline bg-surface space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-3.5 w-16 rounded" />
                      <Skeleton className="h-4 w-12 rounded" />
                    </div>
                    <Skeleton className="h-2.5 w-24 rounded" />
                  </div>
                ))
              ) : answers.length === 0 ? (
                <div className="p-4 text-center text-xs text-ink-muted">
                  No question records available.
                </div>
              ) : (
                answers.map((ans) => {
                  const isSelected = selectedAnswer?.id === ans.id;
                  const ansScore = Number(ans.awarded_marks || 0);
                  const ansMax = Number(ans.max_marks || 1);
                  const scoreColor =
                    ansScore >= ansMax
                      ? "text-emerald-700 dark:text-emerald-300"
                      : ansScore > 0
                      ? "text-ink"
                      : "text-rose-700 dark:text-rose-300";

                  const reval = ans.revaluation;
                  const hasPendingReval =
                    reval && (reval.status === "SUBMITTED" || reval.status === "UNDER_REVIEW");
                  const isResolved = reval && reval.status === "RESOLVED";

                  return (
                    <button
                      key={ans.id}
                      onClick={() => handleSelectAnswer(ans, true)}
                      className={`w-full flex flex-col p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-hairline bg-surface hover:bg-canvas-soft"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-ink">
                            {ans.question_id}
                          </span>
                          {hasPendingReval && (
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-ink-secondary bg-canvas-soft border border-hairline px-1.5 py-0.2 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                              Reval Pending
                            </span>
                          )}
                          {isResolved && (
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-ink-secondary bg-canvas-soft border border-hairline px-1.5 py-0.2 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              Resolved
                            </span>
                          )}
                        </div>

                        {isPublished ? (
                          <span className={`font-mono tabular-nums text-xs font-semibold px-1.5 py-0.5 rounded-xs border border-hairline bg-canvas-soft ${scoreColor}`}>
                            {ansScore.toFixed(1)} / {ansMax}m
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-ink-muted bg-canvas-soft px-1.5 py-0.5 rounded-xs border border-hairline">
                            Pending
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-1 text-[11px] text-ink-muted">
                        <span>{ans.page_number ? `Page ${ans.page_number}` : "Full Paper"}</span>
                        <span className="text-primary font-medium hover:underline">
                          View Analysis →
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </FeatureCard>

          {/* Academic Guidance Note */}
          <div className="rounded-lg border border-hairline bg-canvas-soft p-3.5 text-xs text-ink-secondary space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-ink text-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Verified AI Evaluation</span>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-muted">
              Evaluated strictly against institutional model rubrics. If you find an evaluation
              discrepancy, click any question to file a formal faculty revaluation.
            </p>
          </div>
        </div>
      </div>

      {/* Question Details / Revaluation Modal */}
      {selectedAnswer && (
        <StudentQuestionModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          answer={selectedAnswer}
          submissionId={submissionId}
          onRevaluationSubmitted={handleRevaluationSubmitted}
        />
      )}

      {/* Artifact Viewer Modal (QP & Official Answer Key) */}
      <ArtifactViewerModal
        isOpen={artifactModalOpen}
        onClose={() => setArtifactModalOpen(false)}
        examId={submission?.exam_id || submission?.exam?.id || ""}
        examTitle={submission?.exam?.title || submission?.exam_title || "Examination"}
        examSubject={submission?.exam?.subject || submission?.exam_subject}
        examDate={resolveExamDate(submission)}
        hasQuestionPaper={Boolean(submission?.exam?.has_question_paper || submission?.has_question_paper)}
        hasAnswerKey={Boolean(submission?.exam?.has_answer_key || submission?.has_answer_key)}
      />
    </div>
  );
}
