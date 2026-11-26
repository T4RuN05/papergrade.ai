"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  RotateCcw,
  CheckCircle2,
  User,
  Users,
  FileText,
  RefreshCw,
  Eye,
  Check,
  Download,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { api, getAuthToken } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useRevaluationsList, useSubmissionDetail } from "@/lib/queries";
import { useTenant } from "@/lib/TenantContext";
import { useToast } from "@/lib/ToastContext";

const AdminRevaluationModal = dynamic(
  () => import("@/components/AdminRevaluationModal").then((mod) => mod.AdminRevaluationModal),
  { ssr: false }
);
import {
  MetricValue,
  RefetchProgressLine,
  Skeleton,
  EvaluationViewerSkeleton,
} from "@/components/ui";
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedBranch, loading: tenantLoading } = useTenant();

  // Guard: token check
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      window.location.replace("/auth/login?role=staff&redirect=/revaluation");
    }
  }, []);

  // TanStack Query: SWR cached revaluations list
  const {
    data: revaluationsData,
    isLoading: loadingRequests,
    isFetching: isFetchingRequests,
    refetch: refetchRequests,
  } = useRevaluationsList(undefined, selectedBranch?.id);

  const requests = useMemo(() => {
    return Array.isArray(revaluationsData) ? revaluationsData : [];
  }, [revaluationsData]);

  // Active selection state
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);

  // Group revaluation requests by student paper (submission_id)
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
    const pending = selectedGroup.requests.find(
      (r) => r.status === "SUBMITTED" || r.status === "UNDER_REVIEW"
    );
    return pending || selectedGroup.requests[0];
  }, [selectedGroup, selectedReqId]);

  // TanStack Query: SWR submission detail
  const activeSubId = selectedGroup?.submission_id || "";
  const {
    data: fetchedSubmission,
    isLoading: loadingSubmission,
    isFetching: isFetchingSubmission,
  } = useSubmissionDetail(activeSubId);

  // Local state overlay for manual edits/region adjustments
  const [localSubmission, setLocalSubmission] = useState<any>(null);

  useEffect(() => {
    setLocalSubmission(null);
    setSelectedAnswer(null);
    setEditingAnswerId(null);
  }, [activeSubId]);

  const submission = useMemo(() => {
    if (localSubmission && localSubmission.id === activeSubId) {
      return localSubmission;
    }
    return fetchedSubmission || null;
  }, [localSubmission, fetchedSubmission, activeSubId]);

  // PDF Viewer navigation & editing state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedAnswer, setSelectedAnswer] = useState<GradedAnswer | null>(null);
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);

  // Admin Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Auto-align selected answer when submission changes
  useEffect(() => {
    if (submission?.answers && submission.answers.length > 0) {
      const activeQids = parseQuestionIds(selectedReq?.question_ids_json);
      const allQids = selectedGroup?.allChallengedQids || [];
      const flaggedAns =
        submission.answers.find((a: any) => activeQids.includes(a.question_id)) ||
        submission.answers.find((a: any) => allQids.includes(a.question_id));
      const target = flaggedAns || submission.answers[0];
      setSelectedAnswer(target);
      if (target?.page_number) {
        setCurrentPage(target.page_number);
      }
    }
  }, [
    submission?.id,
    submission?.answers,
    selectedReq?.id,
    selectedReq?.question_ids_json,
    selectedGroup?.submission_id,
    selectedGroup?.allChallengedQids,
  ]);

  // Handle clicking on an answer (from viewer or sidebar)
  const handleSelectAnswer = (ans: GradedAnswer, openModal: boolean = false) => {
    const current = submission?.answers?.find((a: any) => a.id === ans.id) || ans;
    setSelectedAnswer(current);
    const targetPage = current.page_number || current.regions?.[0]?.page_number;
    if (targetPage && targetPage >= 1) {
      setCurrentPage(targetPage);
    }
    if (openModal) {
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
        const hasRegion = (ans.regions || []).some(
          (reg: any) => reg.id === regionId || (!reg.id && ans.id === regionId)
        );
        if (hasRegion || ans.id === regionId) {
          const updatedRegions = (ans.regions || []).map((reg: any) => {
            if (reg.id === regionId || (!reg.id && ans.id === regionId)) {
              return { ...reg, ...coords, _lastUpdated: timestamp };
            }
            return reg;
          });
          return {
            ...ans,
            regions:
              updatedRegions.length > 0
                ? updatedRegions
                : [{ id: regionId, ...coords, _lastUpdated: timestamp }],
            page_number: coords.page_number,
            _lastUpdated: timestamp,
          };
        }
        return ans;
      });

      const nextSub = { ...baseSub, answers: patchedAnswers };
      setLocalSubmission(nextSub);

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
    await queryClient.invalidateQueries({ queryKey: queryKeys.revaluations.all() });
    await queryClient.invalidateQueries({ queryKey: queryKeys.submissions.all() });
    if (selectedGroup?.submission_id) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.submissions.detail(selectedGroup.submission_id),
      });
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
  const pendingRequestsCount = useMemo(() => {
    return requests.filter(
      (r) => r.status === "SUBMITTED" || r.status === "UNDER_REVIEW"
    ).length;
  }, [requests]);

  const isInitialDeskLoading = loadingRequests && requests.length === 0;
  const isSubmissionContentLoading = loadingSubmission && !submission;

  return (
    <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 pb-16 cascade-group relative">
      {/* Background Refetch Activity Indicator */}
      <RefetchProgressLine isFetching={isFetchingRequests || isFetchingSubmission} />

      {/* 1. Header & Branch Info — Permanently Mounted (CLS = 0.00) */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 pb-4 border-b border-hairline">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="notion-eyebrow text-ink-muted">Academic Operations</span>
            {selectedBranch && (
              <>
                <span className="text-ink-faint text-xs">•</span>
                <span className="text-xs font-medium text-ink-secondary bg-surface border border-hairline px-2 py-0.5 rounded-xs whitespace-nowrap truncate max-w-[200px] sm:max-w-none">
                  {selectedBranch.name} • {selectedBranch.city}
                </span>
              </>
            )}
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary bg-surface border border-hairline px-2 py-0.5 rounded-xs whitespace-nowrap shrink-0">
              <span className="h-2 w-2 rounded-full bg-[#dd5b00] shrink-0" />
              <MetricValue
                value={pendingRequestsCount}
                isLoading={isInitialDeskLoading}
                width="w-4"
                className="text-xs font-semibold text-ink tabular-nums"
              />
              <span>Pending {pendingRequestsCount === 1 ? "Appeal" : "Appeals"}</span>
            </span>
          </div>

          <h1 className="notion-heading-2 text-2xl sm:text-[26px] text-ink mt-1.5">
            Revaluation Desk
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-1 leading-relaxed">
            Human-verified grievance review. Click flagged bounding boxes on the paper to inspect handwriting, adjust coordinates, and revise marks.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={() => {
              refetchRequests();
              if (activeSubId) {
                queryClient.invalidateQueries({
                  queryKey: queryKeys.submissions.detail(activeSubId),
                });
              }
            }}
            className="notion-btn-utility w-full sm:w-auto"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetchingRequests ? "animate-spin" : ""}`} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {/* 2. Student Paper Queue Carousel — Permanently Mounted (CLS = 0.00) */}
      {(isInitialDeskLoading || studentGroups.length > 0) && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary shrink-0" />
              <h2 className="notion-section-title text-sm sm:text-base text-ink">
                Student Papers with Appeals
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface border border-hairline text-ink-muted tabular-nums">
                {studentGroups.length}
              </span>
              <span className="text-xs text-ink-muted hidden sm:inline">
                • {requests.length} total request{requests.length === 1 ? "" : "s"}
              </span>
            </div>
            <span className="text-xs text-primary font-medium">Select a paper to review</span>
          </div>

          <div className="flex items-stretch gap-3 overflow-x-auto pb-2 pt-1 sleek-scrollbar">
            {isInitialDeskLoading ? (
              [1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="notion-card flex-shrink-0 flex flex-col gap-2.5 p-3.5 min-w-[270px] sm:min-w-[300px] max-w-[330px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Skeleton className="h-9 w-9 rounded-md" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-24 rounded-xs" />
                        <Skeleton className="h-3 w-32 rounded-xs" />
                      </div>
                    </div>
                    <Skeleton className="h-4 w-12 rounded-xs" />
                  </div>
                  <div className="pt-2 border-t border-hairline flex justify-between">
                    <Skeleton className="h-3 w-20 rounded-xs" />
                    <Skeleton className="h-3 w-16 rounded-xs" />
                  </div>
                </div>
              ))
            ) : (
              studentGroups.map((group) => {
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
                    className={`notion-card flex-shrink-0 flex flex-col gap-2.5 p-3.5 text-left transition-colors cursor-pointer min-w-[270px] sm:min-w-[300px] max-w-[330px] ${
                      isSelected
                        ? "border-primary ring-1 ring-primary/30"
                        : "hover:border-[#cccccc] dark:hover:border-[#444444]"
                    }`}
                  >
                    {/* Top row: Student Name, Roll Number, and Score */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-canvas-soft border border-hairline text-ink-secondary shrink-0">
                          <User className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold text-ink truncate max-w-[130px]">
                              {group.student_name}
                            </span>
                            <span className="font-mono text-[11px] font-medium bg-canvas-soft border border-hairline px-1.5 py-0.2 rounded-xs text-ink-secondary shrink-0">
                              {group.roll_number}
                            </span>
                          </div>
                          <div className="text-xs text-ink-muted truncate max-w-[170px] mt-0.5">
                            {group.exam_title}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-mono font-semibold text-ink block tabular-nums">
                          {group.total_awarded_marks} / {group.max_marks}m
                        </span>
                        <span className="text-[11px] text-ink-muted">Score</span>
                      </div>
                    </div>

                    {/* Middle: Appeals Breakdown & Requests inside this Student Card */}
                    <div className="pt-2 border-t border-hairline flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-1 text-xs">
                        <span className="font-medium text-ink-secondary flex items-center gap-1">
                          <FileText className="h-3 w-3 text-ink-muted" />
                          <span>
                            {group.requests.length}{" "}
                            {group.requests.length === 1 ? "Appeal" : "Appeals"}
                          </span>
                        </span>

                        {group.hasPending ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-secondary bg-canvas-soft px-2 py-0.5 rounded-xs border border-hairline">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#dd5b00] shrink-0" />
                            <span>{group.pendingCount} Pending</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-secondary bg-canvas-soft px-2 py-0.5 rounded-xs border border-hairline">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#1aae39] shrink-0" />
                            <span>Resolved</span>
                          </span>
                        )}
                      </div>

                      {/* Chips for individual requests filed by this student */}
                      <div className="flex flex-wrap gap-1.5 items-center">
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
                              className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-xs border transition-colors cursor-pointer ${
                                isThisReqActive
                                  ? "bg-primary text-white border-primary font-semibold"
                                  : "bg-canvas-soft text-ink-secondary border-hairline hover:bg-surface font-medium"
                              }`}
                              title={r.student_reason ? `Reason: "${r.student_reason}"` : undefined}
                            >
                              <span>Req #{idx + 1}:</span>
                              <span className="font-semibold">
                                {rQids.length > 0 ? rQids.join(", ") : "Paper"}
                              </span>
                              {rPending ? (
                                <span
                                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                                    isThisReqActive ? "bg-white" : "bg-[#dd5b00]"
                                  }`}
                                />
                              ) : (
                                <Check
                                  className={`h-2.5 w-2.5 ${
                                    isThisReqActive ? "text-white" : "text-[#1aae39]"
                                  }`}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 3. Empty State or Workspace — Permanently Mounted (CLS = 0.00) */}
      {!isInitialDeskLoading && studentGroups.length === 0 ? (
        <div className="notion-card p-10 sm:p-16 text-center text-xs text-ink-muted space-y-3">
          <div className="mx-auto h-11 w-11 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-center text-[#1aae39]">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <h2 className="notion-section-title text-base text-ink">Zero Open Grievances</h2>
          <p className="max-w-md mx-auto text-xs sm:text-sm text-ink-muted leading-relaxed">
            No students in {selectedBranch?.name || "this branch"} currently have open revaluation requests. When a student challenges a score via the student portal, their answer sheet will appear here for PDF-first human review.
          </p>
        </div>
      ) : (
        <div className="space-y-4 cascade-group">
          {/* Active Paper Banner with Multi-Request Tabs */}
          <div className="notion-card p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-md bg-canvas-soft text-primary border border-hairline flex items-center justify-center shrink-0">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isSubmissionContentLoading || !submission ? (
                      <>
                        <Skeleton className="h-4 w-36 rounded-xs" />
                        <Skeleton className="h-4 w-24 rounded-xs" />
                        <Skeleton className="h-4 w-28 rounded-xs" />
                      </>
                    ) : (
                      <>
                        <h2 className="notion-section-title text-sm sm:text-base text-ink">
                          {submission.exam_title || "Examination"}
                        </h2>
                        <span className="font-mono text-xs font-medium bg-canvas-soft border border-hairline px-2 py-0.5 rounded-xs text-ink-secondary">
                          Roll: {submission.roll_number}
                        </span>
                        <span className="text-xs text-ink-muted">• {submission.student_name}</span>
                        <span className="text-xs font-mono font-semibold text-primary bg-canvas-soft border border-hairline px-2 py-0.5 rounded-xs tabular-nums">
                          Score: {submission.total_awarded_marks} / {submission.max_marks}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted mt-1 flex flex-wrap items-center gap-1.5">
                    <span>Flagged questions display</span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink bg-canvas-soft border border-hairline px-2 py-0.5 rounded-xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#dd5b00] shrink-0" />
                      <span>Revaluation Appeal</span>
                    </span>
                    <span>on the canvas. Click any question box to inspect, adjust boundaries, or resolve appeal.</span>
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                {submission && (
                  <a
                    href={api.getAnnotatedPdfUrl(submission.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="notion-btn-utility w-full sm:w-auto"
                  >
                    <Download className="h-3.5 w-3.5 text-ink-muted" />
                    <span>Annotated PDF</span>
                  </a>
                )}
              </div>
            </div>

            {/* Multi-Request Switcher Bar when selectedGroup has multiple requests */}
            {selectedGroup && selectedGroup.requests.length > 0 && (
              <div className="pt-3 border-t border-hairline flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-ink-muted shrink-0">
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
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer border ${
                            isAct
                              ? "bg-primary text-white border-primary font-semibold"
                              : "bg-surface text-ink-secondary border-hairline hover:bg-canvas-soft"
                          }`}
                        >
                          <span>
                            Appeal #{i + 1} ({qids.length > 0 ? qids.join(", ") : "Paper"})
                          </span>
                          {isPen ? (
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.2 rounded-xs ${
                                isAct
                                  ? "bg-white/20 text-white"
                                  : "bg-canvas-soft text-ink-secondary border border-hairline"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isAct ? "bg-white" : "bg-[#dd5b00]"
                                }`}
                              />
                              Pending
                            </span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.2 rounded-xs ${
                                isAct
                                  ? "bg-white/20 text-white"
                                  : "bg-canvas-soft text-ink-secondary border border-hairline"
                              }`}
                            >
                              <Check className={`h-2.5 w-2.5 ${isAct ? "text-white" : "text-[#1aae39]"}`} />
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
                  <div className="text-xs text-ink-secondary bg-canvas-soft border border-hairline px-2.5 py-1.5 rounded-xs flex items-center gap-1.5 max-w-full md:max-w-md truncate">
                    <span className="font-semibold text-ink shrink-0">Reason:</span>
                    <span className="italic truncate">&ldquo;{selectedReq.student_reason}&rdquo;</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Interactive Workspace: PDF Viewer (3 cols) + Flagged Questions Sidebar (1 col) */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 items-start">
            {/* Left: DocumentViewer with Revaluation Flags & Interactive Drag Handles (3 cols) */}
            <div className="lg:col-span-3 h-[480px] sm:h-[580px] md:h-[700px] lg:h-[840px] notion-card overflow-hidden relative w-full max-w-full">
              {isSubmissionContentLoading || !submission ? (
                <EvaluationViewerSkeleton />
              ) : (
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
              )}
            </div>

            {/* Right: Question Navigator with Revaluation Focus (1 col) */}
            <div className="space-y-4">
              <div className="notion-card p-4 space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-hairline">
                  <h3 className="notion-section-title text-sm text-ink">
                    Questions Overview ({answers.length})
                  </h3>
                  <span className="text-xs text-primary font-medium">Click to review</span>
                </div>

                <div className="space-y-2 max-h-[580px] overflow-y-auto sleek-scrollbar pr-0.5">
                  {isSubmissionContentLoading || !submission ? (
                    [1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="p-3 rounded-md border border-hairline bg-surface space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-3.5 w-16 rounded-xs" />
                          <Skeleton className="h-3.5 w-12 rounded-xs" />
                        </div>
                        <Skeleton className="h-3 w-full rounded-xs" />
                      </div>
                    ))
                  ) : (
                    answers.map((ans) => {
                      const isSelected = selectedAnswer?.id === ans.id;
                      const isAnsResolved = Boolean(
                        ans.revaluation && ans.revaluation.status === "RESOLVED"
                      );

                      const matchedReq = selectedGroup?.requests.find((r) =>
                        parseQuestionIds(r.question_ids_json).includes(ans.question_id)
                      );
                      const matchedReqIdx =
                        matchedReq && selectedGroup
                          ? selectedGroup.requests.indexOf(matchedReq) + 1
                          : null;
                      const isFlagged =
                        !isAnsResolved &&
                        Boolean(
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
                          className={`p-3 rounded-md border text-left transition-colors cursor-pointer space-y-2 ${
                            isSelected
                              ? "bg-primary/[0.04] border-primary"
                              : isFlagged
                              ? "bg-canvas-soft border-hairline border-l-2 border-l-[#dd5b00]"
                              : "bg-surface border-hairline hover:bg-canvas-soft"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-semibold text-xs text-ink flex-wrap">
                              <span className="font-mono">{ans.question_id}</span>
                              {matchedReqIdx && (
                                <span className="text-[11px] font-medium text-ink-secondary bg-canvas-soft border border-hairline px-1.5 py-0.2 rounded-xs">
                                  Appeal #{matchedReqIdx}
                                </span>
                              )}
                              {isAnsResolved ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-secondary bg-canvas-soft px-2 py-0.5 rounded-xs border border-hairline">
                                  <span className="h-1.5 w-1.5 rounded-full bg-[#1aae39] shrink-0" />
                                  <span>Resolved</span>
                                </span>
                              ) : isFlagged ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink bg-surface px-2 py-0.5 rounded-xs border border-hairline">
                                  <span className="h-1.5 w-1.5 rounded-full bg-[#dd5b00] shrink-0" />
                                  <span>Appeal</span>
                                </span>
                              ) : null}
                            </div>

                            <span className="font-mono text-xs font-semibold text-ink tabular-nums shrink-0">
                              {ansScore.toFixed(1)} / {ansMax}m
                            </span>
                          </div>

                          {/* Student Grievance Snippet specific to this question's request */}
                          {isFlagged &&
                            (matchedReq?.student_reason || selectedReq?.student_reason) && (
                              <div className="text-xs text-ink-secondary italic bg-surface p-2 rounded-xs border border-hairline line-clamp-2">
                                &ldquo;{matchedReq?.student_reason || selectedReq?.student_reason}&rdquo;
                              </div>
                            )}

                          {/* Action buttons inside card */}
                          <div className="flex items-center justify-between pt-1.5 border-t border-hairline text-xs">
                            <span className="text-ink-muted">Page {ans.page_number || 1}</span>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectAnswer(ans, true);
                              }}
                              className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-xs cursor-pointer"
                            >
                              <Eye className="h-3 w-3" />
                              <span>Open &amp; Review</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
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
