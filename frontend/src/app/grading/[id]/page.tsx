"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  Flag,
  ArrowLeft,
  Eye,
  Edit3,
  HelpCircle,
  Sparkles,
  Award,
  GraduationCap,
  Layers,
  ChevronRight,
  Check,
  RefreshCw,
  Lock,
  Clock,
} from "lucide-react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { Submission, GradedAnswer } from "@/lib/types";
import { useSetBreadcrumbs } from "@/lib/BreadcrumbContext";
import { GradingModal } from "@/components/GradingModal";
import { useToast } from "@/lib/ToastContext";
import {
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
  EvaluationViewerSkeleton,
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceSkeleton = searchParams?.get("skeleton") === "true";
  const { toast } = useToast();
  const submissionId = params.id as string;

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<GradedAnswer | null>(null);
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isClearingReview, setIsClearingReview] = useState(false);

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

  useEffect(() => {
    loadSubmission();
  }, [submissionId]);

  const loadSubmission = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getSubmission(submissionId);
      setSubmission(data);
      setLoading(false);
    } catch (e: any) {
      console.error(e);
      setLoadError(e.message || "Failed to load submission");
      setLoading(false);
    }
  };

  const handleSelectAnswer = (ans: GradedAnswer, openModal: boolean = true) => {
    const current = submission?.answers?.find((a) => a.id === ans.id) || ans;
    setSelectedAnswer(current);
    const targetPage = current.page_number || current.regions?.[0]?.page_number;
    if (targetPage && targetPage >= 1) {
      setCurrentPage(targetPage);
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
      const timestamp = Date.now();
      const baseSub = updatedSub && updatedSub.answers ? updatedSub : submission;
      const patchedAnswers = (baseSub.answers || []).map((ans: any) => {
        const hasRegion = (ans.regions || []).some((reg: any) => reg.id === regionId || (!reg.id && ans.id === regionId));
        if (hasRegion || ans.id === regionId) {
          const updatedRegions = (ans.regions || []).map((reg: any) => {
            if (reg.id === regionId || (!reg.id && ans.id === regionId)) {
              return { ...reg, ...coords, _lastUpdated: timestamp };
            }
            return reg;
          });
          return {
            ...ans,
            regions: updatedRegions.length > 0 ? updatedRegions : [{ id: regionId, ...coords, _lastUpdated: timestamp }],
            page_number: coords.page_number,
            _lastUpdated: timestamp,
          };
        }
        return ans;
      });

      const nextSub = { ...baseSub, answers: patchedAnswers };
      handleUpdated(nextSub);
      toast.success("Bounding box updated & student crop regenerated.", { title: "Bounding Box Saved" });
    } catch (err: any) {
      toast.error(err.message || "Failed to update bounding box.", { title: "Update Failed" });
      throw err;
    }
  };

  const handleUpdated = (updatedSub: Submission) => {
    setSubmission(updatedSub);
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

  if (loading || forceSkeleton) {
    return <EvaluationViewerSkeleton />;
  }

  if (!submission) {
    const isConnError = Boolean(
      loadError &&
        (loadError.includes("temporarily") ||
          loadError.includes("Failed to fetch") ||
          loadError.includes("502") ||
          loadError.includes("503") ||
          loadError.includes("504"))
    );
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <FeatureCard className="p-8 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            {isConnError ? <RefreshCw className="h-6 w-6 animate-spin text-primary" /> : <AlertTriangle className="h-6 w-6" />}
          </div>
          <h2 className="text-base font-bold text-ink">
            {isConnError ? "Connecting to Evaluation Backend..." : "Submission Not Found"}
          </h2>
          <p className="text-xs text-ink-muted">
            {isConnError
              ? "The evaluation backend is waking up or temporarily synchronizing. Please wait a moment or click Retry."
              : `The submission ID ${submissionId} could not be located in the evaluation database.`}
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <ButtonUtility href="/branch/batches">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Return to Batches & Roster
            </ButtonUtility>
            <ButtonPrimary size="sm" onClick={() => loadSubmission()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry Connection
            </ButtonPrimary>
          </div>
        </FeatureCard>
      </div>
    );
  }

  const backHref = submission.exam_id
    ? `/exams/${submission.exam_id}`
    : submission.batch_id
    ? `/batches/${submission.batch_id}`
    : "/branch/batches";

  const isRuntime = !["COMPLETED", "GRADED", "NEEDS_REVIEW", "FAILED"].includes(
    (submission.status || "").toUpperCase()
  );

  if (isRuntime) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <FeatureCard className="p-8 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-primary">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <Lock className="h-3 w-3" />
            <span>Runtime Inspection Locked</span>
          </div>
          <h2 className="text-base font-bold text-ink">Sheet Inspection Disabled During Processing</h2>
          <p className="text-xs text-ink-muted leading-relaxed">
            The answer sheet for <strong className="text-ink">{submission.student_name}</strong> ({submission.roll_number}) is currently in runtime status:{" "}
            <code className="font-mono bg-canvas-soft px-1.5 py-0.5 rounded font-semibold text-primary">{submission.status}</code>.
            <br />
            The Inspect Sheet view is disabled in all runtime statuses and will unlock automatically once evaluation changes to <strong>Completed</strong> or <strong>Failed</strong>.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <ButtonUtility href={backHref}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Return to Examination
            </ButtonUtility>
            <ButtonPrimary size="sm" onClick={() => loadSubmission()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Check Status
            </ButtonPrimary>
          </div>
        </FeatureCard>
      </div>
    );
  }

  const answers = submission.answers || [];
  const missingAnswers = submission.missing_answers || [];

  const pct = submission.percentage || 0;
  const scoreBadgeColor = pct >= 75 ? "green" : pct >= 60 ? "teal" : pct >= 40 ? "sky" : "orange";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 cascade-group">
      {/* Page Actions */}
      <div className="flex items-center justify-end pb-1 border-b border-hairline">
        {/* Annotated PDF Export Download */}
        <a
          href={api.getAnnotatedPdfUrl(
            submission.id,
            `${(submission.student_name || "Student").replace(/\s+/g, "_")}_${submission.roll_number || "Roll"}_Graded.pdf`
          )}
          download={`${(submission.student_name || "Student").replace(/\s+/g, "_")}_${submission.roll_number || "Roll"}_Graded.pdf`}
          onClick={() => toast.info("Downloading annotated evaluation PDF...", { title: "PDF Export" })}
          className="inline-flex items-center gap-2 rounded-full bg-primary hover:bg-primary-active text-white px-4 py-2 text-xs font-semibold shadow-xs transition-all"
        >
          <Download className="h-3.5 w-3.5" />
          Export Annotated PDF (PyMuPDF)
        </a>
      </div>

      {/* Student Overview Banner (Notion FeatureCard) */}
      <FeatureCard className="p-6 border-hairline bg-surface">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink tracking-tight">
                {submission.student_name}
              </h1>
              <span className="font-mono text-xs font-semibold rounded-md bg-canvas-soft border border-hairline px-2 py-0.5 text-ink">
                {submission.roll_number}
              </span>
              {Boolean(submission.is_manual_override) && (
                <BadgePill label="Teacher Overridden" color="orange" />
              )}
            </div>
            <p className="text-xs text-ink-muted">
              Exam: <span className="text-ink font-semibold">{submission.exam?.title || "Physics 12th"}</span> • Total Scanned Pages: <span className="font-mono font-medium text-ink">{submission.page_count}</span>
            </p>
          </div>

          {/* Marks Summary Section */}
          <div className="flex flex-wrap items-center justify-start sm:justify-end gap-5 border-t md:border-t-0 md:border-l border-hairline pt-4 md:pt-0 md:pl-6">
            <div className="text-left sm:text-right">
              <span className="text-[11px] text-ink-muted block uppercase tracking-wider font-semibold">Total Awarded</span>
              <span className="font-mono text-2xl font-bold text-ink">
                {submission.total_awarded_marks != null ? submission.total_awarded_marks.toFixed(1) : "—"}
                <span className="text-xs text-ink-muted font-normal"> / {submission.max_marks || 25}</span>
              </span>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[11px] text-ink-muted block uppercase tracking-wider font-semibold">Percentage</span>
              <BadgePill label={`${pct.toFixed(1)}%`} color={scoreBadgeColor} className="text-sm px-3 py-1 font-mono font-bold mt-0.5" />
            </div>

            <div className="sm:pl-2">
              {submission.status === "NEEDS_REVIEW" || answers.some((a) => a.needs_review) ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 text-xs font-semibold">
                  <Flag className="h-3.5 w-3.5" />
                  Needs Review {answers.filter((a) => a.needs_review).length > 0 ? `(${answers.filter((a) => a.needs_review).length})` : ""}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-xs font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Completed
                </span>
              )}
            </div>
          </div>
        </div>
      </FeatureCard>

      {/* Main Workspace: Document Viewer + Right Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left: Document Viewer (3 cols) */}
        <div className="lg:col-span-3 h-[560px] sm:h-[680px] lg:h-[820px] rounded-lg overflow-hidden border border-hairline bg-surface shadow-xs">
          <DocumentViewer
            submissionId={submission.id}
            pageCount={submission.page_count}
            pdfUrl={(submission as any).pdf_url}
            answers={answers}
            onSelectAnswer={(ans) => handleSelectAnswer(ans, false)}
            onInspectAnswer={(ans) => handleSelectAnswer(ans, true)}
            selectedAnswerId={selectedAnswer?.id}
            editingAnswerId={editingAnswerId}
            onSetEditingAnswerId={setEditingAnswerId}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onUpdateRegion={handleUpdateRegion}
            totalAwardedMarks={submission.total_awarded_marks}
            maxMarks={submission.max_marks}
            isDocumentPurged={Boolean(submission.is_document_purged)}
          />
        </div>

        {/* Right Sidebar: Questions list & Missing Answers (1 col) */}
        <div className="space-y-4">
          {/* Question Index Navigator */}
          <FeatureCard className="p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-hairline">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                Detected Answers ({answers.length})
              </h3>
              <span className="text-[10px] text-primary font-medium">Click to inspect</span>
            </div>

            {/* Quick unflag callout if any answers have needs_review */}
            {answers.some((a) => a.needs_review) && (
              <div className="p-2.5 rounded-md border border-purple-200 bg-purple-50/80 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-purple-800 flex items-center gap-1.5">
                  <Flag className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                  <span>{answers.filter((a) => a.needs_review).length} question(s) flagged</span>
                </span>
                <button
                  type="button"
                  onClick={handleClearAllReviews}
                  disabled={isClearingReview}
                  className="text-[11px] font-bold text-purple-700 hover:text-purple-900 underline cursor-pointer disabled:opacity-50"
                >
                  {isClearingReview ? "Clearing..." : "Unflag All"}
                </button>
              </div>
            )}

            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              {answers.map((ans) => {
                const isSelected = selectedAnswer?.id === ans.id;
                const scoreColor =
                  ans.awarded_marks >= ans.max_marks
                    ? "text-emerald-600 bg-emerald-50 border-emerald-200"
                    : ans.awarded_marks > 0
                    ? "text-amber-600 bg-amber-50 border-amber-200"
                    : "text-rose-600 bg-rose-50 border-rose-200";

                return (
                  <button
                    key={ans.id}
                    onClick={() => handleSelectAnswer(ans, true)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-md border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-2xs"
                        : "border-hairline bg-surface hover:bg-canvas-soft hover:border-[#d0d0d0]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-ink">
                          {ans.question_id}
                        </span>
                        {Boolean(ans.needs_review) && (
                          <Flag className="h-3 w-3 text-purple-600" />
                        )}
                      </div>
                      <span className="text-[10px] text-ink-muted">Page {ans.page_number}</span>
                    </div>

                    <div className="font-mono text-xs font-bold">
                      <span className={`px-2 py-0.5 rounded-md border ${scoreColor}`}>
                        {ans.awarded_marks}
                        <span className="text-ink-muted font-normal">/{ans.max_marks}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </FeatureCard>

          {/* Missing Answers List */}
          {missingAnswers.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 space-y-2">
              <h4 className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                Unattempted / Missing ({missingAnswers.length})
              </h4>
              <p className="text-[11px] text-ink-muted leading-relaxed">
                Questions where the model could not detect a student handwriting region.
              </p>
              <div className="space-y-1.5 pt-1">
                {missingAnswers.map((mAns) => (
                  <div
                    key={mAns.id}
                    className="w-full flex items-center justify-between p-2 rounded-md bg-surface border border-red-200 hover:border-red-300 text-xs transition-colors gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectAnswer(mAns, true)}
                      className="flex-1 flex items-center justify-between text-left hover:underline cursor-pointer min-w-0"
                    >
                      <span className="font-mono font-bold text-red-700 truncate">{mAns.question_id}</span>
                      <span className="text-[10px] text-red-600 font-mono shrink-0 ml-2">0 / {mAns.max_marks}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAnswer(mAns);
                        setEditingAnswerId(mAns.id);
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary text-white hover:bg-primary-hover transition-colors shrink-0 cursor-pointer shadow-2xs"
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
      <GradingModal
        submission={submission}
        answer={selectedAnswer}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onUpdated={handleUpdated}
        onAdjustOnCanvas={(ans, pageNum) => {
          setIsModalOpen(false);
          setSelectedAnswer(ans);
          setEditingAnswerId(ans.id);
          if (pageNum && pageNum >= 1) setCurrentPage(pageNum);
        }}
      />
    </div>
  );
}
