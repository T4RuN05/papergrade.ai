"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  GraduationCap,
  ArrowLeft,
  FileText,
  BarChart3,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Search,
  SlidersHorizontal,
  Download,
  ExternalLink,
  BookOpen,
  Award,
  Layers,
  Check,
  AlertCircle,
  Building2,
  Calendar,
  Eye,
  FileCheck2,
  Play,
  Upload,
  Plus,
  RefreshCw,
  X,
  Flag,
  Lock,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Square,
  Loader2,
  Trash2,
  AlertTriangle,
  Users,
  Trophy,
} from "lucide-react";
import { api, API_BASE, getAuthToken, getCached, clearApiCache } from "@/lib/api";
import { Exam } from "@/lib/types";
import { useSetBreadcrumbs } from "@/lib/BreadcrumbContext";
import { useToast } from "@/lib/ToastContext";
import { useTenant } from "@/lib/TenantContext";
import { ExamRankedTable } from "@/components/ExamRankedTable";
import {
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
  ExamDetailSkeleton,
  ModalCard,
  FormInput,
  useConfirm,
} from "@/components/ui";

interface SubmissionRow {
  id: string;
  exam_id: string;
  batch_id?: string;
  student_name: string;
  roll_number: string;
  total_awarded_marks: number;
  max_marks: number;
  percentage: number;
  status: string;
  publication_status: string;
  page_count: number;
  submitted_at?: string;
}

