"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  RotateCcw,
  CheckCircle2,
  Clock,
  User,
  FileText,
  AlertCircle,
  RefreshCw,
  Eye,
  ShieldCheck,
  Flag,
  Check,
  Sliders,
  Download,
  Award,
  ChevronRight,
  Edit3,
} from "lucide-react";
import { api, getAuthToken } from "@/lib/api";
import { useTenant } from "@/lib/TenantContext";
import { useToast } from "@/lib/ToastContext";
import { DocumentViewer } from "@/components/DocumentViewer";
import { AdminRevaluationModal } from "@/components/AdminRevaluationModal";
import { ButtonPrimary, ButtonUtility, FeatureCard, BadgePill, RevaluationDeskSkeleton, EvaluationViewerSkeleton } from "@/components/ui";
import { GradedAnswer } from "@/lib/types";

export default function RevaluationDeskPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { selectedBranch, loading: tenantLoading } = useTenant();

  // Revaluation requests queue
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [loadingRequests, setLoadingRequests] = useState(true);

  // Active submission data loaded for DocumentViewer
  const [submission, setSubmission] = useState<any>(null);
  const [loadingSubmission, setLoadingSubmission] = useState(false);

  // PDF Viewer navigation & editing state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedAnswer, setSelectedAnswer] = useState<GradedAnswer | null>(null);
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);

  // Admin Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 1. Load Revaluation Requests
  const loadRequests = useCallback(async () => {
    if (tenantLoading && !selectedBranch?.id) return;

    setLoadingRequests(true);
    try {
      const data = await api.listRevaluations(undefined, selectedBranch?.id);
      const reqList = Array.isArray(data) ? data : [];
      setRequests(reqList);

      if (reqList.length > 0) {
        setSelectedReq((prev: any) => {
          const match = reqList.find((r: any) => r.id === prev?.id);
          return match || reqList[0];
        });
      } else {
        setSelectedReq(null);
        setSubmission(null);
      }
    } catch (err: any) {
      console.error("Failed to load revaluation requests:", err);
      setRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, [selectedBranch?.id, tenantLoading]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.push("/auth/login");
      return;
    }
    loadRequests();
  }, [loadRequests, router]);

  // 2. Load the full submission when a revaluation request is selected
  useEffect(() => {
    if (!selectedReq || !selectedReq.submission_id) return;

    let isMounted = true;
    setLoadingSubmission(true);

    api
      .getSubmission(selectedReq.submission_id)
      .then((data) => {
        if (!isMounted) return;
        setSubmission(data);
        if (data.answers && data.answers.length > 0) {
          // Find first answer that matches the request's question_ids if possible
          const reqQids: string[] =
            typeof selectedReq.question_ids_json === "string"
              ? JSON.parse(selectedReq.question_ids_json || "[]")
              : selectedReq.question_ids_json || [];

          const flaggedAns = data.answers.find((a: any) => reqQids.includes(a.question_id));
          const target = flaggedAns || data.answers[0];
          setSelectedAnswer(target);
          if (target.page_number) {
            setCurrentPage(target.page_number);
          }
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load submission for revaluation desk:", err);
        toast.error("Failed to load answer sheet details.", { title: "Load Error" });
      })
      .finally(() => {
        if (isMounted) setLoadingSubmission(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedReq?.id, selectedReq?.submission_id]);

  // Handle clicking on an answer (from viewer or sidebar)
  const handleSelectAnswer = (ans: GradedAnswer, openModal: boolean = false) => {
    // Resolve fresh state from current submission to prevent stale closure data
    const current = submission?.answers?.find((a: any) => a.id === ans.id) || ans;
    setSelectedAnswer(current);
    const targetPage = current.page_number || current.regions?.[0]?.page_number;
    if (targetPage && targetPage >= 1) {
      setCurrentPage(targetPage);
    }
    if (openModal) {
      setIsModalOpen(true);
    }
  };

  // Handle bounding box updates from DocumentViewer drag handles
  const handleUpdateRegion = async (
    regionId: string,
    coords: { x: number; y: number; width: number; height: number; page_number: number }
  ) => {
    if (!submission) return;
    try {
      const updatedSub = await api.editRegion(submission.id, regionId, {
        ...coords,
        reason: "Evaluator adjusted bounding box during revaluation review",
      });
      toast.success("Bounding box updated and student crop regenerated!", { title: "Region Saved" });

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
      setSubmission(nextSub);

      // Immediately synchronize selectedAnswer state so the review modal sees the new coordinates & crop
      if (selectedAnswer) {
        const freshSelected = patchedAnswers.find((a: any) => a.id === selectedAnswer.id);
        if (freshSelected) {
          setSelectedAnswer({
            ...freshSelected,
            _lastUpdated: timestamp,
          });
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update bounding box region.", {
        title: "Save Failed",
      });
    }
  };

  // Triggered from AdminRevaluationModal when examiner clicks "Adjust Box on Canvas"
  const handleStartAdjustBox = (answerId: string) => {
    const match = submission?.answers?.find((a: any) => a.id === answerId);
    if (match) {
      const targetPage = match.page_number || match.regions?.[0]?.page_number || 1;
      setCurrentPage(targetPage);
      setSelectedAnswer(match);
      setEditingAnswerId(answerId);
      toast.info(`Editing Question ${match.question_id}: Drag corners to resize or drag inside to move.`, {
        title: "Bounding Box Edit Mode",
        duration: 4000,
      });
    }
  };

  // Triggered when an appeal is finalized via AdminRevaluationModal
  const handleRevaluationResolved = async (
    requestId: string,
    decision: "MARKS_REVISED" | "MARKS_UPHELD",
    revisedMarks: number,
    notes: string
  ) => {
    // Refresh revaluations list and submission
    await loadRequests();
    if (selectedReq?.submission_id) {
      try {
        const freshSub = await api.getSubmission(selectedReq.submission_id);
        setSubmission(freshSub);
      } catch {
        // ignore
      }
    }
  };

  const answers: GradedAnswer[] = submission?.answers || [];

  // Parse questions targeted by the current reval request
  const currentReqQids: string[] = selectedReq
    ? typeof selectedReq.question_ids_json === "string"
      ? JSON.parse(selectedReq.question_ids_json || "[]")
      : selectedReq.question_ids_json || []
    : [];

  const pendingRequestsCount = requests.filter(
    (r) => r.status === "SUBMITTED" || r.status === "UNDER_REVIEW"
  ).length;

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 pb-16 px-2 sm:px-4 md:px-6">
      {/* 1. Header & Branch Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <BadgePill label="Academic Operations" color="purple" />
            {selectedBranch && (
              <span className="text-xs font-semibold text-ink-secondary bg-canvas-soft border border-hairline px-2 py-0.5 rounded-md whitespace-nowrap truncate max-w-[220px] sm:max-w-none">
                {selectedBranch.name} • {selectedBranch.city}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-md whitespace-nowrap shrink-0">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{pendingRequestsCount} Pending {pendingRequestsCount === 1 ? "Appeal" : "Appeals"}</span>
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink mt-1.5">
            Revaluation Desk (Interactive PDF Viewer)
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-0.5 leading-relaxed">
            Human-verified grievance review. Click flagged bounding boxes on the paper to inspect handwriting, adjust coordinates, and revise marks.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <ButtonUtility size="sm" onClick={loadRequests} className="w-full sm:w-auto justify-center">
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh Queue
          </ButtonUtility>
        </div>
      </div>

      {/* 2. Grievance Paper Queue Selector */}
      {requests.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ink-muted">
            <span>Student Submissions with Revaluation Appeals ({requests.length})</span>
            <span className="text-[11px] text-primary font-normal">Select a paper to review</span>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {requests.map((req) => {
              const isSelected = selectedReq?.id === req.id;
              const isResolved = req.status === "RESOLVED";

              return (
                <button
                  key={req.id}
                  onClick={() => setSelectedReq(req)}
                  className={`flex-shrink-0 flex items-center gap-3 p-3 rounded-lg border text-left transition-all cursor-pointer ${isSelected
                      ? "bg-surface border-primary shadow-xs ring-1 ring-primary/20"
                      : "bg-surface border-hairline hover:border-[#b0b0b0]"
                    }`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-canvas-soft border border-hairline text-ink shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 pr-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-ink truncate max-w-[130px]">
                        {req.student_name || "Student"}
                      </span>
                      <span className="font-mono text-[10px] font-semibold bg-canvas-soft border border-hairline px-1.5 py-0.2 rounded text-ink">
                        {req.roll_number}
                      </span>
                    </div>

                    <div className="text-[11px] text-ink-muted truncate max-w-[190px] mt-0.5">
                      {req.exam_title}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      {isResolved ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          Resolved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-700 bg-orange-50 px-1.5 py-0.2 rounded border border-orange-200">
                          <Flag className="h-3 w-3 fill-current" />
                          Appeal Pending
                        </span>
                      )}
                      <span className="text-[10px] text-ink-muted font-mono font-medium">
                        Score: {req.total_awarded_marks} / {req.max_marks}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Empty State or PDF Viewer Workspace */}
      {loadingRequests ? (
        <RevaluationDeskSkeleton />
      ) : requests.length === 0 ? (
        <FeatureCard className="p-16 text-center text-xs text-ink-muted space-y-3">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
          <h2 className="text-base font-bold text-ink">Zero Open Grievances</h2>
          <p className="max-w-md mx-auto text-ink-muted">
            No students in {selectedBranch?.name || "this branch"} currently have open revaluation requests. When a student challenges a score via the student portal, their answer sheet will appear here for PDF-first human review.
          </p>
        </FeatureCard>
      ) : loadingSubmission || !submission ? (
        <EvaluationViewerSkeleton />
      ) : (
        <div className="space-y-4">
          {/* Active Paper Banner */}
          <FeatureCard className="p-4 bg-surface border-hairline">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-ink">{submission.exam_title || "Examination"}</h2>
                    <span className="font-mono text-xs font-semibold bg-canvas-soft border border-hairline px-2 py-0.5 rounded text-ink">
                      Roll: {submission.roll_number}
                    </span>
                    <span className="text-xs text-ink-muted">• {submission.student_name}</span>
                  </div>
                  <p className="text-xs text-ink-muted mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span>Flagged questions display</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                      <Flag className="h-3 w-3 text-amber-700 fill-amber-700 shrink-0" />
                      <span>REVALUATION APPEAL</span>
                    </span>
                    <span>on the canvas. Click any question box to inspect, adjust boundaries, or resolve appeal.</span>
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <a
                  href={api.getAnnotatedPdfUrl(submission.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface text-ink hover:bg-canvas-soft px-3 py-1.5 text-xs font-semibold transition-colors shadow-2xs"
                >
                  <Download className="h-3.5 w-3.5 text-ink-muted" />
                  <span>Annotated PDF</span>
                </a>
              </div>
            </div>
          </FeatureCard>

          {/* Interactive Workspace: PDF Viewer (3 cols) + Flagged Questions Sidebar (1 col) */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 items-start">
            {/* Left: DocumentViewer with Revaluation Flags & Interactive Drag Handles (3 cols) */}
            <div className="lg:col-span-3 h-[380px] sm:h-[540px] md:h-[700px] lg:h-[840px] rounded-lg overflow-hidden border border-hairline bg-surface shadow-xs">
              <DocumentViewer
                submissionId={submission.id}
                pageCount={submission.page_count || 1}
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
                readOnly={false}
              />
            </div>

            {/* Right: Question Navigator with Revaluation Focus (1 col) */}
            <div className="space-y-4">
              <FeatureCard className="p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-hairline">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                    Questions Overview ({answers.length})
                  </h3>
                  <span className="text-[10px] text-primary font-medium">Click to review</span>
                </div>

                <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
                  {answers.map((ans) => {
                    const isSelected = selectedAnswer?.id === ans.id;
                    const isAnsResolved = Boolean(ans.revaluation && ans.revaluation.status === "RESOLVED");
                    const isFlagged = !isAnsResolved && Boolean(
                      currentReqQids.includes(ans.question_id) ||
                      (ans.revaluation &&
                        (ans.revaluation.status === "SUBMITTED" ||
                          ans.revaluation.status === "UNDER_REVIEW"))
                    );

                    const ansScore = Number(ans.awarded_marks || 0);
                    const ansMax = Number(ans.max_marks || 1);

                    return (
                      <div
                        key={ans.id}
                        onClick={() => handleSelectAnswer(ans, false)}
                        className={`p-3 rounded-lg border text-left transition-all cursor-pointer space-y-2 ${
                          isFlagged
                            ? "bg-amber-50/40 border-amber-300 ring-1 ring-amber-300/40"
                            : isAnsResolved
                              ? "bg-emerald-50/20 border-emerald-200"
                              : isSelected
                                ? "bg-surface border-primary shadow-xs ring-1 ring-primary/20"
                                : "bg-surface border-hairline hover:bg-canvas-soft"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-ink">
                            <span>{ans.question_id}</span>
                            {isAnsResolved ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <Check className="h-3 w-3 shrink-0" />
                                <span>RESOLVED</span>
                              </span>
                            ) : isFlagged ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                <Flag className="h-2.5 w-2.5 shrink-0 fill-amber-700" />
                                <span>APPEAL</span>
                              </span>
                            ) : null}
                          </div>

                          <span className="font-mono text-xs font-bold text-ink">
                            {ansScore.toFixed(1)} / {ansMax}m
                          </span>
                        </div>

                        {/* Student Grievance Snippet if Flagged */}
                        {isFlagged && selectedReq?.student_reason && (
                          <div className="text-[11px] text-amber-950 italic bg-white/80 p-2 rounded border border-amber-200 line-clamp-2">
                            &ldquo;{selectedReq.student_reason}&rdquo;
                          </div>
                        )}

                        {/* Action buttons inside card */}
                        <div className="flex items-center justify-between pt-1 border-t border-hairline/60 text-[11px]">
                          <span className="text-ink-muted">Page {ans.page_number || 1}</span>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectAnswer(ans, true);
                            }}
                            className="inline-flex items-center gap-1 text-primary hover:underline font-semibold text-xs cursor-pointer"
                          >
                            <Eye className="h-3 w-3" />
                            Open Modal & Review →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </FeatureCard>

              {/* Informational Callout */}
              <div className="rounded-lg border border-hairline bg-canvas-soft p-3.5 text-xs text-ink-secondary space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-ink text-xs">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span>Strict Human Evaluation Policy</span>
                </div>
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  Revaluations are human-verified by institutional policy. Automated AI modifications are strictly prohibited on student grievance appeals.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Admin Revaluation & Bounding Box Review Modal */}
      <AdminRevaluationModal
        submissionId={submission?.id || ""}
        answer={selectedAnswer}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        revaluationRequest={selectedReq}
        studentName={submission?.student_name}
        rollNumber={submission?.roll_number}
        examTitle={submission?.exam_title}
        onStartAdjustBox={handleStartAdjustBox}
        onResolved={handleRevaluationResolved}
      />
    </div>
  );
}
