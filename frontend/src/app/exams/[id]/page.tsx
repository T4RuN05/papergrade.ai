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
  MoreHorizontal,
  KeyRound,
  FileSpreadsheet,
} from "lucide-react";
import { api, API_BASE, getAuthToken, getCached, clearApiCache } from "@/lib/api";
import { Exam } from "@/lib/types";
import { useSetBreadcrumbs } from "@/lib/BreadcrumbContext";
import { useToast } from "@/lib/ToastContext";
import { useTenant } from "@/lib/TenantContext";
import {
  ExamRankedTable,
  computeRankedSubmissions,
  exportRankedStandingsCSV,
  exportRosterCSV,
} from "@/components/ExamRankedTable";
import { ArtifactViewerModal } from "@/components/ArtifactViewerModal";
import {
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
  StatusWell,
  ExamDetailSkeleton,
  ModalCard,
  FormInput,
  useConfirm,
  AppleSelect,
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
  const [rankedBracket, setRankedBracket] = useState<"ALL" | "TOP10" | "DISTINCTION" | "PASS">("ALL");
  const [sortBy, setSortBy] = useState<"roll" | "marks_desc" | "marks_asc" | "name">("roll");
  const [submissionViewMode, setSubmissionViewMode] = useState<"roster" | "ranked">("roster");
  const [isBulkClearing, setIsBulkClearing] = useState(false);
  const [clearingSubId, setClearingSubId] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close moreMenu dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    if (moreMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [moreMenuOpen]);

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

  const handleExportRosterCSV = () => {
    if (!exam) return;
    const ok = exportRosterCSV(exam.title, filteredSubmissions, exam.total_marks || 25);
    if (!ok) {
      toast.warning("No submission records available to export.", { title: "Export CSV" });
      return;
    }
    toast.success("Roster ledger exported successfully.", { title: "CSV Download" });
  };

  const handleExportRankedCSV = () => {
    if (!exam) return;
    const rankedData = computeRankedSubmissions(submissions as any, exam.total_marks || 25);
    const ok = exportRankedStandingsCSV(exam.title, rankedData);
    if (!ok) {
      toast.warning("No evaluated student scores available to export.", { title: "Export CSV" });
      return;
    }
    toast.success("Ranked standings exported successfully.", { title: "CSV Download" });
  };

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
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800/40">
          <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          COMPLETED
        </span>
      );
    }
    if (s === "PROCESSING") {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400 px-2.5 py-1 rounded-md border border-blue-200 dark:border-blue-800/40">
          <RefreshCw className="h-3 w-3 animate-spin text-blue-600 dark:text-blue-400" />
          PROCESSING
        </span>
      );
    }
    if (s === "QUEUED") {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-800/40">
          <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
          QUEUED
        </span>
      );
    }
    if (s === "FAILED") {
      return (
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-400 px-2.5 py-1 rounded-md border border-red-200 dark:border-red-800/40"
          title={errorDetails || "Evaluation failed. Click Retry Evaluation to re-enqueue."}
        >
          <AlertCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
          FAILED
        </span>
      );
    }
    if (s === "NEEDS_REVIEW") {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-purple-700 bg-purple-50 dark:bg-purple-950/30 dark:text-purple-400 px-2.5 py-1 rounded-md border border-purple-200 dark:border-purple-800/40">
          <Eye className="h-3 w-3 text-purple-600 dark:text-purple-400" />
          NEEDS REVIEW
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-50 dark:bg-white/5 dark:text-slate-300 px-2.5 py-1 rounded-md border border-slate-200 dark:border-white/10">
        <FileText className="h-3 w-3 text-slate-500" />
        {s}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Main Examination Header Card */}
      <FeatureCard className="p-5 sm:p-7 space-y-5 border-hairline bg-surface">
        {/* Top Context Breadcrumb Line */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ink">{exam.subject}</span>
            <span className="text-ink-faint">•</span>
            <span>{examInstitute?.name || "Academic Institute"}{examBranch ? ` (${examBranch.name})` : ""}</span>
            <span className="text-ink-faint">•</span>
            <span>
              {exam.batch_scope === "SPECIFIC" && exam.scoped_batches && exam.scoped_batches.length > 0
                ? exam.scoped_batches.length === 1
                  ? `Batch: ${exam.scoped_batches[0].name}`
                  : `Batches: ${exam.scoped_batches.map((b) => b.name).join(", ")}`
                : batchInfo
                ? `Batch: ${batchInfo.name}`
                : "Scope: Whole Branch"}
            </span>
          </div>
          <span className="font-mono text-[11px] text-ink-muted">
            ID: <strong className="text-ink font-semibold">{exam.id.slice(0, 8)}...</strong>
          </span>
        </div>

        {/* Title, Badges, and Action Buttons Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-3 border-t border-hairline">
          {/* Title & Context */}
          <div className="space-y-1.5 max-w-xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
                {exam.title}
              </h1>

              {/* Status Badges */}
              {isPublished ? (
                <BadgePill label="Results Published" color="green" />
              ) : isEvaluating ? (
                <BadgePill label={`Evaluating (${stats.completed}/${stats.total})`} color="purple" />
              ) : isWindowOpen ? (
                <BadgePill label={`Window Active (${Math.ceil((windowStatus?.seconds_remaining || 0) / 60)}m)`} color="green" />
              ) : stats.completed > 0 ? (
                <BadgePill label={`${stats.completed}/${stats.total} Graded`} color="orange" />
              ) : null}

              <BadgePill
                label={isApproved ? "Rubric Locked" : exam.current_rubric_version_id ? "Rubric Draft" : "Awaiting Key"}
                color={isApproved ? "teal" : exam.current_rubric_version_id ? "orange" : "gray"}
              />
            </div>

            <p className="text-xs text-ink-muted leading-relaxed">
              Assessment ledger for {exam.subject}. Max achievable score: <strong className="font-mono font-bold text-ink">{exam.total_marks && exam.total_marks > 0 ? exam.total_marks : "—"} marks</strong> • <strong className="font-mono font-bold text-ink">{submissions.length}</strong> total scripts enrolled.
            </p>
          </div>

          {/* Proper Rectangular Action Buttons Toolbar */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Primary Action Button */}
            {isEvaluating ? (
              <div className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/20 shadow-2xs">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                <span>Evaluating ({stats.completed}/{stats.total})</span>
              </div>
            ) : unprocessedCount > 0 ? (
              <ButtonPrimary
                size="sm"
                onClick={handleStartEvaluation}
                isLoading={isStartingEval}
                disabled={!canStartEvaluation}
                title={
                  isWindowOpen
                    ? "Submission window is active. Please wait until window closes."
                    : !hasAnswerKey
                    ? "Upload Official Answer Key first."
                    : !isApproved
                    ? "Review & approve Rubric first."
                    : "Enqueue accepted papers for automated evaluation"
                }
                className="h-9 px-3.5 rounded-md text-xs font-semibold shadow-xs"
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                {hasFailedPapers ? `Retry Evaluation (${unprocessedCount})` : `Start Evaluation (${unprocessedCount})`}
              </ButtonPrimary>
            ) : stats.completed > 0 && !isPublished ? (
              <ButtonPrimary
                size="sm"
                onClick={handlePublishResults}
                isLoading={isPublishing}
                className="btn-glass-emerald h-9 px-3.5 rounded-md text-xs font-semibold shadow-xs text-white"
              >
                <Check className="h-3.5 w-3.5 mr-1.5" />
                Publish Results
              </ButtonPrimary>
            ) : isPublished ? (
              <div className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                Published
              </div>
            ) : null}

            {/* Standard Navigation Utility Buttons */}
            <ButtonUtility
              size="sm"
              href={`/exams/${exam.id}/rubric`}
              className="h-9 px-3.5 rounded-md text-xs font-semibold"
            >
              <BookOpen className="h-3.5 w-3.5 mr-1.5 text-primary shrink-0" />
              <span>Rubric & Criteria</span>
            </ButtonUtility>

            <ButtonUtility
              size="sm"
              href={`/analytics?exam_id=${exam.id}`}
              className="h-9 px-3.5 rounded-md text-xs font-semibold"
            >
              <BarChart3 className="h-3.5 w-3.5 mr-1.5 text-teal-600 shrink-0" />
              <span>Analytics</span>
            </ButtonUtility>

            <ButtonUtility
              size="sm"
              href={`/marks?exam_id=${exam.id}`}
              className="h-9 px-3.5 rounded-md text-xs font-semibold"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-purple-600 shrink-0" />
              <span>Marks Ledger</span>
            </ButtonUtility>

            {/* Window Toggle Action */}
            {isWindowOpen ? (
              <ButtonUtility
                variant="danger"
                size="sm"
                onClick={handleHardCloseWindow}
                disabled={isClosingWindow}
                className="h-9 px-3 rounded-md text-xs font-semibold"
                title="Immediately terminate student upload window"
              >
                <Square className="h-3.5 w-3.5 mr-1.5 text-red-600 fill-red-600" />
                <span>{isClosingWindow ? "Closing..." : "Close Window"}</span>
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
                className="h-9 px-3 rounded-md text-xs font-semibold text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800"
              >
                <Clock className="h-3.5 w-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" />
                <span>Open Window</span>
              </ButtonUtility>
            )}

            {/* Delete Exam Action */}
            {canDeleteExam && (
              <ButtonUtility
                variant="danger"
                size="sm"
                onClick={() => {
                  setDeleteConfirmText("");
                  setDeleteExamModalOpen(true);
                }}
                className="h-9 px-3 rounded-md text-xs font-semibold"
                title="Permanently delete this exam"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5 text-red-600" />
                <span>Delete Exam</span>
              </ButtonUtility>
            )}
          </div>
        </div>

        {/* Academic Details & Materials Section: Organized 3-Column Information Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs bg-canvas-soft rounded-lg p-3.5 sm:p-4 border border-hairline">
          <div className="flex items-start gap-2.5">
            <Building2 className="h-4 w-4 text-ink-muted mt-0.5 shrink-0" />
            <div>
              <span className="text-ink-muted block text-[11px] font-medium">Academic Institute & Branch</span>
              <span className="font-semibold text-ink text-xs sm:text-[13px]">{examInstitute?.name || "Academic Institute"}</span>
              <span className="text-ink-secondary block text-[11px] mt-0.5">
                {examBranch ? `${examBranch.name} (${examBranch.city || "Mumbai"})` : "Branch Campus"}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <Layers className="h-4 w-4 text-ink-muted mt-0.5 shrink-0" />
            <div>
              <span className="text-ink-muted block text-[11px] font-medium">Linked Batch</span>
              {batchInfo ? (
                <Link
                  href="/branch/batches"
                  className="font-semibold text-primary hover:underline inline-flex items-center gap-1 text-xs sm:text-[13px]"
                >
                  {batchInfo.name} {batchInfo.code ? `(${batchInfo.code})` : ""}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : (
                <span className="text-ink-secondary font-medium text-xs sm:text-[13px]">Branch-wide Assessment</span>
              )}
              <span className="text-ink-muted block text-[11px] mt-0.5">
                {batchInfo?.academic_year ? `Academic Year ${batchInfo.academic_year}` : "All Branch Batches"}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <FileText className="h-4 w-4 text-ink-muted mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-ink-muted block text-[11px] font-medium">Exam Documents & Key</span>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {/* Question Paper Button */}
                {isUploadingQp ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-md">
                    <RefreshCw className="h-3 w-3 animate-spin text-amber-600 shrink-0" />
                    <span>Processing QP...</span>
                  </span>
                ) : exam.question_paper_path ? (
                  <button
                    type="button"
                    onClick={() => handleViewArtifact("QUESTION_PAPER")}
                    className="btn-glass-utility h-8 px-2.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 text-primary hover:border-primary transition-colors cursor-pointer shadow-2xs"
                    title="View Question Paper"
                  >
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span>Question Paper</span>
                    <Eye className="h-3 w-3 text-ink-muted" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setUploadQpOpen(true)}
                    className="btn-glass-utility h-8 px-2.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:border-amber-400 transition-colors cursor-pointer shadow-2xs"
                    title="Upload Question Paper"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Upload Question Paper</span>
                  </button>
                )}

                {/* Answer Key Button */}
                {isUploadingAk ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-md">
                    <RefreshCw className="h-3 w-3 animate-spin text-emerald-600 shrink-0" />
                    <span>Processing Key...</span>
                  </span>
                ) : exam.answer_key_path ? (
                  <button
                    type="button"
                    onClick={() => handleViewArtifact("ANSWER_KEY")}
                    className="btn-glass-utility h-8 px-2.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 hover:border-emerald-400 transition-colors cursor-pointer shadow-2xs"
                    title="View Answer Key"
                  >
                    <KeyRound className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Answer Key</span>
                    <Eye className="h-3 w-3 text-ink-muted" />
                  </button>
                ) : currentUser?.role === "ROOT_ADMIN" ? (
                  <button
                    type="button"
                    onClick={() => setUploadAkOpen(true)}
                    className="btn-glass-utility h-8 px-2.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:border-amber-400 transition-colors cursor-pointer shadow-2xs"
                    title="Upload Official Answer Key"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Upload Answer Key</span>
                  </button>
                ) : (
                  <span className="text-ink-faint text-xs py-1">Key: Pending Admin</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Active Submission Window Live Countdown & Hard Close Banner */}
        {isWindowOpen && (
          <StatusWell
            variant="amber"
            icon={<Clock className="h-4 w-4 text-amber-600 animate-pulse" />}
            title={
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-[#7a4e18] dark:text-[#e5ad68]">
                  Submission Window Active
                </span>
                <span className="text-[11px] font-mono font-semibold bg-surface px-2 py-0.5 rounded border border-hairline text-ink">
                  ⏱ {formatTimer(windowStatus?.seconds_remaining || 0)} remaining
                </span>
              </div>
            }
            description={`Students can submit or replace papers until the timer expires. ${submissions.length} submission(s) currently received.`}
            badge={
              <ButtonUtility
                variant="danger"
                size="sm"
                onClick={handleHardCloseWindow}
                disabled={isClosingWindow}
                className="cursor-pointer shadow-2xs"
              >
                <Square className="h-3.5 w-3.5 text-red-600 fill-red-600 mr-1" />
                {isClosingWindow ? "Closing..." : "Close Window"}
              </ButtonUtility>
            }
          />
        )}

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
        <div className="rounded-lg border border-hairline bg-surface p-4 text-xs space-y-3 shadow-2xs relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500/80 dark:bg-amber-400/70" />
          <div className="flex items-center justify-between pl-1">
            <span className="font-bold text-ink flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Evaluation Queue Prerequisites Checklist {unprocessedCount > 0 ? `(${unprocessedCount} papers stored)` : "(Awaiting Submissions & Key)"}
            </span>
            <span className="text-[11px] font-mono text-ink-muted">Evaluation Invariants</span>
          </div>
          <p className="text-[11px] text-ink-muted leading-relaxed pl-1">
            Per examination guidelines, automated evaluation cannot begin while students are still uploading or until the official answer key and locked rubric are verified.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-[11px] pl-1">
            <div className="p-2.5 rounded-lg border border-hairline bg-canvas-soft flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`h-4 w-4 shrink-0 ${!isWindowOpen ? "text-[#1e613b] dark:text-[#86d4a4]" : "text-[#7a4e18] dark:text-[#e5ad68]"}`} />
                <span className="font-medium text-ink">1. Submission Window</span>
              </div>
              <BadgePill label={!isWindowOpen ? "Closed" : "Active"} color={!isWindowOpen ? "green" : "orange"} />
            </div>

            <div className="p-2.5 rounded-lg border border-hairline bg-canvas-soft flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`h-4 w-4 shrink-0 ${hasAnswerKey ? "text-[#1e613b] dark:text-[#86d4a4]" : "text-[#7a4e18] dark:text-[#e5ad68]"}`} />
                <span className="font-medium text-ink">2. Official Answer Key</span>
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
      <FeatureCard className="p-0 overflow-hidden border-hairline bg-surface">
        {/* TOP UNIFIED HEADER TOOLBAR - LOCKED POSITION ACROSS BOTH TABS */}
        <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-hairline bg-surface">
          {/* Left: View Switcher Segmented Tabs */}
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center p-0.5 rounded-md bg-canvas-soft border border-hairline">
              <button
                type="button"
                onClick={() => setSubmissionViewMode("roster")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                  submissionViewMode === "roster"
                    ? "bg-surface text-ink shadow-2xs border border-hairline/80"
                    : "text-ink-muted hover:text-ink border border-transparent"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Roster Ledger ({submissions.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSubmissionViewMode("ranked")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                  submissionViewMode === "ranked"
                    ? "bg-surface text-ink shadow-2xs border border-hairline/80"
                    : "text-ink-muted hover:text-ink border border-transparent"
                }`}
              >
                <Trophy className="h-3.5 w-3.5 text-amber-600" />
                <span>Ranked Standings</span>
              </button>
            </div>
          </div>

          {/* Right: Unified Controls (Search, Filter, Sort, Export, Refresh) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search student or roll #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-7 h-9 text-xs rounded-md border border-hairline bg-canvas-soft/80 hover:bg-canvas-soft focus:bg-surface focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-ink placeholder:text-ink-muted w-44 sm:w-52 transition-all shadow-2xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-ink-muted hover:text-ink rounded cursor-pointer"
                  title="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Filter Dropdown (Custom Apple-Grade Dropdown) */}
            {submissionViewMode === "roster" ? (
              <AppleSelect
                value={scoreFilter}
                onChange={(val: any) => setScoreFilter(val)}
                options={[
                  { value: "ALL", label: "All Scores" },
                  { value: "TOP", label: "Distinction (≥75%)" },
                  { value: "MID", label: "Passing (40% - 74%)" },
                  { value: "LOW", label: "Needs Attention (<40%)" },
                ]}
              />
            ) : (
              <AppleSelect
                value={rankedBracket}
                onChange={(val: any) => setRankedBracket(val)}
                options={[
                  { value: "ALL", label: `All Ranked (${stats.completed})` },
                  { value: "TOP10", label: "Top 10" },
                  { value: "DISTINCTION", label: "Distinction (≥75%)" },
                  { value: "PASS", label: "Passing (40% - 74%)" },
                ]}
              />
            )}

            {/* Sort Filter (Roster view only) */}
            {submissionViewMode === "roster" && (
              <AppleSelect
                value={sortBy}
                onChange={(val: any) => setSortBy(val)}
                options={[
                  { value: "roll", label: "Sort: Roll Number" },
                  { value: "marks_desc", label: "Sort: Highest Marks" },
                  { value: "marks_asc", label: "Sort: Lowest Marks" },
                  { value: "name", label: "Sort: Student Name" },
                ]}
              />
            )}

            {/* Export CSV Button */}
            <button
              type="button"
              onClick={submissionViewMode === "roster" ? handleExportRosterCSV : handleExportRankedCSV}
              className="btn-glass-utility h-9 px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title={submissionViewMode === "roster" ? "Export roster list as CSV" : "Export ranked leaderboard as CSV"}
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => {
                clearApiCache(`exams:detail:${examId}`);
                clearApiCache(`submissions:list:${examId}`);
                loadExamData(false, true);
              }}
              disabled={isRefreshing}
              className="btn-glass-utility h-9 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Refresh ledger in real time"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin text-primary" : "text-ink-muted"}`} />
              <span className="hidden sm:inline">{isRefreshing ? "Updating..." : "Refresh"}</span>
            </button>

            {/* Bulk Unflag Button when any papers need review */}
            {needsReviewCount > 0 && (
              <button
                type="button"
                onClick={handleClearAllExamReviews}
                disabled={isBulkClearing}
                className="h-9 px-2.5 rounded-md text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                title="Unflag all flagged papers in this exam at once and mark them Completed"
              >
                {isBulkClearing ? (
                  <RefreshCw className="h-3 w-3 animate-spin text-purple-600" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 text-purple-600" />
                )}
                <span>Unflag ({needsReviewCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* TABLE CONTENT: Instant swap with zero vertical jump */}
        {submissionViewMode === "ranked" ? (
          <ExamRankedTable
            examId={examId}
            examTitle={exam.title}
            maxMarks={exam.total_marks || 25}
            submissions={submissions}
            hideSummaryCards={true}
            hideToolbar={true}
            searchTerm={searchTerm}
            bracketFilter={rankedBracket}
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-canvas-soft border-b border-hairline text-ink-muted font-medium text-[11px] uppercase tracking-wider">
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
        <ArtifactViewerModal
          isOpen={viewerModalOpen}
          onClose={() => setViewerModalOpen(false)}
          examId={exam.id}
          examTitle={exam.title}
          examSubject={exam.subject}
          initialArtifact={viewerArtifactType === "QUESTION_PAPER" ? "question-paper" : "answer-key"}
          hasQuestionPaper={Boolean(exam.question_paper_path)}
          hasAnswerKey={Boolean(exam.answer_key_path)}
          isExamDocumentPurged={Boolean((exam as any).is_document_purged)}
        />
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
                <AppleSelect
                  value={windowDuration}
                  onChange={(val) => setWindowDuration(val)}
                  disabled={isOpeningWindow}
                  options={[
                    { value: "5", label: "5 Minutes" },
                    { value: "10", label: "10 Minutes" },
                    { value: "15", label: "15 Minutes" },
                    { value: "30", label: "30 Minutes" },
                    { value: "45", label: "45 Minutes" },
                    { value: "60", label: "60 Minutes" },
                  ]}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Target Scope</label>
                <AppleSelect
                  value={windowScope}
                  onChange={(val) => setWindowScope(val)}
                  disabled={isOpeningWindow}
                  options={[
                    { value: "ALL_STUDENTS", label: "All Students (Replacements Allowed)" },
                    { value: "UNSUBMITTED_ONLY", label: "Unsubmitted Students Only" },
                  ]}
                  className="w-full"
                />
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
