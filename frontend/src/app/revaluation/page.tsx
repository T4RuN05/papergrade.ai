"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  RotateCcw,
  CheckCircle2,
  Clock,
  User,
  Users,
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
import dynamic from "next/dynamic";
import { api, getAuthToken } from "@/lib/api";
import { useTenant } from "@/lib/TenantContext";
import { useToast } from "@/lib/ToastContext";
import { AdminRevaluationModal } from "@/components/AdminRevaluationModal";
import { ButtonPrimary, ButtonUtility, FeatureCard, BadgePill, RevaluationDeskSkeleton, EvaluationViewerSkeleton } from "@/components/ui";
import { GradedAnswer } from "@/lib/types";

const DocumentViewer = dynamic(
  () => import("@/components/DocumentViewer").then((mod) => mod.DocumentViewer),
  {
    ssr: false,
    loading: () => <EvaluationViewerSkeleton />,
  }
);

interface StudentPaperGroup {
  submission_id: string;
  student_id: string;
  student_name: string;
  roll_number: string;
  exam_id: string;
  exam_title: string;
  total_awarded_marks: number;
  max_marks: number;
  requests: any[];
  pendingCount: number;
  resolvedCount: number;
  hasPending: boolean;
  allResolved: boolean;
  allChallengedQids: string[];
  latestRequestedAt: string;
}

