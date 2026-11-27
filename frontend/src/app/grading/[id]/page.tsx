"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Download,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
  Lock,
  Clock,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { api, getAuthToken } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useSubmissionDetail } from "@/lib/queries";
import { Submission, GradedAnswer } from "@/lib/types";
import { useSetBreadcrumbs } from "@/lib/BreadcrumbContext";
import { useToast } from "@/lib/ToastContext";

const GradingModal = dynamic(
  () => import("@/components/GradingModal").then((mod) => mod.GradingModal),
  { ssr: false }
);
import {
  RefetchProgressLine,
  Skeleton,
  EvaluationViewerSkeleton,
  PageBackBar,
} from "@/components/ui";

const DocumentViewer = dynamic(
  () => import("@/components/DocumentViewer").then((mod) => mod.DocumentViewer),
  {
    ssr: false,
    loading: () => <EvaluationViewerSkeleton />,
  }
);

export default function GradingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const submissionId = params.id as string;

  // Guard: token check
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      window.location.replace(`/auth/login?role=staff&redirect=/grading/${submissionId}`);
    }
  }, [submissionId]);

  // TanStack Query: SWR cached submission
  const {
    data: fetchedSubmission,
    isLoading,
    isFetching,
    error: queryError,
    refetch: refetchSubmission,
  } = useSubmissionDetail(submissionId);

  // Local state overlay for optimistic/immediate client edits
  const [localSubmission, setLocalSubmission] = useState<Submission | null>(null);

  useEffect(() => {
    setLocalSubmission(null);
  }, [submissionId]);

  const submission: Submission | null = useMemo(() => {
    if (localSubmission && localSubmission.id === submissionId) {
      return localSubmission;
    }
    return fetchedSubmission || null;
  }, [localSubmission, fetchedSubmission, submissionId]);

  const [selectedAnswer, setSelectedAnswer] = useState<GradedAnswer | null>(null);
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClearingReview, setIsClearingReview] = useState(false);
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  const scrollToViewer = useCallback(() => {
    if (typeof window !== "undefined" && viewerContainerRef.current) {
      const rect = viewerContainerRef.current.getBoundingClientRect();
      if (rect.top < 0 || rect.top > window.innerHeight * 0.35) {
        viewerContainerRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }
  }, []);

  useSetBreadcrumbs(
    submission
      ? {
        group: "Academic Operations",
        segments: [
          { label: "Exams & Rubrics", href: "/exams" },
          ...(submission.exam?.title
            ? [{ label: submission.exam.title, href: `/exams/${submission.exam_id}` }]
            : []),
          { label: `${submission.student_name} (${submission.roll_number})` },
        ],
      }
      : null,
    [submission]
  );

  const handleSelectAnswer = (ans: GradedAnswer, openModal: boolean = true) => {
    const current = submission?.answers?.find((a) => a.id === ans.id) || ans;
    setSelectedAnswer(current);
    const regions = current.regions || [];
    if (regions.length > 0) {
      const hasOnCurrent = regions.some((r: any) => r.page_number === currentPage);
      if (!hasOnCurrent) {
        const targetPage = regions[0]?.page_number || current.page_number;
        if (targetPage && targetPage >= 1) {
          setCurrentPage(targetPage);
        }
      }
    }
    if (openModal) {
      setIsModalOpen(true);
      setEditingAnswerId(null);
    }
  };

  const handleUpdateRegion = async (
    regionId: string,
    coords: { x: number; y: number; width: number; height: number; page_number: number }
  ) => {
    if (!submission) return;
    try {
      const updatedSub = await api.editRegion(submission.id, regionId, coords);
      if (updatedSub && updatedSub.answers) {
        handleUpdated(updatedSub);
      } else {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.submissions.detail(submission.id),
        });
      }
      toast.success("Bounding box updated & student crop regenerated.", {
        title: "Bounding Box Saved",
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to update bounding box.", { title: "Update Failed" });
      throw err;
    }
  };

  const handleDeleteRegion = async (regionId: string) => {
    if (!submission) return;
    try {
      const updatedSub = await api.deleteRegion(submission.id, regionId);
      if (updatedSub && updatedSub.answers) {
        handleUpdated(updatedSub);
      } else {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.submissions.detail(submission.id),
        });
      }
      setEditingAnswerId(null);
      toast.success("Bounding box region removed successfully.", { title: "Region Deleted" });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete bounding box region.", {
        title: "Delete Failed",
      });
    }
  };

  const handleUpdated = (updatedSub: Submission) => {
    setLocalSubmission(updatedSub);
    queryClient.setQueryData(queryKeys.submissions.detail(submissionId), updatedSub);
    if (updatedSub.exam_id) {
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.detail(updatedSub.exam_id) });
    }
    if (selectedAnswer) {
      const freshAns = (updatedSub.answers || []).find((a) => a.id === selectedAnswer.id);
      if (freshAns) {
        setSelectedAnswer({
          ...freshAns,
          _lastUpdated: (freshAns as any)._lastUpdated || Date.now(),
        });
      }
    }
  };

  const handleClearAllReviews = async () => {
    if (!submission) return;
    setIsClearingReview(true);
    try {
      const updatedSub = await api.clearSubmissionReview(submission.id);
      handleUpdated(updatedSub);
      toast.success("All question review flags cleared! Paper marked as Completed.", {
        title: "Review Flags Cleared",
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to clear review flags.", { title: "Action Failed" });
    } finally {
      setIsClearingReview(false);
    }
  };

  const isColdLoading = isLoading && !submission;
  const loadError = queryError ? (queryError as any).message || "Failed to load submission" : null;

  // Error boundary state
  if (!isColdLoading && !submission && loadError) {
    const isConnError = Boolean(
      loadError &&
      (loadError.includes("temporarily") ||
        loadError.includes("Failed to fetch") ||
        loadError.includes("502") ||
        loadError.includes("503") ||
        loadError.includes("504"))
    );
    return (
      <div className="max-w-xl mx-auto py-12 sm:py-16 px-4">
        <div className="notion-card p-6 sm:p-8 text-center space-y-4">
          <div className="mx-auto h-11 w-11 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary">
            {isConnError ? (
              <RefreshCw className="h-5 w-5 text-primary" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-[#dd5b00]" />
            )}
          </div>
          <h2 className="notion-section-title text-base text-ink">
            {isConnError ? "Connecting to Evaluation Backend" : "Submission Not Found"}
          </h2>
          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
            {isConnError
              ? "The evaluation backend is waking up or temporarily synchronizing. Please wait a moment or click Retry."
              : `The submission ID ${submissionId} could not be located in the evaluation database.`}
          </p>
          <div className="pt-2 grid grid-cols-1 sm:flex sm:items-center sm:justify-center gap-2.5">
            <Link href="/branch/batches" className="notion-btn-utility">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to Batches</span>
            </Link>
            <button
              type="button"
              onClick={() => refetchSubmission()}
              className="notion-btn-primary"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry Connection</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const backHref = submission?.exam_id
    ? `/exams/${submission.exam_id}`
    : submission?.batch_id
      ? `/batches/${submission.batch_id}`
      : "/branch/batches";

  const statusUpper = (submission?.status || "").toUpperCase();
  const isProcessing = ["QUEUED", "PROCESSING", "EVALUATING"].includes(statusUpper);
  const isUploaded = statusUpper === "UPLOADED" || statusUpper === "PENDING";

  if (isProcessing && submission) {
    return (
      <div className="max-w-xl mx-auto py-12 sm:py-16 px-4">
        <div className="notion-card p-6 sm:p-8 text-center space-y-4">
          <div className="mx-auto h-11 w-11 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-center text-primary">
            <Clock className="h-5 w-5" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-canvas-soft text-ink-secondary border border-hairline">
            <span className="h-2 w-2 rounded-full bg-[#dd5b00]" />
            <Lock className="h-3 w-3 text-ink-muted" />
            <span>AI Evaluation in Progress</span>
          </div>
          <h2 className="notion-section-title text-base text-ink">
            Sheet Inspection Locked During Processing
          </h2>
          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
            The answer sheet for <strong className="text-ink font-semibold">{submission.student_name}</strong> (
            {submission.roll_number}) is currently undergoing automated evaluation:{" "}
            <code className="font-mono bg-canvas-soft border border-hairline px-1.5 py-0.5 rounded-xs font-medium text-primary text-xs">
              {submission.status}
            </code>
            .<br />
            Inspection is temporarily locked to avoid write conflicts and will unlock automatically
            once evaluation finishes.
          </p>
          <div className="pt-2 grid grid-cols-1 sm:flex sm:items-center sm:justify-center gap-2.5">
            <Link href={backHref} className="notion-btn-utility">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to Examination</span>
            </Link>
            <button
              type="button"
              onClick={() => refetchSubmission()}
              className="notion-btn-primary"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Check Status</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const answers = submission?.answers || [];
  const missingAnswers = submission?.missing_answers || [];
  const pct = submission?.percentage || 0;

  const backLabel = submission?.exam_id
    ? "Back to Examination"
    : submission?.batch_id
    ? "Back to Batch"
    : "Back to Batches";

  return (
    <div className="space-y-5 sm:space-y-6 max-w-7xl mx-auto pb-16 cascade-group relative">
      {/* Background Refetch Line */}
      <RefetchProgressLine isFetching={isFetching} />

      {/* Fixed Backing Navigation — Permanently Mounted (CLS = 0.00) */}
      <PageBackBar
        backHref={backHref}
        backLabel={backLabel}
        actions={
          isColdLoading || !submission ? (
            <Skeleton className="h-8 w-40 rounded-md" />
          ) : isUploaded ? (
            <a
              href={api.getSubmissionPdfUrl(submission.id, true)}
              download={`${(submission.student_name || "Student").replace(/\s+/g, "_")}_${submission.roll_number || "Roll"}_Original.pdf`}
              onClick={() =>
                toast.info("Downloading raw uploaded student PDF...", { title: "PDF Export" })
              }
              className="notion-btn-primary !min-h-8 h-8 px-3 text-xs"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">Original PDF</span>
              <span className="hidden sm:inline">Download Original PDF</span>
            </a>
          ) : (
            <a
              href={api.getAnnotatedPdfUrl(
                submission.id,
                `${(submission.student_name || "Student").replace(/\s+/g, "_")}_${submission.roll_number || "Roll"}_Graded.pdf`
              )}
              download={`${(submission.student_name || "Student").replace(/\s+/g, "_")}_${submission.roll_number || "Roll"}_Graded.pdf`}
              onClick={() =>
                toast.info("Downloading annotated evaluation PDF...", { title: "PDF Export" })
              }
              className="notion-btn-primary !min-h-8 h-8 px-3 text-xs"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">Export PDF</span>
              <span className="hidden sm:inline">Export Annotated PDF</span>
            </a>
          )
        }
      />

      {/* Student Overview Banner — Permanently Mounted (CLS = 0.00) */}
      <div className="notion-card p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {isColdLoading || !submission ? (
                <>
                  <Skeleton className="h-7 w-48 rounded-xs" />
                  <Skeleton className="h-5 w-20 rounded-xs" />
                </>
              ) : (
                <>
                  <h1 className="notion-heading-2 text-xl sm:text-[24px] text-ink truncate">
                    {submission.student_name}
                  </h1>
                  <span className="font-mono text-xs font-medium rounded-xs bg-canvas-soft border border-hairline px-2 py-0.5 text-ink-secondary">
                    {submission.roll_number}
                  </span>
                  {Boolean(submission.is_manual_override) && (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-canvas-soft border border-hairline px-2 py-0.5 text-xs font-medium text-ink-secondary">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#dd5b00]" />
                      <span>Teacher Overridden</span>
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="text-xs sm:text-sm text-ink-muted flex items-center gap-1.5 flex-wrap">
              <span>Exam:</span>
              {isColdLoading || !submission ? (
                <Skeleton className="h-3.5 w-32 rounded-xs inline-block" />
              ) : (
                <span className="text-ink font-medium">
                  {submission.exam?.title || "Examination"}
                </span>
              )}
              <span>•</span>
              <span>Pages:</span>
              {isColdLoading || !submission ? (
                <Skeleton className="h-3.5 w-8 rounded-xs inline-block" />
              ) : (
                <span className="font-mono font-medium text-ink tabular-nums">{submission.page_count}</span>
              )}
            </div>
          </div>

          {/* Marks Summary Section */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 sm:gap-5 border-t md:border-t-0 md:border-l border-hairline pt-4 md:pt-0 md:pl-6">
            {isColdLoading || !submission ? (
              <div className="flex items-center gap-4">
                <Skeleton className="h-8 w-20 rounded-xs" />
                <Skeleton className="h-8 w-16 rounded-xs" />
              </div>
            ) : isUploaded ? (
              <>
                <div className="text-left sm:text-right">
                  <span className="notion-eyebrow text-ink-muted block">
                    Evaluation Status
                  </span>
                  <span className="font-medium text-xs text-primary mt-0.5 block">
                    Uploaded • Awaiting Grading
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-canvas-soft text-ink-secondary border border-hairline px-2.5 py-1 text-xs font-medium">
                  <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  <span>Uploaded</span>
                </span>
              </>
            ) : (
              <>
                <div className="text-left sm:text-right">
                  <span className="notion-eyebrow text-ink-muted block">
                    Total Awarded
                  </span>
                  <div className="font-mono text-xl sm:text-2xl font-bold text-ink tabular-nums mt-0.5">
                    {submission.total_awarded_marks != null
                      ? submission.total_awarded_marks.toFixed(1)
                      : "—"}
                    <span className="text-xs text-ink-muted font-normal">
                      {" "}
                      / {submission.max_marks || 25}
                    </span>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <span className="notion-eyebrow text-ink-muted block">
                    Percentage
                  </span>
                  <div className="mt-0.5 inline-flex items-center gap-1.5 rounded-md bg-canvas-soft border border-hairline px-2.5 py-1 text-xs sm:text-sm font-mono font-semibold text-ink tabular-nums">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        pct >= 75
                          ? "bg-[#1aae39]"
                          : pct >= 60
                            ? "bg-[#2a9d99]"
                            : pct >= 40
                              ? "bg-primary"
                              : "bg-[#dd5b00]"
                      }`}
                    />
                    <span>{pct.toFixed(1)}%</span>
                  </div>
                </div>

                <div>
                  {submission.status === "NEEDS_REVIEW" ||
                  answers.some((a) => a.needs_review) ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-canvas-soft text-ink-secondary border border-hairline px-2.5 py-1 text-xs font-medium">
                      <span className="h-2 w-2 rounded-full bg-[#8b5cf6] shrink-0" />
                      <span>
                        Needs Review{" "}
                        {answers.filter((a) => a.needs_review).length > 0
                          ? `(${answers.filter((a) => a.needs_review).length})`
                          : ""}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-canvas-soft text-ink-secondary border border-hairline px-2.5 py-1 text-xs font-medium">
                      <span className="h-2 w-2 rounded-full bg-[#1aae39] shrink-0" />
                      <span>Completed</span>
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Workspace: Document Viewer + Right Sidebar — Permanently Mounted (CLS = 0.00) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 sm:gap-6 items-start">
        {/* Left: Document Viewer Container (3 cols) */}
        <div
          ref={viewerContainerRef}
          className="lg:col-span-3 h-[480px] sm:h-[680px] lg:h-[820px] notion-card overflow-hidden relative w-full max-w-full"
        >
          {isColdLoading || !submission ? (
            <EvaluationViewerSkeleton />
          ) : (
            <DocumentViewer
              submissionId={submission.id}
              pageCount={submission.page_count}
              answers={answers}
              onSelectAnswer={(ans) => handleSelectAnswer(ans, false)}
              onInspectAnswer={(ans) => handleSelectAnswer(ans, true)}
              selectedAnswerId={selectedAnswer?.id}
              editingAnswerId={editingAnswerId}
              onSetEditingAnswerId={setEditingAnswerId}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              onUpdateRegion={handleUpdateRegion}
              onDeleteRegion={handleDeleteRegion}
              totalAwardedMarks={submission.total_awarded_marks}
              maxMarks={submission.max_marks}
              isDocumentPurged={Boolean(submission.is_document_purged)}
            />
          )}
        </div>

        {/* Right Sidebar: Questions list & Missing Answers (1 col) */}
        <div className="space-y-4">
          {/* Question Index Navigator */}
          <div className="notion-card p-4 space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-hairline gap-2">
              <h3 className="notion-section-title text-sm text-ink">
                Detected Answers ({answers.length})
              </h3>
              <span className="text-xs text-primary font-medium shrink-0">
                {isUploaded ? "Uploaded Script" : "Click to inspect"}
              </span>
            </div>

            {isColdLoading || !submission ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-md border border-hairline bg-surface space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-3.5 w-16 rounded-xs" />
                      <Skeleton className="h-4 w-12 rounded-xs" />
                    </div>
                    <Skeleton className="h-2.5 w-20 rounded-xs" />
                  </div>
                ))}
              </div>
            ) : isUploaded && answers.length === 0 ? (
              <div className="p-4 text-center space-y-2.5 rounded-lg bg-canvas-soft border border-hairline">
                <FileText className="h-6 w-6 text-primary mx-auto opacity-80" />
                <div className="text-xs font-semibold text-ink">Uploaded Script Preview</div>
                <p className="text-xs text-ink-muted leading-relaxed">
                  This paper is uploaded and saved in storage. Automated AI grading has not been
                  executed yet.
                </p>
                <div className="text-xs text-ink-muted font-medium pt-2 border-t border-hairline">
                  Total Scanned Pages:{" "}
                  <strong className="text-ink font-mono">{submission.page_count}</strong>
                </div>
              </div>
            ) : answers.length === 0 ? (
              <div className="p-4 text-center text-xs text-ink-muted bg-canvas-soft rounded-lg border border-hairline">
                No question responses detected.
              </div>
            ) : (
              <>
                {/* Quick unflag callout if any answers have needs_review */}
                {answers.some((a) => a.needs_review) && (
                  <div className="p-2.5 rounded-md border border-hairline bg-canvas-soft flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink-secondary flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#8b5cf6] shrink-0" />
                      <span>{answers.filter((a) => a.needs_review).length} flagged for review</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleClearAllReviews}
                      disabled={isClearingReview}
                      className="text-xs font-medium text-primary hover:underline cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {isClearingReview ? "Clearing..." : "Unflag All"}
                    </button>
                  </div>
                )}

                <div className="space-y-1.5 max-h-[500px] overflow-y-auto sleek-scrollbar pr-0.5">
                  {answers.map((ans) => {
                    const isSelected = selectedAnswer?.id === ans.id;
                    const dotColor =
                      ans.awarded_marks >= ans.max_marks
                        ? "bg-[#1aae39]"
                        : ans.awarded_marks > 0
                          ? "bg-[#dd5b00]"
                          : "bg-[#c93b3b]";

                    return (
                      <div
                        key={ans.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectAnswer(ans, true)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSelectAnswer(ans, true);
                          }
                        }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-md border text-left transition-colors cursor-pointer gap-2 ${
                          isSelected
                            ? "border-primary bg-primary/[0.04]"
                            : "border-hairline bg-surface hover:bg-canvas-soft"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold text-ink">
                              {ans.question_id}
                            </span>
                            {Boolean(ans.needs_review) && (
                              <span
                                className="h-2 w-2 rounded-full bg-[#8b5cf6] shrink-0"
                                title="Needs Review"
                              />
                            )}
                          </div>
                          <span className="text-[11px] text-ink-muted block truncate">
                            {(ans.regions || []).length > 1
                              ? `Pages ${Array.from(
                                new Set((ans.regions || []).map((r: any) => r.page_number))
                              )
                                .sort((a: any, b: any) => a - b)
                                .join(", ")}`
                              : ans.page_number
                                ? `Page ${ans.page_number}`
                                : "Unassigned"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs border border-hairline bg-canvas-soft font-mono text-xs font-semibold text-ink tabular-nums">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
                            <span>
                              {ans.awarded_marks}
                              <span className="text-ink-muted font-normal">/{ans.max_marks}</span>
                            </span>
                          </div>
                          {!(ans.regions || []).some(
                            (r: any) => r.page_number === currentPage
                          ) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAnswer(ans);
                                setEditingAnswerId(ans.id);
                                scrollToViewer();
                              }}
                              className="px-2 py-0.5 rounded-xs text-[11px] font-medium text-primary bg-surface hover:bg-canvas-soft border border-hairline transition-colors shrink-0 cursor-pointer"
                              title={`Add bounding box for ${ans.question_id} on Page ${currentPage}`}
                            >
                              + Page {currentPage}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Missing Answers List */}
          {missingAnswers.length > 0 && (
            <div className="notion-card p-4 space-y-2.5">
              <h4 className="notion-section-title text-sm text-ink flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#c93b3b] shrink-0" />
                <span>Unattempted / Missing ({missingAnswers.length})</span>
              </h4>
              <p className="text-xs text-ink-muted leading-relaxed">
                Questions where the model could not detect a student handwriting region.
              </p>
              <div className="space-y-1.5 pt-1">
                {missingAnswers.map((mAns) => (
                  <div
                    key={mAns.id}
                    className="w-full flex items-center justify-between p-2.5 rounded-md bg-canvas-soft border border-hairline text-xs gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectAnswer(mAns, true)}
                      className="flex-1 flex items-center justify-between text-left hover:underline cursor-pointer min-w-0"
                    >
                      <span className="font-mono font-semibold text-ink truncate">
                        {mAns.question_id}
                      </span>
                      <span className="text-xs text-ink-muted font-mono font-medium shrink-0 ml-2 tabular-nums">
                        0 / {mAns.max_marks}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAnswer(mAns);
                        setEditingAnswerId(mAns.id);
                        scrollToViewer();
                      }}
                      className="notion-btn-primary min-h-0 h-7 px-2.5 text-[11px]"
                      title={`Add bounding box for ${mAns.question_id} on current page`}
                    >
                      + Add Box
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manual Inspection / Override Modal */}
      {submission && (
        <GradingModal
          submission={submission}
          answer={selectedAnswer}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onUpdated={handleUpdated}
          currentPage={currentPage}
          onAdjustOnCanvas={(ans, pageNum) => {
            setIsModalOpen(false);
            setSelectedAnswer(ans);
            setEditingAnswerId(ans.id);
            if (pageNum && pageNum >= 1) setCurrentPage(pageNum);
            scrollToViewer();
          }}
        />
      )}
    </div>
  );
}