export default function ExamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const examId = params.id as string;
  const { selectedInstitute, selectedBranch, institutes, allBranches, isRootAdmin, isBranchManager, currentUser, switchTenancy } = useTenant();

  const [exam, setExam] = useState<Exam | null>(() => {
    if (typeof window === "undefined" || !examId) return null;
    return getCached<Exam>(`exams:detail:${examId}`);
  });
  const [submissions, setSubmissions] = useState<SubmissionRow[]>(() => {
    if (typeof window === "undefined" || !examId) return [];
    return getCached<SubmissionRow[]>(`submissions:list:${examId}`) || [];
  });
  const [batchInfo, setBatchInfo] = useState<any>(null);
  const [loadedBranches, setLoadedBranches] = useState<any[]>([]);
  const [loadedInstitutes, setLoadedInstitutes] = useState<any[]>([]);
  const [windowStatus, setWindowStatus] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window === "undefined" || !examId) return true;
    return !getCached<Exam>(`exams:detail:${examId}`);
  });
  const [isPublishing, setIsPublishing] = useState(false);
  const [isStartingEval, setIsStartingEval] = useState(false);
  const [deleteExamModalOpen, setDeleteExamModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingExam, setIsDeletingExam] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [scoreFilter, setScoreFilter] = useState<"ALL" | "TOP" | "MID" | "LOW">("ALL");
  const [sortBy, setSortBy] = useState<"roll" | "marks_desc" | "marks_asc" | "name">("roll");
  const [submissionViewMode, setSubmissionViewMode] = useState<"roster" | "ranked">("roster");
  const [isBulkClearing, setIsBulkClearing] = useState(false);
  const [clearingSubId, setClearingSubId] = useState<string | null>(null);

  const needsReviewCount = useMemo(() => {
    return submissions.filter((s) => s.status === "NEEDS_REVIEW").length;
  }, [submissions]);

  // Post-Creation Upload Modals & Drag-and-Drop state
  const [uploadQpOpen, setUploadQpOpen] = useState(false);
  const [uploadAkOpen, setUploadAkOpen] = useState(false);
  const [qpFilesToUpload, setQpFilesToUpload] = useState<File[]>([]);
  const [akFilesToUpload, setAkFilesToUpload] = useState<File[]>([]);
  const [isDraggingQp, setIsDraggingQp] = useState(false);
  const [isDraggingAk, setIsDraggingAk] = useState(false);
  const [isUploadingQp, setIsUploadingQp] = useState(false);
  const [isUploadingAk, setIsUploadingAk] = useState(false);
  const [isOpeningWindow, setIsOpeningWindow] = useState(false);
  const [isClosingWindow, setIsClosingWindow] = useState(false);
  const [openWindowModalOpen, setOpenWindowModalOpen] = useState(false);
  const [windowDuration, setWindowDuration] = useState("30");
  const [windowReason, setWindowReason] = useState("Scheduled examination upload session");
  const [windowScope, setWindowScope] = useState("ALL_STUDENTS");

  // Artifact Viewer Modal State (Question Paper & Answer Key)
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [viewerArtifactType, setViewerArtifactType] = useState<"QUESTION_PAPER" | "ANSWER_KEY">("QUESTION_PAPER");
  const [viewerPage, setViewerPage] = useState<number>(1);
  const [viewerTotalPages, setViewerTotalPages] = useState<number>(1);
  const [viewerLoading, setViewerLoading] = useState<boolean>(false);
  const [viewerPageImgLoading, setViewerPageImgLoading] = useState<boolean>(true);
  const [viewerZoom, setViewerZoom] = useState<number>(1.0);
  const [viewerHasDoc, setViewerHasDoc] = useState<boolean>(true);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const handleViewArtifact = async (type: "QUESTION_PAPER" | "ANSWER_KEY") => {
    setViewerArtifactType(type);
    setViewerPage(1);
    setViewerZoom(1.0);
    setViewerLoading(true);
    setViewerPageImgLoading(true);
    setViewerError(null);
    setViewerModalOpen(true);

    if (exam) {
      try {
        const artSlug = type === "QUESTION_PAPER" ? "question-paper" : "answer-key";
        const meta = await api.getExamArtifactMeta(exam.id, artSlug);
        setViewerTotalPages(Math.max(1, meta.page_count || 1));
        setViewerHasDoc(meta.has_document);
      } catch (err: any) {
        console.error("Failed to load artifact meta:", err);
        setViewerError(err.message || "Failed to load document preview");
      } finally {
        setViewerLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!viewerModalOpen || !exam) return;
    const artSlug = viewerArtifactType === "QUESTION_PAPER" ? "question-paper" : "answer-key";
    const pagesToPreload = [viewerPage + 1, viewerPage - 1].filter(
      (p) => p >= 1 && p <= viewerTotalPages
    );
    pagesToPreload.forEach((p) => {
      const img = new Image();
      img.src = api.getExamArtifactPageUrl(exam.id, artSlug, p);
    });
  }, [viewerPage, viewerModalOpen, exam, viewerArtifactType, viewerTotalPages]);

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

  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadExamData = async (showSkeleton = false, forceRefresh = true) => {
    if (showSkeleton) setLoading(true);
    else setIsRefreshing(true);
    try {
      const [examData, subsData, batchesData] = await Promise.all([
        api.getExam(examId, forceRefresh),
        api.listSubmissions(examId, forceRefresh).catch(() => []),
        api.listBatches().catch(() => []),
      ]);

      setExam(examData);
      setSubmissions(subsData || []);
      if (examData?.window_status) {
        setWindowStatus(examData.window_status);
      }

      // Find matching batch:
      // 1. From submissions batch_id if available
      const subBatchId = (subsData || []).find((s: any) => s.batch_id)?.batch_id;
      let matchedBatch = (batchesData || []).find((b: any) => b.id === subBatchId);
      if (!matchedBatch && examData?.branch_id) {
        matchedBatch = (batchesData || []).find((b: any) => b.branch_id === examData.branch_id);
      }
      setBatchInfo(matchedBatch || null);

      // Tenancy auto-sync for Root Admin: ensure active header context matches exam's branch and institute
      if (examData?.branch_id && isRootAdmin) {
        const examBranchId = examData.branch_id;
        const examInstId = examData.institute_id;
        const examInstName = examData.institute_name;
        const examBranchName = examData.branch_name;

        if (selectedBranch && selectedBranch.id !== examBranchId) {
          const res = switchTenancy(examInstId, examBranchId, examInstName, examBranchName);
          if (res.switched) {
            toast.info(`Switching to ${res.instituteName || examInstName || "Institute"} and ${res.branchName || examBranchName || "Branch"}`, {
              title: "Tenancy Synchronized",
              duration: 4000,
            });
          }
        }
      }
    } catch (err) {
      console.error("Failed to load exam details:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const cachedExam = getCached<Exam>(`exams:detail:${examId}`);
    if (cachedExam) {
      setExam(cachedExam);
      setLoading(false);
      loadExamData(false, true);
    } else {
      loadExamData(true, true);
    }
  }, [examId]);

  // Safety fallback: ensure skeleton never hangs indefinitely if network or api stalls
  useEffect(() => {
    if (!loading) return;
    const fallbackTimer = setTimeout(() => {
      setLoading(false);
    }, 4000);
    return () => clearTimeout(fallbackTimer);
  }, [loading]);

  const isPollingRef = useRef(false);

  // Poll only the single, lightweight evaluation status endpoint (<5ms, 1 connection)
  const pollEvaluationStatus = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;
    try {
      const statusData = await api.getExamEvaluationStatus(examId);
      if (!statusData) return;

      // Update exam status if it transitioned (e.g. EVALUATING -> EVALUATED)
      if (statusData.status) {
        setExam((prev) => (prev ? { ...prev, status: statusData.status, lifecycle_status: statusData.lifecycle_status } : prev));
      }

      // Merge updated submission items into existing submissions state
      if (Array.isArray(statusData.submissions)) {
        setSubmissions((prev) => {
          const updateMap = new Map(statusData.submissions.map((s: any) => [s.id, s]));
          if (prev.length === 0) return statusData.submissions;
          return prev.map((oldSub) => {
            const updated = updateMap.get(oldSub.id);
            return updated ? { ...oldSub, ...updated } : oldSub;
          });
        });
      }

      // If evaluation just finished (no more queued or processing), trigger a single full sync
      if (!statusData.is_active && statusData.summary?.total > 0) {
        clearApiCache(`exams:detail:${examId}`);
        clearApiCache(`submissions:list:${examId}`);
        loadExamData(false, true);
      }
    } catch (err) {
      console.error("Evaluation status poll failed:", err);
    } finally {
      isPollingRef.current = false;
    }
  }, [examId]);

  // Derived states for evaluation activity
  const isQueueActive = submissions.some(
    (s) => s.status === "QUEUED" || s.status === "PROCESSING"
  );
  const isExamEvaluatingStatus = exam?.status === "EVALUATING" || exam?.lifecycle_status === "EVALUATING";
  const isEvalActive = Boolean(isStartingEval || isExamEvaluatingStatus || isQueueActive);

  // Real-time evaluation polling while active (fires immediately, then every 3.5s)
  useEffect(() => {
    if (!isEvalActive) return;

    // Immediately trigger status poll on activation so UI updates with zero delay
    pollEvaluationStatus();

    // Active evaluation polling: single lightweight status endpoint (<5ms)
    const evalTimer = setInterval(() => {
      pollEvaluationStatus();
    }, 3500);

    return () => clearInterval(evalTimer);
  }, [isEvalActive, pollEvaluationStatus]);

  // Upload window status polling (5s interval while student upload window is open)
  const isWindowActive = Boolean(windowStatus?.is_active);
  useEffect(() => {
    if (!isWindowActive) return;
    const winTimer = setInterval(async () => {
      try {
        const win = await api.getWindowStatus(examId);
        setWindowStatus(win);
      } catch (_) {}
    }, 5000);
    return () => clearInterval(winTimer);
  }, [isWindowActive, examId]);

  // Real-time smooth 1-second countdown ticker for active submission window
  useEffect(() => {
    if (!windowStatus || !windowStatus.is_active || windowStatus.seconds_remaining <= 0) return;
    const ticker = setInterval(() => {
      setWindowStatus((prev: any) => {
        if (!prev || !prev.is_active) return prev;
        const next = Math.max(0, prev.seconds_remaining - 1);
        if (next === 0) {
          return { ...prev, is_active: false, seconds_remaining: 0, status: "CLOSED" };
        }
        return { ...prev, seconds_remaining: next };
      });
    }, 1000);
    return () => clearInterval(ticker);
  }, [windowStatus?.is_active]);

  const formatTimer = (totalSeconds: number) => {
    if (isNaN(totalSeconds) || totalSeconds <= 0) return "00:00";
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleUploadQp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qpFilesToUpload.length === 0) return;
    setIsUploadingQp(true);
    try {
      const formData = new FormData();
      for (const file of qpFilesToUpload) {
        formData.append("question_paper", file);
      }
      await api.uploadQuestionPaper(examId, formData);
      clearApiCache(`exams:detail:${examId}`);
      setUploadQpOpen(false);
      setQpFilesToUpload([]);
      await loadExamData(false);
      toast.success("Question Paper uploaded and canonicalized successfully!", { title: "Question Paper Attached" });
    } catch (err: any) {
      toast.error(err.message || "Failed to upload question paper", { title: "Upload Failed" });
    } finally {
      setIsUploadingQp(false);
    }
  };

  const handleUploadAk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (akFilesToUpload.length === 0) return;
    setIsUploadingAk(true);
    const loadingToastId = toast.loading(
      "Uploading Answer Key & generating AI rubric with Gemini Vision...",
      { title: "Processing Answer Key" }
    );
    try {
      const formData = new FormData();
      for (const file of akFilesToUpload) {
        formData.append("answer_key", file);
      }
      await api.uploadAnswerKey(examId, formData);
      clearApiCache(`exams:detail:${examId}`);
      clearApiCache(`submissions:list:${examId}`);
      setUploadAkOpen(false);
      setAkFilesToUpload([]);
      await loadExamData(false);
      toast.dismiss(loadingToastId);
      toast.success("Official Answer Key uploaded! AI draft rubric generated for your review.", { title: "Answer Key Attached" });
    } catch (err: any) {
      toast.dismiss(loadingToastId);
      toast.error(err.message || "Failed to upload answer key", { title: "Upload Failed" });
    } finally {
      setIsUploadingAk(false);
    }
  };

  const handleStartEvaluation = async () => {
    if (!exam) return;
    const ok = await confirm({
      title: "Start Automated Evaluation",
      message: `Start automated evaluation for all accepted student papers in "${exam.title}"? Jobs will be processed in roll number ascending order.`,
      confirmText: "Start Evaluation",
      variant: "primary",
    });
    if (!ok) return;

    setIsStartingEval(true);
    // Optimistic UI state: immediately update non-completed submissions to QUEUED
    setSubmissions((prev) =>
      prev.map((s) =>
        s.status !== "COMPLETED" && s.status !== "GRADED" && s.status !== "NEEDS_REVIEW"
          ? { ...s, status: "QUEUED" }
          : s
      )
    );
    // Optimistically mark exam status as EVALUATING
    setExam((prev) => (prev ? { ...prev, status: "EVALUATING", lifecycle_status: "EVALUATING" } : prev));

    try {
      clearApiCache(`exams:detail:${examId}`);
      clearApiCache(`submissions:list:${examId}`);
      clearApiCache(`submissions:list:all`);
      clearApiCache(`exams:list:`);

      const res = await api.startEvaluation(examId);

      // Immediately poll evaluation status directly from backend to sync real-time queue states
      await pollEvaluationStatus();

      toast.success(
        `Evaluation started! ${res.enqueued_papers || "All"} submissions enqueued in roll number order.`,
        { title: "Evaluation Triggered" }
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to start evaluation", { title: "Evaluation Blocked" });
      await loadExamData(false, true);
    } finally {
      setIsStartingEval(false);
    }
  };

  const handleClearAllExamReviews = async () => {
    if (needsReviewCount === 0) return;
    const ok = await confirm({
      title: "Clear All Review Flags",
      message: `Are you sure you want to clear review flags on all ${needsReviewCount} flagged papers and mark them as Completed?`,
      confirmText: "Clear Flags",
      variant: "warning",
    });
    if (!ok) return;

    setIsBulkClearing(true);
    try {
      const res = await api.clearExamReviews(examId);
      await loadExamData(false);
      toast.success(
        `Cleared review flags on ${res.cleared_count || needsReviewCount} papers. All marked as Completed!`,
        { title: "Review Flags Cleared" }
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to clear exam review flags", { title: "Bulk Unflag Failed" });
    } finally {
      setIsBulkClearing(false);
    }
  };

  const handleClearSingleSubmissionReview = async (subId: string) => {
    setClearingSubId(subId);
    try {
      await api.clearSubmissionReview(subId);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === subId ? { ...s, status: "COMPLETED" } : s))
      );
      toast.success("Paper unflagged and marked as Completed.", {
        title: "Paper Completed",
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to clear paper review flags", { title: "Unflag Failed" });
      await loadExamData(false);
    } finally {
      setClearingSubId(null);
    }
  };

  const handlePublishResults = async () => {
    if (!exam) return;
    const reviewCount = submissions.filter((s) => s.status === "NEEDS_REVIEW").length;
    const ok = await confirm({
      title: "Publish Official Results",
      message:
        reviewCount > 0
          ? `Are you sure you want to officially publish evaluation results? Note: ${reviewCount} paper(s) are currently flagged for review and will be published with their awarded scores.`
          : "Are you sure you want to officially publish evaluation results for all students in this exam? Scores and breakdown rubrics will immediately become visible on the student portal.",
      confirmText: "Publish Results",
      variant: "primary",
    });
    if (!ok) return;

    setIsPublishing(true);
    try {
      await api.publishResults(examId);
      await loadExamData(false);
      toast.success("Results successfully published to the student portal!", { title: "Results Published" });
    } catch (err: any) {
      toast.error(err.message || "Failed to publish results", { title: "Publish Failed" });
    } finally {
      setIsPublishing(false);
    }
  };

  const canDeleteExam = Boolean(
    isRootAdmin ||
    (isBranchManager && (!currentUser?.branch_id || !exam?.branch_id || currentUser.branch_id === exam?.branch_id))
  );

  const handleDeleteExam = async () => {
    if (!exam) return;
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      toast.error("Please type DELETE to confirm deletion.", { title: "Confirmation Required" });
      return;
    }
    setIsDeletingExam(true);
    try {
      const res = await api.deleteExam(exam.id);
      clearApiCache();
      toast.success(
        res.message || `Exam "${exam.title}" and all associated files/evaluations permanently deleted.`,
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

  const handleOpenWindowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exam) return;

    const durationNum = parseInt(windowDuration, 10) || 30;
    const reasonText = windowReason.trim() || "Scheduled examination upload session";
    const hasPriorWindow = Boolean(windowStatus?.has_window);

    setIsOpeningWindow(true);
    try {
      if (hasPriorWindow) {
        await api.reopenWindow(exam.id, {
          duration_minutes: durationNum,
          reason: reasonText,
          reopen_scope: windowScope,
        });
      } else {
        await api.openWindow(exam.id, durationNum, 2);
      }

      toast.success(`Submission window opened for "${exam.title}" (${durationNum}m)!`, {
        title: "Window Opened",
      });

      const win = await api.getWindowStatus(exam.id).catch(() => ({
        has_window: true,
        is_active: true,
        is_in_grace: false,
        seconds_remaining: durationNum * 60,
        status: "OPEN",
      }));
      setWindowStatus({
        ...win,
        is_active: true,
        seconds_remaining: win.seconds_remaining || durationNum * 60,
        status: "OPEN",
      });
      setOpenWindowModalOpen(false);
      await loadExamData(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to open window", { title: "Window Open Failed" });
    } finally {
      setIsOpeningWindow(false);
    }
  };

  const handleHardCloseWindow = async () => {
    if (!exam) return;
    const ok = await confirm({
      title: "Close Submission Window",
      message:
        "Are you sure you want to close the student submission window immediately? Students will no longer be able to submit or replace answer sheets, and the exam will become eligible for immediate evaluation.",
      confirmText: "Close Window",
      variant: "danger",
    });
    if (!ok) return;

    setIsClosingWindow(true);
    try {
      await api.closeWindow(exam.id, "Closed early by administrator");
      toast.success("Submission window Closed successfully. Submissions are now finalized.", {
        title: "Window Closed",
      });
      const win = await api.getWindowStatus(exam.id);
      setWindowStatus(win);
      await loadExamData(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to close submission window", {
        title: "Window Close Failed",
      });
    } finally {
      setIsClosingWindow(false);
    }
  };

  // Calculations for KPI Cards
  const stats = useMemo(() => {
    if (!submissions || submissions.length === 0) {
      return { total: 0, completed: 0, avgMarks: 0, avgPct: 0, maxScore: 0, minScore: 0, passRate: 0 };
    }
    const evaluatedSubs = submissions.filter((s) =>
      ["COMPLETED", "NEEDS_REVIEW", "GRADED"].includes(s.status)
    );
    const count = evaluatedSubs.length;
    if (count === 0) {
      return { total: submissions.length, completed: 0, avgMarks: 0, avgPct: 0, maxScore: 0, minScore: 0, passRate: 0 };
    }

    const totalMarks = evaluatedSubs.reduce((acc, curr) => acc + (curr.total_awarded_marks || 0), 0);
    const avgMarks = totalMarks / count;
    const avgPct = evaluatedSubs.reduce((acc, curr) => acc + (curr.percentage || 0), 0) / count;

    let maxScore = -Infinity;
    let minScore = Infinity;
    let passCount = 0;

    evaluatedSubs.forEach((s) => {
      const m = s.total_awarded_marks || 0;
      if (m > maxScore) maxScore = m;
      if (m < minScore) minScore = m;
      if ((s.percentage || 0) >= 40) passCount++;
    });

    const passRate = (passCount / count) * 100;

    return {
      total: submissions.length,
      completed: count,
      avgMarks,
      avgPct,
      maxScore: maxScore === -Infinity ? 0 : maxScore,
      minScore: minScore === Infinity ? 0 : minScore,
      passRate,
    };
  }, [submissions]);

  // Filtered & Sorted Submissions
  const filteredSubmissions = useMemo(() => {
    return submissions
      .filter((sub) => {
        const query = searchTerm.toLowerCase().trim();
        const matchesQuery =
          !query ||
          sub.student_name.toLowerCase().includes(query) ||
          sub.roll_number.toLowerCase().includes(query);

        if (!matchesQuery) return false;

        if (scoreFilter === "TOP") return (sub.percentage || 0) >= 75;
        if (scoreFilter === "MID") return (sub.percentage || 0) >= 40 && (sub.percentage || 0) < 75;
        if (scoreFilter === "LOW") return (sub.percentage || 0) < 40;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "marks_desc") return (b.total_awarded_marks || 0) - (a.total_awarded_marks || 0);
        if (sortBy === "marks_asc") return (a.total_awarded_marks || 0) - (b.total_awarded_marks || 0);
        if (sortBy === "name") return a.student_name.localeCompare(b.student_name);
        return a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true });
      });
  }, [submissions, searchTerm, scoreFilter, sortBy]);

  if (loading) {
    return <ExamDetailSkeleton />;
  }

  if (!exam) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <FeatureCard className="p-8 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-base font-bold text-ink">Examination Not Found</h2>
          <p className="text-xs text-ink-muted">
            The examination ID <code className="font-mono bg-canvas-soft px-1.5 py-0.5 rounded">{examId}</code> could not be found in the active database.
          </p>
          <div className="pt-2">
            <ButtonUtility href="/exams">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Return to Examinations
            </ButtonUtility>
          </div>
        </FeatureCard>
      </div>
    );
  }

  const isApproved = Boolean(
    exam.is_rubric_approved ||
    exam.has_approved_rubric ||
    exam.status === "RUBRIC_APPROVED" ||
    exam.lifecycle_status === "APPROVED" ||
    exam.rubric_version?.is_approved ||
    ["RUBRIC_APPROVED", "SUBMISSION_OPEN", "EVALUATING", "EVALUATED", "COMPLETED", "PUBLISHED"].includes(exam.status) ||
    ["RUBRIC_APPROVED", "SUBMISSION_OPEN", "EVALUATING", "EVALUATED", "COMPLETED", "PUBLISHED", "APPROVED"].includes(exam.lifecycle_status || "")
  );
  const isPublished = exam.is_published === 1 || exam.lifecycle_status === "PUBLISHED";
  const hasAnswerKey = Boolean(exam.answer_key_path);
  const hasQuestionPaper = Boolean(exam.question_paper_path);
  const isWindowOpen = Boolean(windowStatus?.is_active);

  // Dynamic branch & institute resolution based on exam.branch_id
  const effectiveBranches = allBranches.length > 0 ? allBranches : loadedBranches;
  const effectiveInstitutes = institutes.length > 0 ? institutes : loadedInstitutes;
  const examBranch = effectiveBranches.find((b) => b.id === exam.branch_id) || selectedBranch;
  const examInstitute = effectiveInstitutes.find((i) => i.id === examBranch?.institute_id) || selectedInstitute;

  // Unprocessed submissions count (in UPLOADED, AWAITING_KEY, FAILED, etc. - excluding COMPLETED, GRADED, and NEEDS_REVIEW)
  const unprocessedCount = submissions.filter(
    (s) =>
      s.status !== "COMPLETED" &&
      s.status !== "GRADED" &&
      s.status !== "NEEDS_REVIEW" &&
      s.status !== "PROCESSING" &&
      s.status !== "QUEUED"
  ).length;

  const hasFailedPapers = submissions.some((s) => s.status === "FAILED");

  const isEvaluating =
    isStartingEval ||
    isQueueActive ||
    ((exam.lifecycle_status === "EVALUATING" || exam.status === "EVALUATING") && (unprocessedCount > 0 || isQueueActive));

  const canStartEvaluation =
    !isEvaluating &&
    !isWindowOpen &&
    hasAnswerKey &&
    isApproved &&
    unprocessedCount > 0;

  const renderStatusBadge = (status: string, errorDetails?: string) => {
    const s = (status || "UPLOADED").toUpperCase();
    if (s === "COMPLETED" || s === "GRADED") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          COMPLETED
        </span>
      );
    }
    if (s === "PROCESSING") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
          <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
          PROCESSING
        </span>
      );
    }
    if (s === "QUEUED") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
          <Clock className="h-3 w-3 text-amber-600" />
          QUEUED
        </span>
      );
    }
    if (s === "FAILED") {
      return (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200"
          title={errorDetails || "Evaluation failed. Click Retry Evaluation to re-enqueue."}
        >
          <AlertCircle className="h-3 w-3 text-red-600" />
          FAILED
        </span>
      );
    }
    if (s === "NEEDS_REVIEW") {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
          <Eye className="h-3 w-3 text-purple-600" />
          NEEDS REVIEW
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
        <FileText className="h-3 w-3 text-slate-500" />
        {s}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Main Examination Header Card */}
      <FeatureCard className="p-6 sm:p-8 space-y-6 border-hairline bg-surface">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-hairline">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <BadgePill label={`Subject: ${exam.subject}`} color="purple" />
              <BadgePill label={`Exam ID: ${exam.id.slice(0, 8)}...`} color="gray" />
              {isWindowOpen ? (
                <BadgePill
                  label={`Window Open (${windowStatus?.seconds_remaining ? Math.ceil(windowStatus.seconds_remaining / 60) + "m" : "Active"})`}
                  color="green"
                />
              ) : windowStatus?.status === "CLOSED" ? (
                <BadgePill label="Window Closed" color="gray" />
              ) : (
                <BadgePill label="Window Not Opened" color="orange" />
              )}
              <BadgePill
                label={
                  isPublished
                    ? "Official Results Published"
                    : isEvaluating
                    ? "Evaluating in Queue"
                    : stats.completed > 0
                    ? `${stats.completed}/${stats.total} Evaluated`
                    : "Submissions Accepted"
                }
                color={isPublished ? "green" : isEvaluating ? "purple" : "orange"}
              />
              <BadgePill
                label={
                  isApproved
                    ? "Rubric Locked & Approved"
                    : exam.current_rubric_version_id
                    ? "Rubric Draft (Unapproved)"
                    : "No Rubric (Awaiting Key)"
                }
                color={isApproved ? "teal" : exam.current_rubric_version_id ? "orange" : "gray"}
              />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              {exam.title}
            </h1>
            <div className="flex items-center gap-2 flex-wrap text-xs sm:text-sm text-ink-muted leading-relaxed">
              <span>
                Assessment ledger for <span className="font-semibold text-ink">{exam.subject}</span>. Max achievable score: <span className="font-mono font-bold text-ink">{exam.total_marks && exam.total_marks > 0 ? `${exam.total_marks} marks` : "N/A (Awaiting Rubric)"}</span>.
              </span>
              <span className="hidden sm:inline text-ink-faint">•</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-canvas-soft border border-hairline text-ink-secondary text-xs font-medium">
                <Users className="h-3 w-3 text-ink-secondary" />
                <span>
                  {exam.batch_scope === "SPECIFIC" && exam.scoped_batches && exam.scoped_batches.length > 0
                    ? exam.scoped_batches.length === 1
                      ? `Batch: ${exam.scoped_batches[0].name}`
                      : `Batches: ${exam.scoped_batches.map((b) => b.name).join(", ")}`
                    : "Scope: Whole Branch"}
                </span>
              </span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 sm:self-start lg:self-center">
            {/* Start / Retry / Completed Evaluation Button */}
            {isEvaluating ? (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#edf5fd] text-primary border border-primary/20 shadow-2xs">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                <span>Evaluating in Queue ({stats.completed}/{stats.total} Graded)</span>
              </div>
            ) : unprocessedCount > 0 ? (
              <ButtonPrimary
                size="sm"
                onClick={handleStartEvaluation}
                isLoading={isStartingEval}
                disabled={!canStartEvaluation}
                title={
                  isWindowOpen
                    ? "Submission window is still active. Please wait until window closes."
                    : !hasAnswerKey
                    ? "Root Admin must upload Official Answer Key first."
                    : !isApproved
                    ? "Root Admin must review & lock the Rubric first."
                    : "Enqueue accepted papers for automated evaluation"
                }
                className="bg-primary hover:bg-primary-active shadow-xs"
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                {hasFailedPapers ? `Retry Evaluation (${unprocessedCount})` : `Start Evaluation (${unprocessedCount})`}
              </ButtonPrimary>
            ) : stats.total > 0 ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Evaluation Complete ({stats.completed}/{stats.total} Graded)</span>
              </div>
            ) : null}

            {/* Open / Close Submission Window Quick Action */}
            {isWindowOpen ? (
              <ButtonUtility
                size="sm"
                onClick={handleHardCloseWindow}
                disabled={isClosingWindow}
                className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 font-semibold cursor-pointer"
                title="Immediately terminate student upload window"
              >
                <Square className="h-3.5 w-3.5 mr-1.5 text-red-600 fill-red-600" />
                {isClosingWindow ? "Closing..." : "Close Window"}
              </ButtonUtility>
            ) : !isPublished && (
              <ButtonUtility
                size="sm"
                onClick={() => {
                  setWindowReason(windowStatus?.has_window ? "Reopened by administrator" : "Scheduled examination upload session");
                  setWindowDuration("30");
                  setWindowScope("ALL_STUDENTS");
                  setOpenWindowModalOpen(true);
                }}
                className="bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 font-semibold cursor-pointer"
              >
                <Clock className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                Open Window
              </ButtonUtility>
            )}

            <ButtonUtility href={`/exams/${exam.id}/rubric`}>
              <BookOpen className="h-3.5 w-3.5 mr-1.5 text-primary" />
              Rubric & Criteria
            </ButtonUtility>

            <ButtonUtility href={`/analytics?exam_id=${exam.id}`}>
              <BarChart3 className="h-3.5 w-3.5 mr-1.5 text-teal-600" />
              Analytics
            </ButtonUtility>

            <ButtonUtility href={`/marks?exam_id=${exam.id}`}>
              <FileCheck2 className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
              Marks Ledger
            </ButtonUtility>

            {stats.completed > 0 && !isPublished ? (
              <ButtonPrimary
                size="sm"
                onClick={handlePublishResults}
                isLoading={isPublishing}
                className="bg-[#1aae39] hover:bg-[#169631]"
              >
                <Check className="h-3.5 w-3.5 mr-1.5" />
                Publish Results
              </ButtonPrimary>
            ) : isPublished ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#eaf7ed] text-[#1aae39] border border-[#c2ecd0]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Published
              </div>
            ) : null}

            {canDeleteExam && (
              <ButtonUtility
                size="sm"
                onClick={() => {
                  setDeleteConfirmText("");
                  setDeleteExamModalOpen(true);
                }}
                className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 hover:border-red-300 font-semibold cursor-pointer"
                title="Permanently delete this exam, all submissions, and files"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5 text-red-600" />
                Delete Exam
              </ButtonUtility>
            )}
          </div>
        </div>

        {/* Active Submission Window Live Countdown & Hard Close Banner */}
        {isWindowOpen && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-amber-50/80 border border-amber-200/90 text-amber-950">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-md bg-white/90 border border-amber-200 flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5 text-amber-600 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                    Submission Window Active
                  </span>
                  <span className="text-[11px] font-mono font-semibold bg-white px-2 py-0.5 rounded border border-amber-200 text-amber-900">
                    ⏱ {formatTimer(windowStatus?.seconds_remaining || 0)} remaining
                  </span>
                </div>
                <p className="text-xs text-amber-800 mt-0.5">
                  Students can submit or replace papers until the timer expires. {submissions.length} submission(s) currently received.
                </p>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2 sm:self-center">
              <button
                type="button"
                onClick={handleHardCloseWindow}
                disabled={isClosingWindow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-white hover:bg-red-50 text-red-700 border border-red-200 hover:border-red-300 shadow-2xs transition-colors cursor-pointer"
              >
                <Square className="h-3.5 w-3.5 text-red-600 fill-red-600" />
                {isClosingWindow ? "Closing..." : "Close Window"}
              </button>
            </div>
          </div>
        )}

        {/* Academic Details & Materials Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs bg-canvas-soft rounded-lg p-4 border border-hairline">
          <div className="flex items-start gap-2.5">
            <Building2 className="h-4 w-4 text-ink-muted mt-0.5 shrink-0" />
            <div>
              <span className="text-ink-muted block text-[11px]">Academic Institute & Branch</span>
              <span className="font-semibold text-ink">{examInstitute?.name || "Academic Institute"}</span>
              <span className="text-ink-secondary block text-[11px]">
                {examBranch ? `${examBranch.name} (${examBranch.city || "Main"})` : "Branch Campus"}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Layers className="h-4 w-4 text-ink-muted mt-0.5 shrink-0" />
            <div>
              <span className="text-ink-muted block text-[11px]">Linked Batch</span>
              {batchInfo ? (
                <Link
                  href="/branch/batches"
                  className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
                >
                  {batchInfo.name} {batchInfo.code ? `(${batchInfo.code})` : ""}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : (
                <span className="text-ink-secondary font-medium">Branch-wide Assessment</span>
              )}
              <span className="text-ink-muted block text-[11px]">
                {batchInfo?.academic_year ? `Academic Year ${batchInfo.academic_year}` : "All Branch Batches"}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <FileText className="h-4 w-4 text-ink-muted mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-ink-muted block text-[11px]">Exam Artifacts</span>
              <div className="flex flex-wrap items-center gap-2.5 mt-1 text-xs">
                {/* Question Paper */}
                {isUploadingQp ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded shadow-2xs">
                    <RefreshCw className="h-3 w-3 animate-spin text-amber-600 shrink-0" />
                    <span>Processing QP...</span>
                  </span>
                ) : exam.question_paper_path ? (
                  <div className="flex items-center gap-1.5 bg-surface border border-hairline px-2 py-0.5 rounded text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleViewArtifact("QUESTION_PAPER")}
                      className="font-medium text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                      title="View Question Paper in Modal"
                    >
                      Question Paper
                      <Eye className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadQpOpen(true)}
                      className="text-ink-muted hover:text-ink underline text-[10px]"
                      title="Replace Question Paper"
                    >
                      (Replace)
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setUploadQpOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded hover:bg-amber-100 transition-colors cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    Upload Question Paper
                  </button>
                )}

                {/* Answer Key */}
                {isUploadingAk ? (
                  <button
                    type="button"
                    onClick={() => setUploadAkOpen(true)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded shadow-2xs hover:bg-emerald-100 transition-colors cursor-pointer"
                    title="Click to view AI Rubric generation status"
                  >
                    <RefreshCw className="h-3 w-3 animate-spin text-emerald-600 shrink-0" />
                    <span>Processing Answer Key...</span>
                  </button>
                ) : exam.answer_key_path ? (
                  <div className="flex items-center gap-1.5 bg-surface border border-hairline px-2 py-0.5 rounded text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleViewArtifact("ANSWER_KEY")}
                      className="font-medium text-emerald-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      title="View Official Answer Key in Modal"
                    >
                      Answer Key
                      <Eye className="h-3 w-3" />
                    </button>
                    {currentUser?.role === "ROOT_ADMIN" && (
                      <button
                        type="button"
                        onClick={() => setUploadAkOpen(true)}
                        className="text-ink-muted hover:text-ink underline text-[10px]"
                        title="Replace Answer Key"
                      >
                        (Replace)
                      </button>
                    )}
                  </div>
                ) : currentUser?.role === "ROOT_ADMIN" ? (
                  <button
                    type="button"
                    onClick={() => setUploadAkOpen(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded hover:bg-emerald-100 transition-colors cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    Upload Answer Key
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted bg-canvas-soft border border-hairline px-2 py-0.5 rounded">
                    Answer Key: Pending Root Admin
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Performance Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-hairline bg-surface p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
              <span>Submissions Evaluated</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-ink">{stats.completed}</span>
              <span className="text-xs text-ink-muted">/ {stats.total} sheets</span>
            </div>
            <div className="w-full bg-[#f1f1ef] h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="rounded-lg border border-hairline bg-surface p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
              <span>Class Mean Score</span>
              <Award className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-ink">{stats.avgMarks.toFixed(1)}</span>
              <span className="text-xs text-ink-muted">/ {exam.total_marks && exam.total_marks > 0 ? exam.total_marks : "—"}</span>
            </div>
            <div className="text-[11px] text-ink-secondary font-medium mt-1">
              Average Performance: <span className="font-semibold text-primary">{stats.avgPct.toFixed(1)}%</span>
            </div>
          </div>

          <div className="rounded-lg border border-hairline bg-surface p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
              <span>Highest Score</span>
              <Sparkles className="h-4 w-4 text-amber-500" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-emerald-600">{stats.maxScore.toFixed(1)}</span>
              <span className="text-xs text-ink-muted">/ {exam.total_marks && exam.total_marks > 0 ? exam.total_marks : "—"}</span>
            </div>
            <div className="text-[11px] text-ink-muted mt-1">
              Lowest Score Recorded: <span className="font-mono font-medium text-ink">{stats.minScore.toFixed(1)}</span>
            </div>
          </div>

          <div className="rounded-lg border border-hairline bg-surface p-4 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
              <span>Pass Rate (≥40%)</span>
              <GraduationCap className="h-4 w-4 text-purple-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-ink">{stats.passRate.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-[#f1f1ef] h-1.5 rounded-full mt-2.5 overflow-hidden">
              <div
                className="bg-purple-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${stats.passRate}%` }}
              />
            </div>
          </div>
        </div>
      </FeatureCard>

      {/* Evaluation Invariant Checklist Banner when requirements are pending */}
      {!isPublished && !isEvaluating && !canStartEvaluation && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-900 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-amber-700" />
              Evaluation Queue Prerequisites Checklist {unprocessedCount > 0 ? `(${unprocessedCount} papers stored)` : "(Awaiting Submissions & Key)"}
            </span>
            <span className="text-[11px] text-amber-800 font-medium">Evaluation Invariants</span>
          </div>
          <p className="text-[11px] text-amber-800/90 leading-relaxed">
            Per examination guidelines, automated evaluation cannot begin while students are still uploading or until the official answer key and locked rubric are verified.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-[11px]">
            <div className={`p-2.5 rounded-lg border flex items-center justify-between ${!isWindowOpen ? "bg-surface border-emerald-300 text-emerald-800" : "bg-surface border-amber-200 text-amber-900"}`}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`h-4 w-4 shrink-0 ${!isWindowOpen ? "text-emerald-600" : "text-amber-500"}`} />
                <span>1. Submission Window</span>
              </div>
              <BadgePill label={!isWindowOpen ? "Closed" : "Active"} color={!isWindowOpen ? "green" : "orange"} />
            </div>

            <div className={`p-2.5 rounded-lg border flex items-center justify-between ${hasAnswerKey ? "bg-surface border-emerald-300 text-emerald-800" : "bg-surface border-amber-200 text-amber-900"}`}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`h-4 w-4 shrink-0 ${hasAnswerKey ? "text-emerald-600" : "text-amber-500"}`} />
                <span>2. Official Answer Key</span>
              </div>
              {hasAnswerKey ? (
                <div className="flex items-center gap-1.5">
                  <BadgePill label="Uploaded" color="green" />
                  <button
                    type="button"
                    onClick={() => handleViewArtifact("ANSWER_KEY")}
                    className="text-[10px] text-emerald-700 hover:underline flex items-center gap-0.5 font-medium cursor-pointer"
                    title="View Answer Key in Modal"
                  >
                    <Eye className="h-2.5 w-2.5" />
                    View
                  </button>
                </div>
              ) : currentUser?.role === "ROOT_ADMIN" ? (
                <button
                  type="button"
                  onClick={() => setUploadAkOpen(true)}
                  className="font-bold text-primary hover:underline text-[11px]"
                >
                  Upload →
                </button>
              ) : (
                <span className="text-[10px] font-medium text-ink-muted bg-canvas-soft border border-hairline px-1.5 py-0.5 rounded">
                  Pending Admin
                </span>
              )}
            </div>

            <div className={`p-2.5 rounded-lg border flex items-center justify-between ${isApproved ? "bg-surface border-emerald-300 text-emerald-800" : "bg-surface border-amber-200 text-amber-900"}`}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`h-4 w-4 shrink-0 ${isApproved ? "text-emerald-600" : "text-amber-500"}`} />
                <span>3. Rubric Approved</span>
              </div>
              {isApproved ? (
                <BadgePill label="Locked" color="green" />
              ) : (
                <Link
                  href={`/exams/${exam.id}/rubric`}
                  className="font-bold text-primary hover:underline text-[11px]"
                >
                  Review & Lock →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* When all prerequisites are ready, show a ready banner */}
      {canStartEvaluation && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50/80 p-4 text-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-emerald-900">All Evaluation Prerequisites Satisfied</p>
              <p className="text-[11px] text-emerald-800 mt-0.5">
                Submission window closed, answer key uploaded, and rubric locked. Ready to evaluate {unprocessedCount} student {unprocessedCount === 1 ? "paper" : "papers"} in FIFO order.
              </p>
            </div>
          </div>
          <ButtonPrimary
            size="sm"
            onClick={handleStartEvaluation}
            isLoading={isStartingEval}
            className="bg-primary hover:bg-primary-active shrink-0 shadow-xs"
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Start Evaluation ({unprocessedCount})
          </ButtonPrimary>
        </div>
      )}

      {/* Student Submissions Table Section */}
      <FeatureCard className="p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-base font-bold text-ink">
                Student Answer Sheets & Evaluated Scripts
              </h2>
              {/* View Switcher Toggle: Roster vs Ranked */}
              <div className="inline-flex items-center p-0.5 rounded-lg bg-canvas-soft border border-hairline">
                <button
                  type="button"
                  onClick={() => setSubmissionViewMode("roster")}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    submissionViewMode === "roster"
                      ? "bg-surface text-ink shadow-2xs border border-hairline"
                      : "text-ink-muted hover:text-ink border border-transparent"
                  }`}
                  title="Alphabetical / Roll-based enrollment ledger"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Roster Ledger</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubmissionViewMode("ranked")}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    submissionViewMode === "ranked"
                      ? "bg-surface text-ink shadow-2xs border border-hairline"
                      : "text-ink-muted hover:text-ink border border-transparent"
                  }`}
                  title="Ranked leaderboard sorted highest to lowest score with podium badges"
                >
                  <Trophy className="h-3.5 w-3.5 text-amber-600" />
                  <span>Ranked Standings</span>
                </button>
              </div>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              {submissionViewMode === "ranked"
                ? "Academic merit standings ranked top-to-bottom by awarded marks and percentage with gold, silver, and bronze badges."
                : `Showing ${filteredSubmissions.length} of ${submissions.length} total enrolled submission scripts.`}
            </p>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Real-time Refresh Button */}
            <button
              type="button"
              onClick={() => {
                clearApiCache(`exams:detail:${examId}`);
                clearApiCache(`submissions:list:${examId}`);
                loadExamData(false, true);
              }}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:text-ink bg-surface border border-hairline rounded-md hover:bg-canvas-soft transition-colors cursor-pointer"
              title="Refresh submissions ledger in real time"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
              <span>{isRefreshing ? "Updating..." : "Refresh"}</span>
            </button>

            {submissionViewMode === "roster" && (
              <>
                {/* Search Input */}
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search student or roll #..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-hairline bg-surface focus:outline-none focus:border-primary text-ink placeholder:text-ink-faint w-48 transition-all"
                  />
                </div>

                {/* Score Tier Filter */}
                <select
                  value={scoreFilter}
                  onChange={(e: any) => setScoreFilter(e.target.value)}
                  className="text-xs rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-ink focus:outline-none focus:border-primary"
                >
                  <option value="ALL">All Scores</option>
                  <option value="TOP">Distinction (≥75%)</option>
                  <option value="MID">Passing (40% - 74%)</option>
                  <option value="LOW">Needs Attention (&lt;40%)</option>
                </select>

                {/* Sort Filter */}
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="text-xs rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-ink focus:outline-none focus:border-primary"
                >
                  <option value="roll">Sort: Roll Number</option>
                  <option value="marks_desc">Sort: Highest Marks</option>
                  <option value="marks_asc">Sort: Lowest Marks</option>
                  <option value="name">Sort: Student Name</option>
                </select>

                {/* Bulk Unflag Button when any papers need review */}
                {needsReviewCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllExamReviews}
                    disabled={isBulkClearing}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                    title="Unflag all flagged papers in this exam at once and mark them Completed"
                  >
                    {isBulkClearing ? (
                      <RefreshCw className="h-3 w-3 animate-spin text-purple-600" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 text-purple-600" />
                    )}
                    <span>Unflag All ({needsReviewCount} Flagged)</span>
                  </button>
                )}
              </>
            )}

          </div>
        </div>

        {submissionViewMode === "ranked" ? (
          <ExamRankedTable
            examId={examId}
            examTitle={exam.title}
            maxMarks={exam.total_marks || 25}
            submissions={submissions}
          />
        ) : filteredSubmissions.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <p className="text-xs font-semibold text-ink">No submissions match the search criteria.</p>
            <p className="text-[11px] text-ink-muted">Clear filters or try searching for another student name or roll number.</p>
            <ButtonUtility onClick={() => { setSearchTerm(""); setScoreFilter("ALL"); }}>
              Reset Filters
            </ButtonUtility>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-canvas-soft border-b border-hairline text-ink-muted font-medium">
                  <th className="py-3 px-4">Roll Number</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4 text-center">Pages</th>
                  <th className="py-3 px-4 text-right">Marks Awarded</th>
                  <th className="py-3 px-4 text-center">Score %</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Audit & Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline bg-surface">
                {filteredSubmissions.map((sub) => {
                  const pct = sub.percentage || 0;
                  const scoreBadgeColor =
                    pct >= 75 ? "green" : pct >= 60 ? "teal" : pct >= 40 ? "sky" : "orange";

                  return (
                    <tr
                      key={sub.id}
                      className="hover:bg-canvas-soft/60 transition-colors group"
                    >
                      <td className="py-3 px-4 font-mono font-semibold text-ink">
                        {sub.roll_number}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-ink block">{sub.student_name}</span>
                        <span className="text-[10px] text-ink-faint font-mono">{sub.id.slice(0, 8)}...</span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-ink-secondary">
                        {sub.page_count || 1}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono font-bold text-ink">
                          {sub.total_awarded_marks != null ? sub.total_awarded_marks.toFixed(1) : "—"}
                        </span>
                        <span className="text-ink-muted font-mono text-[11px]">{exam.total_marks && exam.total_marks > 0 ? ` / ${exam.total_marks}` : ""}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <BadgePill
                          label={`${pct.toFixed(1)}%`}
                          color={scoreBadgeColor}
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        {renderStatusBadge(sub.status, (sub as any).error_message)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {sub.status === "NEEDS_REVIEW" && (
                            <button
                              type="button"
                              onClick={() => handleClearSingleSubmissionReview(sub.id)}
                              disabled={clearingSubId === sub.id}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-1 rounded transition-colors cursor-pointer disabled:opacity-50"
                              title="Unflag all questions in this paper and mark as Completed"
                            >
                              {clearingSubId === sub.id ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )}
                              <span>Unflag</span>
                            </button>
                          )}
                          {Boolean(sub.status && ["COMPLETED", "GRADED", "NEEDS_REVIEW", "FAILED"].includes(sub.status.toUpperCase())) ? (
                            <Link
                              href={`/grading/${sub.id}`}
                              className="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-active transition-colors text-xs px-2.5 py-1 rounded-md hover:bg-canvas-soft"
                            >
                              <span>Inspect Sheet</span>
                              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </Link>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1.5 font-medium text-ink-muted text-xs px-2.5 py-1 rounded-md opacity-45 bg-canvas-soft/40 border border-hairline/60 cursor-not-allowed select-none"
                              title={
                                sub.status === "PROCESSING"
                                  ? "AI evaluation is currently processing this paper. Inspect Sheet is disabled until status changes to completed or failed."
                                  : sub.status === "QUEUED"
                                  ? "Paper is queued for evaluation. Inspect Sheet is disabled until status changes to completed or failed."
                                  : "Evaluation in progress. Inspect Sheet is disabled in all runtime statuses until status changes to completed or failed."
                              }
                            >
                              <Lock className="h-3 w-3 text-ink-muted/70" />
                              <span>Inspect Sheet</span>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </FeatureCard>

      {/* MODAL: Upload Question Paper */}
      {uploadQpOpen && (
        <ModalCard
          title="Upload / Replace Question Paper"
          maxWidth="max-w-xl"
          preventBackdropClose={true}
          onClose={() => {
            setUploadQpOpen(false);
            setQpFilesToUpload([]);
            setIsDraggingQp(false);
          }}
        >
          <form onSubmit={handleUploadQp} className="space-y-4">
            <p className="text-xs text-ink-muted leading-relaxed">
              Upload the official Question Paper for <span className="font-semibold text-ink">{exam.title}</span> as a PDF or multi-page images.
            </p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingQp(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setIsDraggingQp(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDraggingQp(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingQp(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const valid = Array.from(e.dataTransfer.files).filter((f) => {
                    const ext = f.name.toLowerCase();
                    return ext.endsWith(".pdf") || ext.endsWith(".png") || ext.endsWith(".jpg") || ext.endsWith(".jpeg") || ext.endsWith(".webp");
                  });
                  if (valid.length > 0) setQpFilesToUpload(valid);
                  else toast.error("Please drop valid PDF or image files", { title: "Invalid File Type" });
                }
              }}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
                isDraggingQp
                  ? "border-primary bg-primary/10 scale-[1.01] shadow-inner"
                  : "border-hairline hover:border-primary/60 bg-canvas-soft"
              }`}
            >
              <input
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  if (e.target.files) setQpFilesToUpload(Array.from(e.target.files));
                }}
                className="hidden"
                id="qp-file-input"
              />
              <label htmlFor="qp-file-input" className="cursor-pointer space-y-2 block">
                <FileText className={`h-8 w-8 mx-auto transition-transform ${isDraggingQp ? "text-primary scale-110 animate-bounce" : "text-primary"}`} />
                <div className="text-xs font-semibold text-ink">
                  {isDraggingQp
                    ? "Drop Question Paper file(s) here"
                    : qpFilesToUpload.length > 0
                    ? `${qpFilesToUpload.length} file(s) selected`
                    : "Drag & drop or click to select Question Paper"}
                </div>
                <div className="text-[11px] text-ink-muted">Supports PDF, PNG, JPG (single or multi-page)</div>
              </label>
            </div>

            {/* Selected files summary */}
            {qpFilesToUpload.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto rounded border border-hairline p-2 bg-surface">
                <div className="flex items-center justify-between text-[11px] text-ink-muted pb-1 border-b border-hairline">
                  <span>Selected Files ({qpFilesToUpload.length})</span>
                  <button
                    type="button"
                    onClick={() => setQpFilesToUpload([])}
                    className="text-red-500 hover:underline text-[10px]"
                  >
                    Clear All
                  </button>
                </div>
                {qpFilesToUpload.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-0.5">
                    <span className="truncate max-w-[280px] font-medium text-ink">{f.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-ink-muted">{(f.size / 1024).toFixed(1)} KB</span>
                      <button
                        type="button"
                        onClick={() => setQpFilesToUpload(qpFilesToUpload.filter((_, idx) => idx !== i))}
                        className="text-ink-muted hover:text-red-500 text-xs"
                        title="Remove file"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-3 border-t border-hairline/60">
              <ButtonUtility
                type="button"
                size="md"
                onClick={() => {
                  setUploadQpOpen(false);
                  setQpFilesToUpload([]);
                }}
                className="whitespace-nowrap"
              >
                Cancel
              </ButtonUtility>
              <ButtonPrimary
                type="submit"
                size="md"
                disabled={qpFilesToUpload.length === 0 || isUploadingQp}
                isLoading={isUploadingQp}
                className="whitespace-nowrap"
              >
                {isUploadingQp ? "Uploading..." : "Upload Question Paper"}
              </ButtonPrimary>
            </div>
          </form>
        </ModalCard>
      )}

      {/* MODAL: Upload Official Answer Key */}
      {uploadAkOpen && (
        <ModalCard
          title="Upload Official Answer Key"
          maxWidth="max-w-xl"
          preventBackdropClose={true}
          onClose={() => {
            setUploadAkOpen(false);
            if (!isUploadingAk) setAkFilesToUpload([]);
            setIsDraggingAk(false);
          }}
        >
          <form onSubmit={handleUploadAk} className="space-y-4">
            <p className="text-xs text-ink-muted leading-relaxed">
              Root Admin can upload the Official Answer Key as a PDF or multi-page images. This automatically drafts a structured AI rubric via Gemini.
            </p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingAk(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setIsDraggingAk(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDraggingAk(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingAk(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const valid = Array.from(e.dataTransfer.files).filter((f) => {
                    const ext = f.name.toLowerCase();
                    return ext.endsWith(".pdf") || ext.endsWith(".png") || ext.endsWith(".jpg") || ext.endsWith(".jpeg") || ext.endsWith(".webp");
                  });
                  if (valid.length > 0) setAkFilesToUpload(valid);
                  else toast.error("Please drop valid PDF or image files", { title: "Invalid File Type" });
                }
              }}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
                isUploadingAk
                  ? "border-hairline bg-canvas-soft/60 opacity-60 pointer-events-none cursor-not-allowed"
                  : isDraggingAk
                  ? "border-emerald-500 bg-emerald-50/60 scale-[1.01] shadow-inner cursor-pointer"
                  : "border-hairline hover:border-emerald-500/60 bg-canvas-soft cursor-pointer"
              }`}
            >
              <input
                type="file"
                multiple
                disabled={isUploadingAk}
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  if (!isUploadingAk && e.target.files) setAkFilesToUpload(Array.from(e.target.files));
                }}
                className="hidden"
                id="ak-file-input"
              />
              <label htmlFor="ak-file-input" className={`space-y-2 block ${isUploadingAk ? "cursor-not-allowed" : "cursor-pointer"}`}>
                <Sparkles className={`h-8 w-8 mx-auto transition-transform ${isDraggingAk ? "text-emerald-600 scale-110 animate-bounce" : "text-emerald-600"}`} />
                <div className="text-xs font-semibold text-ink">
                  {isDraggingAk
                    ? "Drop Answer Key file(s) here"
                    : akFilesToUpload.length > 0
                    ? `${akFilesToUpload.length} file(s) selected`
                    : "Drag & drop or click to select Answer Key"}
                </div>
                <div className="text-[11px] text-ink-muted">Supports PDF, PNG, JPG (single or multi-page)</div>
              </label>
            </div>

            {/* Selected files summary */}
            {akFilesToUpload.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto rounded border border-hairline p-2 bg-surface">
                <div className="flex items-center justify-between text-[11px] text-ink-muted pb-1 border-b border-hairline">
                  <span>Selected Files ({akFilesToUpload.length})</span>
                  {!isUploadingAk && (
                    <button
                      type="button"
                      onClick={() => setAkFilesToUpload([])}
                      className="text-red-500 hover:underline text-[10px]"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                {akFilesToUpload.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-0.5">
                    <span className="truncate max-w-[280px] font-medium text-ink">{f.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-ink-muted">{(f.size / 1024).toFixed(1)} KB</span>
                      {!isUploadingAk && (
                        <button
                          type="button"
                          onClick={() => setAkFilesToUpload(akFilesToUpload.filter((_, idx) => idx !== i))}
                          className="text-ink-muted hover:text-red-500 text-xs"
                          title="Remove file"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* In-progress status banner */}
            {isUploadingAk && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200 text-xs space-y-1 animate-in fade-in">
                <div className="font-semibold flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
                  <span>AI Rubric Generation in Progress...</span>
                </div>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300/80 leading-relaxed">
                  Gemini Vision AI is analyzing questions, choices, marking schemes, and criteria. You can close this window at any time.
                </p>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-3 border-t border-hairline/60">
              <ButtonUtility
                type="button"
                size="md"
                onClick={() => {
                  setUploadAkOpen(false);
                  if (!isUploadingAk) setAkFilesToUpload([]);
                }}
                className="whitespace-nowrap"
              >
                {isUploadingAk ? "Run in Background" : "Cancel"}
              </ButtonUtility>

              <ButtonPrimary
                type="submit"
                size="md"
                disabled={akFilesToUpload.length === 0 || isUploadingAk}
                isLoading={isUploadingAk}
                className="whitespace-nowrap"
              >
                {isUploadingAk ? "Generating Rubric..." : "Upload & Generate Rubric"}
              </ButtonPrimary>
            </div>
          </form>
        </ModalCard>
      )}

      {/* MODAL: View Exam Artifact (Question Paper / Answer Key) */}
      {viewerModalOpen && exam && (
        <ModalCard
          title={
            viewerArtifactType === "QUESTION_PAPER"
              ? `Question Paper — ${exam.title}`
              : `Official Answer Key — ${exam.title}`
          }
          maxWidth="max-w-5xl"
          onClose={() => setViewerModalOpen(false)}
        >
          <div className="space-y-3">
            {/* Top Responsive Control Bar */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3 border-b border-hairline text-xs">
              {/* Left: Badge & Info */}
              <div className="flex items-center gap-2 flex-wrap">
                <BadgePill
                  label={viewerArtifactType === "QUESTION_PAPER" ? "Question Paper" : "Official Answer Key"}
                  color={viewerArtifactType === "QUESTION_PAPER" ? "sky" : "green"}
                />
                <span className="text-ink-muted text-[11px] font-medium">
                  {exam.title} • {exam.subject}
                </span>
              </div>

              {/* Center: Pagination & Zoom Controls */}
              <div className="flex items-center gap-2 justify-between md:justify-center flex-wrap">
                {/* Pagination Controls */}
                <div className="flex items-center gap-1 bg-surface border border-hairline rounded-lg p-0.5 shadow-xs">
                  <button
                    onClick={() => {
                      if (viewerPage > 1) {
                        setViewerPageImgLoading(true);
                        setViewerPage((p) => p - 1);
                      }
                    }}
                    disabled={viewerPage <= 1 || viewerLoading}
                    className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas-soft disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="Previous Page"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-2 text-[11px] font-semibold text-ink select-none min-w-[70px] text-center">
                    {viewerLoading ? "Loading..." : `Page ${viewerPage} of ${viewerTotalPages}`}
                  </span>
                  <button
                    onClick={() => {
                      if (viewerPage < viewerTotalPages) {
                        setViewerPageImgLoading(true);
                        setViewerPage((p) => p + 1);
                      }
                    }}
                    disabled={viewerPage >= viewerTotalPages || viewerLoading}
                    className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas-soft disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="Next Page"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-1 bg-surface border border-hairline rounded-lg p-0.5 shadow-xs">
                  <button
                    onClick={() => setViewerZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(1))))}
                    className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors"
                    title="Zoom Out"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-1 text-[11px] font-medium text-ink-muted min-w-[36px] text-center select-none">
                    {Math.round(viewerZoom * 100)}%
                  </span>
                  <button
                    onClick={() => setViewerZoom((z) => Math.min(2.5, Number((z + 0.2).toFixed(1))))}
                    className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors"
                    title="Zoom In"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                  {viewerZoom !== 1.0 && (
                    <button
                      onClick={() => setViewerZoom(1.0)}
                      className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors"
                      title="Reset Zoom"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-1.5 shrink-0 justify-end">
                <a
                  href={`${API_BASE}/api/v1/exams/${exam.id}/${viewerArtifactType === "QUESTION_PAPER" ? "question-paper" : "answer-key"}?token=${getAuthToken() || ""}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:text-ink bg-surface border border-hairline rounded-lg hover:bg-canvas-soft transition-colors shadow-xs"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Open in Tab</span>
                </a>
                <a
                  href={`${API_BASE}/api/v1/exams/${exam.id}/${viewerArtifactType === "QUESTION_PAPER" ? "question-paper" : "answer-key"}?token=${getAuthToken() || ""}`}
                  download={`${viewerArtifactType === "QUESTION_PAPER" ? "question_paper" : "answer_key"}_${exam.id}.pdf`}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-ink-secondary hover:text-ink bg-surface border border-hairline rounded-lg hover:bg-canvas-soft transition-colors shadow-xs"
                >
                  <Download className="h-3 w-3" />
                  <span>Download</span>
                </a>
                <ButtonUtility size="sm" onClick={() => setViewerModalOpen(false)}>
                  Close
                </ButtonUtility>
              </div>
            </div>

            {/* Document Render Canvas */}
            <div className="w-full h-[68vh] md:h-[72vh] rounded-xl border border-hairline bg-canvas-soft overflow-auto relative p-3 sm:p-5 flex flex-col items-center justify-start shadow-inner">
              {viewerLoading ? (
                <div className="flex flex-col items-center justify-center m-auto py-16 gap-3">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <p className="text-xs font-medium text-ink-secondary">
                    Rendering high-resolution document pages...
                  </p>
                </div>
              ) : !viewerHasDoc || viewerError ? (
                <div className="flex flex-col items-center justify-center m-auto py-16 gap-3 max-w-sm text-center">
                  <AlertCircle className="h-8 w-8 text-amber-500" />
                  <p className="text-sm font-semibold text-ink">
                    {viewerError || "Document not available for inline preview."}
                  </p>
                  <p className="text-xs text-ink-muted">
                    You can still download or open the original document directly.
                  </p>
                  <a
                    href={`${API_BASE}/api/v1/exams/${exam.id}/${viewerArtifactType === "QUESTION_PAPER" ? "question-paper" : "answer-key"}?token=${getAuthToken() || ""}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg shadow-sm hover:bg-primary-hover transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Original PDF</span>
                  </a>
                </div>
              ) : (
                <div className="w-full flex flex-col items-center justify-start transition-all duration-200">
                  <div
                    className="bg-white rounded-lg shadow-md border border-hairline overflow-hidden relative transition-transform duration-150 origin-top"
                    style={{
                      width: `${Math.round(viewerZoom * 100)}%`,
                      maxWidth: viewerZoom <= 1 ? "100%" : "none",
                    }}
                  >
                    {viewerPageImgLoading && (
                      <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center z-10">
                        <Loader2 className="h-6 w-6 text-primary animate-spin" />
                      </div>
                    )}
                    <img
                      key={`${exam.id}_${viewerArtifactType}_${viewerPage}`}
                      src={api.getExamArtifactPageUrl(
                        exam.id,
                        viewerArtifactType === "QUESTION_PAPER" ? "question-paper" : "answer-key",
                        viewerPage
                      )}
                      alt={`Page ${viewerPage}`}
                      className="w-full h-auto block select-none pointer-events-auto"
                      onLoad={() => setViewerPageImgLoading(false)}
                      onError={() => {
                        setViewerPageImgLoading(false);
                        setViewerError("Failed to load page image. Please try downloading the PDF.");
                      }}
                    />
                  </div>

                  {/* Floating Mobile Page Pill */}
                  {viewerTotalPages > 1 && (
                    <div className="sticky bottom-3 mt-4 flex md:hidden items-center gap-3 bg-surface/90 backdrop-blur-md border border-hairline px-3 py-1.5 rounded-full shadow-lg z-20 text-xs">
                      <button
                        onClick={() => {
                          if (viewerPage > 1) {
                            setViewerPageImgLoading(true);
                            setViewerPage((p) => p - 1);
                          }
                        }}
                        disabled={viewerPage <= 1}
                        className="p-1 rounded text-ink-muted hover:text-ink disabled:opacity-30"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="font-semibold text-ink text-[11px]">
                        {viewerPage} / {viewerTotalPages}
                      </span>
                      <button
                        onClick={() => {
                          if (viewerPage < viewerTotalPages) {
                            setViewerPageImgLoading(true);
                            setViewerPage((p) => p + 1);
                          }
                        }}
                        disabled={viewerPage >= viewerTotalPages}
                        className="p-1 rounded text-ink-muted hover:text-ink disabled:opacity-30"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </ModalCard>
      )}

      {/* MODAL: Open / Reopen Submission Window */}
      {openWindowModalOpen && exam && (
        <ModalCard
          title={
            windowStatus?.has_window
              ? `Reopen Window: ${exam.title}`
              : `Open Window: ${exam.title}`
          }
          onClose={() => !isOpeningWindow && setOpenWindowModalOpen(false)}
        >
          <form onSubmit={handleOpenWindowSubmit} className="space-y-4">
            <p className="text-xs text-ink-muted">
              Configure submission window duration and target student scope. Once activated, the server-enforced countdown timer begins immediately for all eligible students.
            </p>

            <FormInput
              label="Session Note / Audit Reason"
              placeholder="e.g. Scheduled examination upload, network delay grace"
              value={windowReason}
              onChange={(e) => setWindowReason(e.target.value)}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Duration</label>
                <select
                  value={windowDuration}
                  onChange={(e) => setWindowDuration(e.target.value)}
                  disabled={isOpeningWindow}
                  className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
                >
                  <option value="5">5 Minutes</option>
                  <option value="10">10 Minutes</option>
                  <option value="15">15 Minutes</option>
                  <option value="30">30 Minutes</option>
                  <option value="45">45 Minutes</option>
                  <option value="60">60 Minutes</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Target Scope</label>
                <select
                  value={windowScope}
                  onChange={(e) => setWindowScope(e.target.value)}
                  disabled={isOpeningWindow}
                  className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
                >
                  <option value="ALL_STUDENTS">All Students (Replacements Allowed)</option>
                  <option value="UNSUBMITTED_ONLY">Unsubmitted Students Only</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <ButtonUtility
                type="button"
                onClick={() => setOpenWindowModalOpen(false)}
                disabled={isOpeningWindow}
              >
                Cancel
              </ButtonUtility>
              <ButtonPrimary
                type="submit"
                isLoading={isOpeningWindow}
                disabled={isOpeningWindow || !windowReason.trim()}
              >
                {isOpeningWindow
                  ? "Opening Window..."
                  : windowStatus?.has_window
                  ? "Confirm Reopening"
                  : "Open Window"}
              </ButtonPrimary>
            </div>
          </form>
        </ModalCard>
      )}

      {/* MODAL: Delete Exam Permanently */}
      {deleteExamModalOpen && exam && (
        <ModalCard
          title="Delete Examination Permanently"
          onClose={() => !isDeletingExam && setDeleteExamModalOpen(false)}
        >
          <div className="space-y-4">
            {/* Warning Banner */}
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200/80 text-red-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-red-700">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                <span>CRITICAL WARNING: Irreversible Cascade Deletion</span>
              </div>
              <p className="text-xs text-red-800 leading-relaxed">
                Deleting <span className="font-bold underline">{exam.title}</span> will permanently wipe out all related academic and evaluation assets across the entire system:
              </p>
              <ul className="text-xs text-red-800 list-disc list-inside space-y-1 pl-1">
                <li><span className="font-semibold">All Uploaded Answer Sheets:</span> Physical PDF and rendered image files permanently purged from Database and Cloud Storage / CDN.</li>
                <li><span className="font-semibold">All Evaluation Scores & Marks:</span> Criterion-level marks, AI feedback, question breakdowns, and marks ledgers.</li>
                <li><span className="font-semibold">Exam Artifacts:</span> Question paper, answer key master documents, and rubric matrices.</li>
                <li><span className="font-semibold">Student Access & Revaluations:</span> Submission windows, student portal publications, and dispute logs.</li>
              </ul>
              <p className="text-xs font-bold text-red-700 pt-1">
                This action cannot be undone. No recovery or rollback is possible.
              </p>
            </div>

            {/* Confirmation Input */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-ink">
                To proceed, type <span className="font-mono font-bold text-red-600 bg-red-50 px-1 py-0.5 rounded border border-red-200">DELETE</span> in the box below:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                disabled={isDeletingExam}
                className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-xs font-mono text-ink focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
                autoFocus
              />
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
              <ButtonUtility
                type="button"
                onClick={() => setDeleteExamModalOpen(false)}
                disabled={isDeletingExam}
              >
                Cancel
              </ButtonUtility>
              <button
                type="button"
                onClick={handleDeleteExam}
                disabled={isDeletingExam || deleteConfirmText.trim().toUpperCase() !== "DELETE"}
                className="inline-flex items-center justify-center px-4 py-2 rounded-md text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs cursor-pointer"
              >
                {isDeletingExam ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Purging Exam & CDN Files...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Permanently Delete Exam
                  </>
                )}
              </button>
            </div>
          </div>
        </ModalCard>
      )}
    </div>
  );
}