function parseQuestionIds(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default function RevaluationDeskPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { selectedBranch, loading: tenantLoading } = useTenant();

  // Raw revaluation requests queue
  const [requests, setRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  // Active selection state
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);

  // Active submission data loaded for DocumentViewer
  const [submission, setSubmission] = useState<any>(null);
  const [loadingSubmission, setLoadingSubmission] = useState(false);

  // PDF Viewer navigation & editing state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedAnswer, setSelectedAnswer] = useState<GradedAnswer | null>(null);
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);

  // Admin Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 1. Group revaluation requests by student paper (submission_id)
  const studentGroups = useMemo<StudentPaperGroup[]>(() => {
    if (!requests || requests.length === 0) return [];

    const map = new Map<string, StudentPaperGroup>();

    for (const req of requests) {
      const subId = req.submission_id || req.id;
      const qids = parseQuestionIds(req.question_ids_json);
      const isPending = req.status === "SUBMITTED" || req.status === "UNDER_REVIEW";
      const isResolved = req.status === "RESOLVED";

      if (!map.has(subId)) {
        map.set(subId, {
          submission_id: subId,
          student_id: req.student_id,
          student_name: req.student_name || "Student",
          roll_number: req.roll_number || "",
          exam_id: req.exam_id,
          exam_title: req.exam_title || "Exam Paper",
          total_awarded_marks: Number(req.total_awarded_marks || 0),
          max_marks: Number(req.max_marks || 1),
          requests: [req],
          pendingCount: isPending ? 1 : 0,
          resolvedCount: isResolved ? 1 : 0,
          hasPending: isPending,
          allResolved: isResolved,
          allChallengedQids: [...qids],
          latestRequestedAt: req.requested_at || req.created_at || "",
        });
      } else {
        const existing = map.get(subId)!;
        existing.requests.push(req);
        if (isPending) existing.pendingCount += 1;
        if (isResolved) existing.resolvedCount += 1;
        existing.hasPending = existing.pendingCount > 0;
        existing.allResolved = existing.pendingCount === 0 && existing.resolvedCount > 0;

        for (const qid of qids) {
          if (!existing.allChallengedQids.includes(qid)) {
            existing.allChallengedQids.push(qid);
          }
        }

        if (req.total_awarded_marks !== undefined) {
          existing.total_awarded_marks = Number(req.total_awarded_marks);
        }
        if (req.max_marks !== undefined) {
          existing.max_marks = Number(req.max_marks);
        }

        if (req.requested_at && req.requested_at > existing.latestRequestedAt) {
          existing.latestRequestedAt = req.requested_at;
        }
      }
    }

    // Sort: papers with pending appeals first, then recent
    return Array.from(map.values()).sort((a, b) => {
      if (a.hasPending && !b.hasPending) return -1;
      if (!a.hasPending && b.hasPending) return 1;
      return (b.latestRequestedAt || "").localeCompare(a.latestRequestedAt || "");
    });
  }, [requests]);

  // Derived selected student paper group
  const selectedGroup = useMemo(() => {
    if (!studentGroups.length) return null;
    if (selectedSubmissionId) {
      const found = studentGroups.find((g) => g.submission_id === selectedSubmissionId);
      if (found) return found;
    }
    return studentGroups[0] || null;
  }, [studentGroups, selectedSubmissionId]);

  // Derived active request inside the selected group
  const selectedReq = useMemo(() => {
    if (!selectedGroup || !selectedGroup.requests.length) return null;
    if (selectedReqId) {
      const found = selectedGroup.requests.find((r) => r.id === selectedReqId);
      if (found) return found;
    }
    // Default to first pending appeal or first appeal
    const pending = selectedGroup.requests.find(
      (r) => r.status === "SUBMITTED" || r.status === "UNDER_REVIEW"
    );
    return pending || selectedGroup.requests[0];
  }, [selectedGroup, selectedReqId]);

  // 2. Load Revaluation Requests from API
  const loadRequests = useCallback(async () => {
    if (tenantLoading && !selectedBranch?.id) return;

    setLoadingRequests(true);
    try {
      const data = await api.listRevaluations(undefined, selectedBranch?.id);
      const reqList = Array.isArray(data) ? data : [];
      setRequests(reqList);

      setSelectedSubmissionId((prev) => {
        if (prev && reqList.some((r: any) => r.submission_id === prev)) {
          return prev;
        }
        return reqList[0]?.submission_id || null;
      });
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
      router.push("/auth/login?role=staff&redirect=/revaluation");
      return;
    }
    loadRequests();
  }, [loadRequests, router]);

  // 3. Load the full submission when selected student paper changes
  useEffect(() => {
    if (!selectedGroup?.submission_id) {
      setSubmission(null);
      return;
    }

    let isMounted = true;
    setLoadingSubmission(true);

    api
      .getSubmission(selectedGroup.submission_id)
      .then((data) => {
        if (!isMounted) return;
        setSubmission(data);
        if (data.answers && data.answers.length > 0) {
          // Find first answer that matches the selected request or any challenged question
          const activeQids = parseQuestionIds(selectedReq?.question_ids_json);
          const allQids = selectedGroup.allChallengedQids;
          const flaggedAns =
            data.answers.find((a: any) => activeQids.includes(a.question_id)) ||
            data.answers.find((a: any) => allQids.includes(a.question_id));
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
  }, [selectedGroup?.submission_id]);

  // Handle clicking on an answer (from viewer or sidebar)
  const handleSelectAnswer = (ans: GradedAnswer, openModal: boolean = false) => {
    const current = submission?.answers?.find((a: any) => a.id === ans.id) || ans;
    setSelectedAnswer(current);
    const targetPage = current.page_number || current.regions?.[0]?.page_number;
    if (targetPage && targetPage >= 1) {
      setCurrentPage(targetPage);
    }
    if (openModal) {
      // Align active request to the one targeting this question if available
      const matchingReq = selectedGroup?.requests.find((r) =>
        parseQuestionIds(r.question_ids_json).includes(current.question_id)
      );
      if (matchingReq) {
        setSelectedReqId(matchingReq.id);
      }
      setIsModalOpen(true);
    }
  };

  // Switch request tab inside current student's paper
  const handleSelectRequestInGroup = (req: any) => {
    setSelectedReqId(req.id);
    const qids = parseQuestionIds(req.question_ids_json);
    if (submission?.answers) {
      const match = submission.answers.find((a: any) => qids.includes(a.question_id));
      if (match) {
        handleSelectAnswer(match, false);
      }
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
    await loadRequests();
    if (selectedGroup?.submission_id) {
      try {
        const freshSub = await api.getSubmission(selectedGroup.submission_id);
        setSubmission(freshSub);
      } catch {
        // ignore
      }
    }
  };

  // Enrich answers so any question challenged across ANY request by this student is identified
  const answers: GradedAnswer[] = useMemo(() => {
    if (!submission?.answers) return [];
    return submission.answers.map((ans: any) => {
      let reval = ans.revaluation;
      if (!reval && selectedGroup) {
        const matchReq = selectedGroup.requests.find((r) => {
          const qids = parseQuestionIds(r.question_ids_json);
          return qids.includes(ans.question_id);
        });
        if (matchReq) {
          reval = {
            id: matchReq.id,
            status: matchReq.status,
            decision: matchReq.decision,
            student_reason: matchReq.student_reason,
            reviewer_notes: matchReq.reviewer_notes,
            requested_at: matchReq.requested_at,
            resolved_at: matchReq.resolved_at,
          };
        }
      }
      return reval ? { ...ans, revaluation: reval } : ans;
    });
  }, [submission?.answers, selectedGroup]);

  // Overall pending count
  const pendingRequestsCount = requests.filter(
    (r) => r.status === "SUBMITTED" || r.status === "UNDER_REVIEW"
  ).length;

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 pb-16 px-2 sm:px-4 md:px-6 cascade-group">
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

      {/* 2. Student Paper Queue Selector (Grouped per Student Submission) */}
      {studentGroups.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-ink-muted">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span>Student Papers with Appeals ({studentGroups.length})</span>
              <span className="text-[11px] font-normal text-ink-faint">
                • {requests.length} total request{requests.length === 1 ? "" : "s"}
              </span>
            </div>
            <span className="text-[11px] text-primary font-normal">Select a student paper to review</span>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-2 pt-1 scrollbar-none">
            {studentGroups.map((group) => {
              const isSelected = selectedGroup?.submission_id === group.submission_id;

              return (
                <div
                  key={group.submission_id}
                  onClick={() => {
                    setSelectedSubmissionId(group.submission_id);
                    const pending = group.requests.find(
                      (r) => r.status === "SUBMITTED" || r.status === "UNDER_REVIEW"
                    );
                    setSelectedReqId((pending || group.requests[0])?.id || null);
                  }}
                  className={`flex-shrink-0 flex flex-col gap-2 p-3 sm:p-3.5 rounded-xl border text-left transition-all cursor-pointer min-w-[270px] sm:min-w-[310px] max-w-[340px] ${
                    isSelected
                      ? "bg-surface border-primary shadow-xs ring-2 ring-primary/25"
                      : "bg-surface border-hairline hover:border-slate-400 hover:shadow-2xs"
                  }`}
                >
                  {/* Top row: Student Name, Roll Number, and Score */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg border shrink-0 ${
                        group.hasPending 
                          ? "bg-amber-50 text-amber-700 border-amber-200" 
                          : "bg-canvas-soft text-ink border-hairline"
                      }`}>
                        <User className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-ink truncate max-w-[130px]">
                            {group.student_name}
                          </span>
                          <span className="font-mono text-[10px] font-semibold bg-canvas-soft border border-hairline px-1.5 py-0.2 rounded text-ink shrink-0">
                            {group.roll_number}
                          </span>
                        </div>
                        <div className="text-[11px] text-ink-muted truncate max-w-[170px] mt-0.5">
                          {group.exam_title}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[11px] font-mono font-bold text-ink block">
                        {group.total_awarded_marks} / {group.max_marks}m
                      </span>
                      <span className="text-[9px] text-ink-faint uppercase font-medium">Score</span>
                    </div>
                  </div>

                  {/* Middle: Appeals Breakdown & Requests inside this Student Card */}
                  <div className="pt-2 border-t border-hairline/70 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <span className="font-semibold text-ink-secondary flex items-center gap-1">
                        <FileText className="h-3 w-3 text-ink-muted" />
                        <span>{group.requests.length} {group.requests.length === 1 ? "Appeal Request" : "Appeals Filed"}</span>
                      </span>

                      {group.hasPending ? (
                        <span className="inline-flex items-center gap-1 font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                          <Clock className="h-2.5 w-2.5 shrink-0" />
                          <span>{group.pendingCount} Pending</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                          <span>Resolved</span>
                        </span>
                      )}
                    </div>

                    {/* Chips for individual requests filed by this student */}
                    <div className="flex flex-wrap gap-1 items-center">
                      {group.requests.map((r, idx) => {
                        const rPending = r.status === "SUBMITTED" || r.status === "UNDER_REVIEW";
                        const rQids = parseQuestionIds(r.question_ids_json);
                        const isThisReqActive = isSelected && selectedReq?.id === r.id;

                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSubmissionId(group.submission_id);
                              handleSelectRequestInGroup(r);
                            }}
                            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                              isThisReqActive
                                ? "bg-primary text-white border-primary font-bold shadow-2xs"
                                : rPending
                                ? "bg-amber-50 text-amber-900 border-amber-300 font-medium hover:bg-amber-100"
                                : "bg-canvas-soft text-ink-muted border-hairline hover:bg-white"
                            }`}
                            title={r.student_reason ? `Reason: "${r.student_reason}"` : undefined}
                          >
                            <span>Req #{idx + 1}:</span>
                            <span className="font-semibold">
                              {rQids.length > 0 ? rQids.join(", ") : "Paper"}
                            </span>
                            {rPending ? (
                              <span className={`inline-block h-1.5 w-1.5 rounded-full ${isThisReqActive ? "bg-white" : "bg-amber-500 animate-pulse"}`} />
                            ) : (
                              <Check className={`h-2.5 w-2.5 ${isThisReqActive ? "text-white" : "text-emerald-600"}`} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Empty State or PDF Viewer Workspace */}
      {loadingRequests ? (
        <RevaluationDeskSkeleton />
      ) : studentGroups.length === 0 ? (
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
        <div className="space-y-4 cascade-group">
          {/* Active Paper Banner with Multi-Request Tabs */}
          <FeatureCard className="p-4 bg-surface border-hairline space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-bold text-ink">{submission.exam_title || "Examination"}</h2>
                    <span className="font-mono text-xs font-semibold bg-canvas-soft border border-hairline px-2 py-0.5 rounded text-ink">
                      Roll: {submission.roll_number}
                    </span>
                    <span className="text-xs text-ink-muted">• {submission.student_name}</span>
                    <span className="text-xs font-mono font-semibold text-primary bg-primary/5 border border-primary/20 px-2 py-0.5 rounded">
                      Total Score: {submission.total_awarded_marks} / {submission.max_marks}
                    </span>
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
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
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

            {/* Multi-Request Switcher Bar when selectedGroup has multiple requests */}
            {selectedGroup && selectedGroup.requests.length > 0 && (
              <div className="pt-2 border-t border-hairline flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-ink-secondary shrink-0">
                    Student Appeals ({selectedGroup.requests.length}):
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {selectedGroup.requests.map((r, i) => {
                      const isAct = selectedReq?.id === r.id;
                      const isPen = r.status === "SUBMITTED" || r.status === "UNDER_REVIEW";
                      const qids = parseQuestionIds(r.question_ids_json);

                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleSelectRequestInGroup(r)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer border ${
                            isAct
                              ? "bg-primary text-white border-primary shadow-2xs"
                              : "bg-surface text-ink border-hairline hover:bg-canvas-soft"
                          }`}
                        >
                          <span>Appeal #{i + 1} ({qids.length > 0 ? qids.join(", ") : "Paper"})</span>
                          {isPen ? (
                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded ${
                              isAct ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
                            }`}>
                              <Clock className="h-2.5 w-2.5" />
                              Pending
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded ${
                              isAct ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                            }`}>
                              <Check className="h-2.5 w-2.5" />
                              Resolved
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Active Request Student Justification preview */}
                {selectedReq?.student_reason && (
                  <div className="text-xs text-amber-950 bg-amber-50/80 border border-amber-200/80 px-2.5 py-1 rounded-md flex items-center gap-1.5 max-w-full md:max-w-md truncate">
                    <span className="font-bold shrink-0">Reason:</span>
                    <span className="italic truncate">&ldquo;{selectedReq.student_reason}&rdquo;</span>
                  </div>
                )}
              </div>
            )}
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
                isDocumentPurged={Boolean(submission.is_document_purged)}
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

                    // Check which request this question belongs to in this student's paper
                    const matchedReq = selectedGroup?.requests.find((r) =>
                      parseQuestionIds(r.question_ids_json).includes(ans.question_id)
                    );
                    const matchedReqIdx = matchedReq && selectedGroup ? selectedGroup.requests.indexOf(matchedReq) + 1 : null;
                    const isFlagged = !isAnsResolved && Boolean(
                      matchedReq ||
                      selectedGroup?.allChallengedQids.includes(ans.question_id) ||
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
                          <div className="flex items-center gap-1.5 font-bold text-xs text-ink flex-wrap">
                            <span>{ans.question_id}</span>
                            {matchedReqIdx && (
                              <span className="text-[10px] font-semibold text-ink-secondary bg-canvas-soft border border-hairline px-1.5 py-0.2 rounded">
                                Appeal #{matchedReqIdx}
                              </span>
                            )}
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

                        {/* Student Grievance Snippet specific to this question's request */}
                        {isFlagged && (matchedReq?.student_reason || selectedReq?.student_reason) && (
                          <div className="text-[11px] text-amber-950 italic bg-white/80 p-2 rounded border border-amber-200 line-clamp-2">
                            &ldquo;{matchedReq?.student_reason || selectedReq?.student_reason}&rdquo;
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
        revaluationRequest={
          selectedGroup?.requests.find((r: any) => {
            const qids = parseQuestionIds(r.question_ids_json);
            return selectedAnswer && qids.includes(selectedAnswer.question_id);
          }) || selectedReq
        }
        studentName={submission?.student_name}
        rollNumber={submission?.roll_number}
        examTitle={submission?.exam_title}
        onStartAdjustBox={handleStartAdjustBox}
        onResolved={handleRevaluationResolved}
      />
    </div>
  );
}
