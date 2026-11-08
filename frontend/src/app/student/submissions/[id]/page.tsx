"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  Info,
  AlertCircle,
  Archive,
  BookOpen,
} from "lucide-react";
import dynamic from "next/dynamic";
import { api, getAuthToken } from "@/lib/api";
import { StudentQuestionModal } from "@/components/StudentQuestionModal";
import { ArtifactViewerModal } from "@/components/ArtifactViewerModal";
import { ButtonPrimary, ButtonUtility, FeatureCard, BadgePill, EvaluationViewerSkeleton, StatusWell } from "@/components/ui";
import { useToast } from "@/lib/ToastContext";
import { GradedAnswer, Submission } from "@/lib/types";

const DocumentViewer = dynamic(
  () => import("@/components/DocumentViewer").then((mod) => mod.DocumentViewer),
  {
    ssr: false,
    loading: () => <EvaluationViewerSkeleton />,
  }
);

export default function StudentSubmissionViewerPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const submissionId = params.id as string;

  const [submission, setSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAnswer, setSelectedAnswer] = useState<GradedAnswer | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [artifactModalOpen, setArtifactModalOpen] = useState(false);

  const loadSubmission = async () => {
    try {
      const data = await api.getSubmission(submissionId);
      setSubmission(data);
      if (data.answers && data.answers.length > 0) {
        setSelectedAnswer(data.answers[0]);
      }
    } catch (err: any) {
      console.error("Failed to load student submission:", err);
      toast.error(err.message || "Failed to load examination answer sheet.", {
        title: "Load Error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.push(`/auth/login?role=student&redirect=/student/submissions/${submissionId}`);
      return;
    }
    loadSubmission();
  }, [submissionId, router]);

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
    setSubmission((prev: any) => {
      if (!prev) return prev;
      const updatedAnswers = (prev.answers || []).map((a: any) => {
        if (a.id === answerId) {
          return {
            ...a,
            revaluation: revalData,
          };
        }
        return a;
      });
      return {
        ...prev,
        answers: updatedAnswers,
      };
    });

    if (selectedAnswer && selectedAnswer.id === answerId) {
      setSelectedAnswer((prev: any) => ({
        ...prev,
        revaluation: revalData,
      }));
    }
  };

  if (loading) {
    return <EvaluationViewerSkeleton isStudent />;
  }

  if (!submission) {
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
          <div className="pt-2">
            <ButtonUtility href="/student/portal">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Return to Student Portal
            </ButtonUtility>
          </div>
        </FeatureCard>
      </div>
    );
  }

  const answers: GradedAnswer[] = submission.answers || [];
  const pct = Number(submission.percentage || 0);
  const scoreBadgeColor = pct >= 75 ? "green" : pct >= 60 ? "teal" : pct >= 40 ? "sky" : "orange";

  const totalScore = Number(submission.total_awarded_marks || 0).toFixed(1);
  const maxScore = submission.max_marks || submission.exam?.total_marks || 25;
  const isPurged = Boolean(submission.is_document_purged);
  const isPublished = Boolean(
    submission.is_published ||
    submission.publication_status === "PUBLISHED" ||
    submission.exam?.is_published === 1 ||
    submission.exam?.lifecycle_status === "PUBLISHED"
  );

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto pt-4 sm:pt-6 pb-16 px-3 sm:px-6 cascade-group">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
        <Link
          href="/student/portal"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover transition-colors py-1.5 px-2 -ml-2 rounded-lg hover:bg-canvas-soft w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Student Portal</span>
        </Link>

        {/* Actions Group: View QP/Answer Key & Download Graded PDF */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {isPublished && (submission.exam?.has_question_paper || submission.exam?.has_answer_key || submission.has_question_paper || submission.has_answer_key) && (
            <button
              type="button"
              onClick={() => setArtifactModalOpen(true)}
              className="h-9 px-3.5 rounded-md btn-glass-utility text-ink hover:text-ink font-semibold text-xs inline-flex items-center justify-center gap-2 shadow-2xs transition-all w-full sm:w-auto text-center cursor-pointer active:scale-[0.98]"
              title="View Question Paper and Official Answer Key"
            >
              <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Question Paper & Key</span>
            </button>
          )}

          {/* Download Graded PDF Button */}
          {!isPublished ? (
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
              className="h-9 px-3.5 rounded-md btn-glass-utility text-ink hover:text-ink font-semibold text-xs inline-flex items-center justify-center gap-2 shadow-2xs transition-all w-full sm:w-auto text-center cursor-pointer active:scale-[0.98]"
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
        </div>
      </div>

      {/* Storage Retention Notice Banner (Active only post-publication) */}
      {isPublished ? (
        isPurged ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-800 space-y-1">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Info className="h-4 w-4 text-slate-600 shrink-0" />
              <span>Storage Retention Policy: Scanned Document Purged</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              In accordance with storage retention policies, raw uploaded answer sheet files were purged on{" "}
              <strong>{submission.purged_at ? new Date(submission.purged_at).toLocaleDateString() : "schedule"}</strong>. All verified question marks, totals, and faculty review decisions remain permanently archived in the official marks ledger below.
            </p>
          </div>
        ) : (
          <StatusWell
            variant="amber"
            icon={<Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
            title={
              <>
                <span>Document Retention Active</span>
                <span className="font-mono text-[10px] text-ink-muted font-normal">
                  • {submission.days_remaining !== undefined && submission.days_remaining !== null ? `${submission.days_remaining}d remaining` : "15d remaining"}
                </span>
              </>
            }
            badge={
              <a
                href={api.getAnnotatedPdfUrl(submission.id)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md btn-glass-primary text-xs font-semibold shrink-0 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Save Copy Now</span>
              </a>
            }
          >
            This graded answer sheet is scheduled to expire on{" "}
            <strong className="text-ink font-semibold">
              {submission.retention_expires_at ? new Date(submission.retention_expires_at).toLocaleDateString() : "in 15 days"}
            </strong>. Download your personal copy before purge. Revaluation appeals remain open for 7 days post-publication.
          </StatusWell>
        )
      ) : (
        <StatusWell
          variant="blue"
          icon={<Info className="h-3.5 w-3.5 text-primary" />}
          title={
            <>
              <span>Evaluation in Progress</span>
              <span className="font-mono text-[10px] text-ink-muted font-normal">• MARKS_LOCKED</span>
            </>
          }
        >
          Your submitted answer sheet has been securely registered and is being evaluated by academic examiners. Question marks, detailed grading rubrics, and faculty feedback will be unlocked here once examination results are officially published.
        </StatusWell>
      )}

      {/* Student & Examination Banner */}
      <FeatureCard className="p-3.5 sm:p-6 border-hairline bg-surface">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-0.5 sm:space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="text-base sm:text-xl font-bold text-ink tracking-tight truncate max-w-[280px] sm:max-w-none">
                  {submission.exam?.title || submission.exam_title || "Examination Answer Sheet"}
                </h1>
                <span className="font-mono text-[11px] sm:text-xs font-semibold rounded-md bg-canvas-soft border border-hairline px-2 py-0.5 text-ink">
                  Roll: {submission.roll_number}
                </span>
                <span className="text-xs text-ink-muted hidden sm:inline">
                  • {submission.student_name}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
                {!isPublished
                  ? "Read-only preview of your registered answer script. Evaluated marks and rubrics will appear here once officially published."
                  : isPurged
                  ? "Archived question marks record. Scanned pages removed after 15 days to conserve storage."
                  : "Read-only paper viewer. Tap any question box on the canvas to inspect marks and request revaluation."}
              </p>
          </div>

          {/* Scores Overview Pill Cluster */}
          <div className="grid grid-cols-3 sm:flex items-center gap-2 sm:gap-3 border-t md:border-t-0 md:border-l border-hairline pt-3 md:pt-0 md:pl-6 shrink-0">
            {isPublished ? (
              <>
                <div>
                  <span className="text-[10px] text-ink-muted block uppercase tracking-wider font-semibold leading-none">
                    Marks
                  </span>
                  <span className="font-mono text-base sm:text-lg font-bold text-ink mt-0.5 block leading-tight">
                    {totalScore} <span className="text-[10px] sm:text-xs text-ink-muted font-normal">/ {maxScore}</span>
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
                          <span className={`inline-block font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${
                            isFull
                              ? "bg-[#edf5f0] text-[#1e613b] border-[#c8e2d2] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                              : isZero
                              ? "bg-[#fbf0f0] text-[#872323] border-[#ecd0d0] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#261212] dark:text-[#e87878] dark:border-[#491f1f] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                              : "bg-[#faf4ec] text-[#7a4e18] border-[#e8dac5] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                          }`}>
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
          <div className="lg:col-span-3 h-[380px] sm:h-[540px] md:h-[680px] lg:h-[820px] rounded-lg overflow-hidden border border-hairline bg-surface shadow-xs">
            <DocumentViewer
              submissionId={submission.id}
              pageCount={submission.page_count || 1}
              pdfUrl={(submission as any).pdf_url}
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
          </div>
        )}

        {/* Right Sidebar: Questions List & Revaluation Badges (1 col) */}
        <div className="space-y-4">
          {isPublished ? (
            <>
              <FeatureCard className="p-3.5 sm:p-4 space-y-2.5 sm:space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-hairline">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                    Questions ({answers.length})
                  </h3>
                  <span className="text-[10px] text-primary font-medium">Tap to inspect</span>
                </div>

                <div className="space-y-1.5 max-h-[580px] overflow-y-auto pr-1">
                  {answers.map((ans) => {
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
                            : "border-hairline bg-surface hover:bg-canvas-soft"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-ink">
                            <span>{ans.question_id}</span>
                            {ans.is_manual_override && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#edf5f0] text-[#1e613b] border border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] font-normal">
                                Override
                              </span>
                            )}
                          </div>

                          <span
                            className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${scoreColor}`}
                          >
                            {ansScore.toFixed(1)} / {ansMax}m
                          </span>
                        </div>

                        {/* Revaluation Flag on Card */}
                        {hasPendingReval && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-[#7a4e18] bg-[#faf4ec] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] px-1.5 py-0.5 rounded">
                            <Flag className="h-3 w-3 fill-current" />
                            <span>Revaluation Appeal Pending</span>
                          </div>
                        )}
                        {isResolved && reval.decision === "MARKS_REVISED" && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-[#1e613b] bg-[#edf5f0] border border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] px-1.5 py-0.5 rounded">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Marks Revised</span>
                          </div>
                        )}
                        {isResolved && reval.decision === "MARKS_UPHELD" && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-[#4d4a46] bg-[#f1f0ee] border border-[#dedcd8] dark:bg-[#1e1e1e] dark:text-[#a8a6a2] dark:border-[#2f2f2f] px-1.5 py-0.5 rounded">
                            <ShieldCheck className="h-3 w-3" />
                            <span>Marks Upheld</span>
                          </div>
                        )}

                        <div className="text-[10px] text-ink-muted mt-1 flex items-center justify-between">
                          <span>Page {ans.page_number || 1}</span>
                          <span className="text-primary hover:underline">Inspect →</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </FeatureCard>

              {/* Quick Info Box */}
              <div className="rounded-lg border border-hairline bg-surface p-3 text-[11px] text-ink-muted space-y-1 relative overflow-hidden shadow-2xs">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500/80 dark:bg-blue-400/70" />
                <div className="font-semibold text-ink flex items-center gap-1.5 pl-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <span>Human Revaluation Guarantee</span>
                </div>
                <p className="pl-1 leading-relaxed">
                  Under faculty policy, student grievance appeals are manually reviewed by human senior examiners. Automated AI regrading is strictly forbidden.
                </p>
              </div>
            </>
          ) : (
            <FeatureCard className="p-3.5 sm:p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-hairline">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                  Examination Status
                </h3>
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-semibold border border-amber-200">
                  <Clock className="h-3 w-3 animate-pulse" />
                  In Progress
                </span>
              </div>

              <div className="space-y-2.5 text-xs text-ink-secondary py-1">
                <div className="p-2.5 rounded-md bg-canvas-soft border border-hairline space-y-1">
                  <span className="font-semibold text-ink block text-[11px]">Evaluation in Progress</span>
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    Your answer sheet has been recorded and is currently undergoing academic grading.
                  </p>
                </div>

                <div className="p-2.5 rounded-md bg-canvas-soft border border-hairline space-y-1">
                  <span className="font-semibold text-ink block text-[11px]">Marks & Question Rubrics</span>
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    Question-by-question marks, detailed rubric remarks, and evaluator comments will unlock here once official results are published.
                  </p>
                </div>

                <div className="p-2.5 rounded-md bg-canvas-soft border border-hairline space-y-1">
                  <span className="font-semibold text-ink block text-[11px]">Revaluation Appeals</span>
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    A 7-day revaluation appeal window will open immediately upon results publication.
                  </p>
                </div>
              </div>
            </FeatureCard>
          )}
        </div>
      </div>

      {/* Redesigned Student Question Modal with Revaluation Submission */}
      <StudentQuestionModal
        submissionId={submission.id}
        answer={selectedAnswer}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onRevaluationSubmitted={handleRevaluationSubmitted}
      />

      {/* Official Question Paper & Answer Key Modal */}
      {submission && (
        <ArtifactViewerModal
          isOpen={artifactModalOpen}
          onClose={() => setArtifactModalOpen(false)}
          examId={submission.exam_id || submission.exam?.id}
          examTitle={submission.exam?.title || submission.exam_title || "Examination Paper"}
          examSubject={submission.exam?.subject || submission.exam_subject}
          initialArtifact="question-paper"
          hasQuestionPaper={submission.exam?.has_question_paper ?? true}
          hasAnswerKey={submission.exam?.has_answer_key ?? true}
          isExamDocumentPurged={submission.exam?.is_document_purged ?? false}
        />
      )}
    </div>
  );
}
