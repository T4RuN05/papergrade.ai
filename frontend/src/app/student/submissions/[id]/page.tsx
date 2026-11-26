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
} from "lucide-react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { api, getAuthToken } from "@/lib/api";
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
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto pt-4 sm:pt-6 pb-16 px-3 sm:px-6 cascade-group relative">
      {/* Background Refetch Line */}
      <RefetchProgressLine isFetching={isFetching} />

      {/* Top Breadcrumb & Actions Bar — Permanently Mounted (CLS = 0.00) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
        <Link
          href="/student/portal"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover transition-colors py-1.5 px-2 -ml-2 rounded-lg hover:bg-canvas-soft w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Dashboard</span>
        </Link>

        {/* Actions Group: View QP/Answer Key & Download Graded PDF */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {isPublished && (submission?.exam?.has_question_paper || submission?.exam?.has_answer_key || submission?.has_question_paper || submission?.has_answer_key) && (
            <button
              type="button"
              onClick={() => setArtifactModalOpen(true)}
              className="h-9 px-3.5 rounded-md btn-glass-utility text-ink hover:text-ink font-semibold text-xs inline-flex items-center justify-center gap-2 shadow-2xs transition-colors w-full sm:w-auto text-center cursor-pointer active:scale-[0.98]"
              title="View Question Paper and Official Answer Key"
            >
              <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Question Paper & Key</span>
            </button>
          )}

          {/* Download Graded PDF Button */}
          {isColdLoading || !submission ? (
            <Skeleton className="h-9 w-48 rounded-md" />
          ) : !isPublished ? (
            <button
              type="button"
              disabled
              className="h-9 px-3.5 rounded-md bg-canvas-soft border border-hairline text-ink-muted text-xs font-medium shadow-2xs opacity-60 cursor-not-allowed w-full sm:w-auto inline-flex items-center justify-center gap-2 text-center"
              title="Graded PDF copy with annotations will become available once results are officially published by faculty."
            >
              <Clock className="h-3.5 w-3.5 text-ink-faint shrink-0" />
              <span>Graded PDF Pending Publication</span>
            </button>
          ) : isPurged ? (
            <button
              type="button"
              disabled
              className="h-9 px-3.5 rounded-md bg-canvas-soft border border-hairline text-ink-muted text-xs font-medium shadow-2xs opacity-60 cursor-not-allowed w-full sm:w-auto inline-flex items-center justify-center gap-2 text-center"
              title="Scanned PDF was permanently deleted after retention period."
            >
              <AlertCircle className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <span>Document Expired</span>
            </button>
          ) : (
            <a
              href={api.getAnnotatedPdfUrl(submission.id)}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                toast.info("Downloading official annotated PDF...", { title: "Graded Paper" })
              }
              className="h-9 px-3.5 rounded-md btn-glass-utility text-ink hover:text-ink font-semibold text-xs inline-flex items-center justify-center gap-2 shadow-2xs transition-colors w-full sm:w-auto text-center cursor-pointer active:scale-[0.98]"
            >
              <Download className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Download Graded Answer Sheet</span>
              {submission.days_remaining !== undefined && submission.days_remaining !== null && (
                <span className="text-[10px] text-primary font-mono font-bold">
                  ({submission.days_remaining}d left)
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
                className="h-9 px-3.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 font-semibold text-xs inline-flex items-center justify-center gap-2 shadow-2xs transition-colors w-full sm:w-auto text-center whitespace-nowrap"
                title="Open backed up script in personal Google Drive"
              >
                <GoogleDriveIcon className="h-3.5 w-3.5 shrink-0" />
                <span>In Drive</span>
                <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
              </a>
            ) : (
              <button
                type="button"
                onClick={handleManualDriveSync}
                disabled={syncingDrive}
                className="h-9 px-3.5 rounded-md btn-glass-utility text-ink hover:text-ink font-semibold text-xs inline-flex items-center justify-center gap-2 shadow-2xs transition-colors w-full sm:w-auto text-center cursor-pointer active:scale-[0.98] disabled:opacity-50 whitespace-nowrap"
                title="Backup graded paper to personal Google Drive"
              >
                {syncingDrive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                ) : (
                  <GoogleDriveIcon className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>{syncingDrive ? "Syncing..." : "Backup to Drive"}</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Student & Examination Banner — Permanently Mounted (CLS = 0.00) */}
      <FeatureCard className="p-3.5 sm:p-6 border-hairline bg-surface">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-0.5 sm:space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {isColdLoading || !submission ? (
                <>
                  <Skeleton className="h-6 w-56 rounded" />
                  <Skeleton className="h-5 w-20 rounded" />
                </>
              ) : (
                <>
                  <h1 className="text-base sm:text-xl font-bold text-ink tracking-tight truncate max-w-[280px] sm:max-w-none">
                    {submission.exam?.title || submission.exam_title || "Examination Answer Sheet"}
                  </h1>
                  <span className="font-mono text-[11px] sm:text-xs font-semibold rounded-md bg-canvas-soft border border-hairline px-2 py-0.5 text-ink">
                    Roll: {submission.roll_number}
                  </span>
                  <span className="text-xs text-ink-muted hidden sm:inline">
                    • {submission.student_name}
                  </span>
                </>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
              {isColdLoading || !submission
                ? "Loading evaluated examination record..."
                : !isPublished
                ? "Read-only preview of your registered answer script. Evaluated marks and rubrics will appear here once officially published."
                : isPurged
                ? "Archived question marks record. Scanned pages removed after 15 days to conserve storage."
                : "Read-only paper viewer. Tap any question box on the canvas to inspect marks and request revaluation."}
            </p>
          </div>

          {/* Scores Overview Pill Cluster */}
          <div className="grid grid-cols-3 sm:flex items-center gap-2 sm:gap-3 border-t md:border-t-0 md:border-l border-hairline pt-3 md:pt-0 md:pl-6 shrink-0">
            {isColdLoading || !submission ? (
              <div className="flex items-center gap-4">
                <Skeleton className="h-8 w-20 rounded" />
                <Skeleton className="h-8 w-16 rounded" />
              </div>
            ) : isPublished ? (
              <>
                <div>
                  <span className="text-[10px] text-ink-muted block uppercase tracking-wider font-semibold leading-none">
                    Marks
                  </span>
                  <span className="font-mono text-base sm:text-lg font-bold text-ink mt-0.5 block leading-tight">
                    <MetricValue
                      value={totalScore}
                      isLoading={isColdLoading}
                      width="w-10"
                      className="font-mono text-base sm:text-lg font-bold text-ink inline-block"
                    />
                    <span className="text-[10px] sm:text-xs text-ink-muted font-normal"> / {maxScore}</span>
                  </span>
                </div>

                <div className="text-center sm:text-right">
                  <span className="text-[10px] text-ink-muted block uppercase tracking-wider font-semibold leading-none">
                    Score
                  </span>
                  <BadgePill
                    label={`${pct.toFixed(1)}%`}
                    color={scoreBadgeColor}
                    className="text-xs px-2.5 py-0.5 font-mono font-bold mt-0.5"
                  />
                </div>

                <div className="text-right sm:text-left sm:pl-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] sm:text-xs font-semibold">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    <span className="hidden sm:inline">Results </span>Published
                  </span>
                </div>
              </>
            ) : (
              <div className="col-span-3 sm:flex items-center gap-3">
                <div className="text-left">
                  <span className="text-[10px] text-ink-muted block uppercase tracking-wider font-semibold leading-none">
                    Marks
                  </span>
                  <span className="text-xs font-semibold text-ink-secondary mt-0.5 block leading-tight">
                    Pending Publication
                  </span>
                </div>
                <div className="text-right sm:text-left sm:pl-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 text-xs font-semibold">
                    <Clock className="h-3 w-3 shrink-0 text-amber-600 animate-pulse" />
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
          <div className="lg:col-span-3 rounded-lg border border-hairline bg-surface p-5 sm:p-7 space-y-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-hairline">
              <div>
                <h2 className="text-base font-bold text-ink">Official Archived Marks Ledger</h2>
                <p className="text-xs text-ink-muted">
                  Scanned document was purged per 15-day storage retention policy. Question marks and evaluator remarks are permanently preserved.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
                Marks Verified & Preserved
              </span>
            </div>

            {/* Question Breakdown Table */}
            <div className="overflow-x-auto -mx-1 sm:mx-0">
              <table className="w-full min-w-[640px] text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-hairline text-ink-muted uppercase font-semibold text-[10px] tracking-wider">
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
                        <td className="py-3 px-3 font-bold text-ink whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{ans.question_id}</span>
                            {ans.is_manual_override && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 font-normal">
                                Override
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-ink whitespace-nowrap">
                          {ansScore.toFixed(1)}
                        </td>
                        <td className="py-3 px-3 font-mono text-ink-muted whitespace-nowrap">
                          {ansMax.toFixed(1)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-block font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${
                              isFull
                                ? "bg-[#edf5f0] text-[#1e613b] border-[#c8e2d2] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                                : isZero
                                ? "bg-[#fbf0f0] text-[#872323] border-[#ecd0d0] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#261212] dark:text-[#e87878] dark:border-[#491f1f] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                                : "bg-[#faf4ec] text-[#7a4e18] border-[#e8dac5] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
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
              />
            )}
          </div>
        )}

        {/* Right Sidebar: Questions List & Revaluation Badges (1 col) */}
        <div className="space-y-4">
          <FeatureCard className="p-3.5 sm:p-4 space-y-2.5 sm:space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-hairline">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                Questions ({answers.length})
              </h3>
              <span className="text-[10px] text-primary font-medium">Tap to inspect</span>
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
                      ? "bg-[#edf5f0] text-[#1e613b] border-[#c8e2d2] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                      : ansScore > 0
                      ? "bg-[#faf4ec] text-[#7a4e18] border-[#e8dac5] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                      : "bg-[#fbf0f0] text-[#872323] border-[#ecd0d0] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#261212] dark:text-[#e87878] dark:border-[#491f1f] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

                  const reval = ans.revaluation;
                  const hasPendingReval =
                    reval && (reval.status === "SUBMITTED" || reval.status === "UNDER_REVIEW");
                  const isResolved = reval && reval.status === "RESOLVED";

                  return (
                    <button
                      key={ans.id}
                      onClick={() => handleSelectAnswer(ans, true)}
                      className={`w-full flex flex-col p-2.5 rounded-md border text-left transition-all cursor-pointer ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-2xs"
                          : "border-hairline bg-surface hover:bg-canvas-soft hover:border-[#d0d0d0]"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-ink">
                            {ans.question_id}
                          </span>
                          {hasPendingReval && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                              <RotateCcw className="h-2.5 w-2.5 animate-spin text-amber-600" />
                              Reval Pending
                            </span>
                          )}
                          {isResolved && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                              Resolved
                            </span>
                          )}
                        </div>

                        {isPublished ? (
                          <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded border ${scoreColor}`}>
                            {ansScore.toFixed(1)} / {ansMax}m
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-ink-muted bg-canvas-soft px-1.5 py-0.5 rounded border border-hairline">
                            Pending
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-1 text-[10px] text-ink-muted">
                        <span>{ans.page_number ? `Page ${ans.page_number}` : "Full Paper"}</span>
                        <span className="text-primary font-semibold hover:underline">
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
            <div className="flex items-center gap-1.5 font-bold text-ink text-xs">
              <ShieldCheck className="h-4 w-4 text-primary" />
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
        hasQuestionPaper={Boolean(submission?.exam?.has_question_paper || submission?.has_question_paper)}
        hasAnswerKey={Boolean(submission?.exam?.has_answer_key || submission?.has_answer_key)}
      />
    </div>
  );
}
