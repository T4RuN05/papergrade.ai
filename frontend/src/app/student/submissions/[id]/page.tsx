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
} from "lucide-react";
import { api, getAuthToken } from "@/lib/api";
import { DocumentViewer } from "@/components/DocumentViewer";
import { StudentQuestionModal } from "@/components/StudentQuestionModal";
import { ButtonPrimary, ButtonUtility, FeatureCard, BadgePill, EvaluationViewerSkeleton } from "@/components/ui";
import { useToast } from "@/lib/ToastContext";
import { GradedAnswer, Submission } from "@/lib/types";

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
      router.push("/auth/login");
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
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto pb-16 px-2 sm:px-4 md:px-6">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-hairline">
        <Link
          href="/student/portal"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink transition-colors py-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Student Portal</span>
        </Link>

        {/* Download Graded PDF Button */}
        {!isPublished ? (
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center gap-2 rounded-lg sm:rounded-full bg-canvas-soft border border-hairline text-ink-muted px-3.5 py-2 text-xs font-semibold shadow-2xs opacity-60 cursor-not-allowed w-full sm:w-auto text-center"
            title="Graded PDF copy with annotations will become available once results are officially published by faculty."
          >
            <Clock className="h-3.5 w-3.5 text-ink-faint shrink-0" />
            <span>Graded PDF Pending Publication</span>
          </button>
        ) : isPurged ? (
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center gap-2 rounded-lg sm:rounded-full bg-canvas-soft border border-hairline text-ink-muted px-3.5 py-2 text-xs font-semibold shadow-2xs opacity-60 cursor-not-allowed w-full sm:w-auto text-center"
            title="Scanned PDF was permanently deleted after 15 days to preserve storage."
          >
            <AlertCircle className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <span>PDF Expired (15-Day Storage Retention)</span>
          </button>
        ) : (
          <a
            href={api.getAnnotatedPdfUrl(submission.id)}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              toast.info("Downloading official annotated PDF...", { title: "Graded Paper" })
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg sm:rounded-full bg-surface border border-hairline hover:bg-canvas-soft text-ink px-3.5 py-2 text-xs font-semibold shadow-2xs transition-all w-full sm:w-auto text-center"
          >
            <Download className="h-3.5 w-3.5 text-ink-muted shrink-0" />
            <span>Download Graded Answer Sheet</span>
            {submission.days_remaining !== undefined && submission.days_remaining !== null && (
              <span className="text-[10px] text-primary font-mono font-bold">
                ({submission.days_remaining}d left)
              </span>
            )}
          </a>
        )}
      </div>

      {/* 15-Day Storage Retention Notice Banner (Active only post-publication) */}
      {isPublished ? (
        isPurged ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-800 space-y-1">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Info className="h-4 w-4 text-slate-600 shrink-0" />
              <span>15-Day Storage Retention Policy: Scanned Document Purged</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              In accordance with the 15-day storage retention policy, the student's raw uploaded answer sheets, page scans, and visual bounding box overlays were permanently deleted on{" "}
              <strong>{submission.purged_at ? new Date(submission.purged_at).toLocaleDateString() : "schedule"}</strong> to preserve system storage. All verified question marks, totals, and faculty review decisions remain permanently archived in the official marks ledger below.
            </p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900">
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 text-amber-600 shrink-0 animate-pulse" />
              <div>
                <span className="font-bold">15-Day Storage Retention Active:</span> This graded answer sheet will be permanently deleted on{" "}
                <strong>{submission.retention_expires_at ? new Date(submission.retention_expires_at).toLocaleDateString() : "in 15 days"}</strong> ({submission.days_remaining !== undefined && submission.days_remaining !== null ? `${submission.days_remaining} days remaining` : "15 days"}).
                <span className="block text-[11px] text-amber-800 mt-0.5">Please download your graded copy now to maintain a personal archive. Revaluation appeals remain open for 7 days post-publication.</span>
              </div>
            </div>
            <a
              href={api.getAnnotatedPdfUrl(submission.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shrink-0 shadow-2xs transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Save Copy Now
            </a>
          </div>
        )
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900">
          <div className="flex items-center gap-2.5">
            <Info className="h-4 w-4 text-blue-600 shrink-0" />
            <div>
              <span className="font-bold">Evaluation in Progress:</span> Your submitted answer sheet has been securely registered and is being evaluated by academic examiners.
              <span className="block text-[11px] text-blue-800 mt-0.5">
                Question marks, detailed grading rubrics, and faculty feedback will be unlocked here once examination results are officially published.
              </span>
            </div>
          </div>
        </div>
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
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-hairline text-ink-muted uppercase font-semibold text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Question</th>
                    <th className="py-2.5 px-3">Awarded Marks</th>
                    <th className="py-2.5 px-3">Max Marks</th>
                    <th className="py-2.5 px-3">Score %</th>
                    <th className="py-2.5 px-3">Evaluation Rationale</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
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
                        <td className="py-3 px-3 font-bold text-ink flex items-center gap-1.5">
                          <span>{ans.question_id}</span>
                          {ans.is_manual_override && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 font-normal">
                              Override
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-ink">
                          {ansScore.toFixed(1)}
                        </td>
                        <td className="py-3 px-3 font-mono text-ink-muted">
                          {ansMax.toFixed(1)}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-block font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${
                            isFull
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : isZero
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {ansPct}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-ink-secondary max-w-xs truncate">
                          {ans.grading_rationale || "Evaluated against approved rubric."}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleSelectAnswer(ans, true)}
                            className="text-primary hover:underline font-semibold text-xs cursor-pointer"
                          >
                            Inspect Details →
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
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : ansScore > 0
                        ? "text-amber-700 bg-amber-50 border-amber-200"
                        : "text-rose-700 bg-rose-50 border-rose-200";

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
                              <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 font-normal">
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
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">
                            <Flag className="h-3 w-3 fill-current" />
                            <span>Revaluation Appeal Pending</span>
                          </div>
                        )}
                        {isResolved && reval.decision === "MARKS_REVISED" && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Marks Revised</span>
                          </div>
                        )}
                        {isResolved && reval.decision === "MARKS_UPHELD" && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
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
              <div className="rounded-lg border border-hairline bg-canvas-soft p-3 text-[11px] text-ink-muted space-y-1">
                <div className="font-semibold text-ink flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Human Revaluation Guarantee
                </div>
                <p>
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
    </div>
  );
}
