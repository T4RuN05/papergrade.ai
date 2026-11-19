"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Layers,
  BookOpen,
  FileText,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Sparkles,
  Download,
  Eye,
  Trophy,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { api, getAuthToken } from "@/lib/api";
import { useToast } from "@/lib/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { useQueryClient } from "@tanstack/react-query";
import { useStudentPortalState } from "@/lib/queries";
import {
  FeatureCard,
  StudentPortalSkeleton,
  PastExamsCardsSkeleton,
} from "@/components/ui";

import { usePortalTabSwipe } from "@/hooks/usePortalTabSwipe";
import { StudentProfileHeader } from "@/components/student/StudentProfileHeader";
import { StudentNotificationBanner } from "@/components/student/StudentNotificationBanner";
import { StudentAcademicCounters } from "@/components/student/StudentAcademicCounters";
import { StudentMarksTrajectory } from "@/components/student/StudentMarksTrajectory";
import { MultiWindowSelector } from "@/components/student/MultiWindowSelector";
import { ActiveExamSubmissionCard } from "@/components/student/ActiveExamSubmissionCard";
import { PastExamCard, PAST_EXAMS_BATCH_SIZE } from "@/components/student/PastExamCard";
import { PastExamsToolbar } from "@/components/student/PastExamsToolbar";
import { StudentSupportCard } from "@/components/student/StudentSupportCard";

import { StudentQuestionBreakdownModal } from "@/components/student/modals/StudentQuestionBreakdownModal";
import { StudentRankingsModal } from "@/components/student/modals/StudentRankingsModal";
import { StudentRevaluationModal } from "@/components/student/modals/StudentRevaluationModal";

// Heavy secondary modals chunked on-demand
const ReportIssueModal = dynamic(
  () => import("@/components/ReportIssueModal").then((mod) => mod.ReportIssueModal),
  { ssr: false }
);
const ArtifactViewerModal = dynamic(
  () => import("@/components/ArtifactViewerModal").then((mod) => mod.ArtifactViewerModal),
  { ssr: false }
);

export default function StudentPortalPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Guard: token check
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.push("/auth/login?role=student&redirect=/student/portal");
    }
  }, [router]);

  // TanStack Query: Consolidated Student Portal State with Weak ETag 304 fast-paths
  const {
    data: portalState,
    isLoading: isPortalLoading,
    refetch: refetchPortalState,
  } = useStudentPortalState();

  const user = portalState?.user || null;
  const rawSubmissions = useMemo(() => {
    const raw = (portalState?.submissions || []).filter(
      (s: any) => s.submission_status !== "SUPERSEDED"
    );
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const s of raw) {
      const key = s.exam_id || s.id;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(s);
      }
    }
    return deduped;
  }, [portalState?.submissions]);

  const [localSubmissions, setLocalSubmissions] = useState<any[]>([]);
  useEffect(() => {
    if (rawSubmissions.length > 0) {
      setLocalSubmissions(rawSubmissions);
    }
  }, [rawSubmissions]);

  const activeWindows = useMemo(() => {
    if (portalState?.active_windows && portalState.active_windows.length > 0) {
      return portalState.active_windows;
    }
    if (portalState?.active_exam && portalState?.window_status) {
      return [{ exam: portalState.active_exam, window_status: portalState.window_status }];
    }
    return [];
  }, [portalState]);

  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  useEffect(() => {
    if (activeWindows.length > 0) {
      setSelectedExamId((prev) => {
        if (prev && activeWindows.some((w: any) => w.exam?.id === prev)) return prev;
        return activeWindows[0].exam.id;
      });
    } else {
      setSelectedExamId(null);
    }
  }, [activeWindows]);

  const currentActiveItem =
    activeWindows.find((w: any) => w.exam?.id === selectedExamId) || activeWindows[0] || null;
  const activeExam = currentActiveItem?.exam || null;
  const windowStatus = currentActiveItem?.window_status || null;

  const activeExamSubmission = useMemo(() => {
    if (!activeExam) return null;
    return (
      localSubmissions.find(
        (s) => s.exam_id === activeExam.id && s.submission_status !== "SUPERSEDED"
      ) || null
    );
  }, [localSubmissions, activeExam]);

  // Modal states
  const [breakdownModalOpen, setBreakdownModalOpen] = useState(false);
  const [breakdownSubmission, setBreakdownSubmission] = useState<any>(null);
  const [isBreakdownLoadingDetails, setIsBreakdownLoadingDetails] = useState(false);

  const [rankingsModalOpen, setRankingsModalOpen] = useState(false);
  const [rankingsExam, setRankingsExam] = useState<{ id: string; title: string; max_marks?: number } | null>(null);
  const [rankingsData, setRankingsData] = useState<any[]>([]);
  const [isRankingsLoading, setIsRankingsLoading] = useState(false);

  const [revalModalOpen, setRevalModalOpen] = useState(false);
  const [revalSubmission, setRevalSubmission] = useState<any>(null);

  const [reportModalOpen, setReportModalOpen] = useState(false);

  const [artifactModalOpen, setArtifactModalOpen] = useState(false);
  const [artifactModalExam, setArtifactModalExam] = useState<any>(null);
  const [artifactModalInitialTab, setArtifactModalInitialTab] = useState<"question-paper" | "answer-key">("question-paper");

  // Portal swipe & tab gesture hook
  const isAnyModalOpen =
    breakdownModalOpen ||
    rankingsModalOpen ||
    revalModalOpen ||
    reportModalOpen ||
    artifactModalOpen;

  const {
    activeTab,
    handleTabSwitch,
    tabTrackRef,
    tabIndicatorPillRef,
    tabContainerRef,
    isTouchDragging,
    isTransitioning,
    handlePortalTouchStart,
    handlePortalTouchMove,
    handlePortalTouchEnd,
  } = usePortalTabSwipe({ initialTab: "dashboard", isModalOpen: isAnyModalOpen });

  // 15-second live ticker
  const [currentTick, setCurrentTick] = useState<number>(Date.now());
  useEffect(() => {
    const ticker = setInterval(() => setCurrentTick(Date.now()), 15000);
    return () => clearInterval(ticker);
  }, []);

  const shouldShowExamWindowCard = Boolean(
    activeExam &&
      windowStatus &&
      (windowStatus.is_active ||
        (() => {
          const closedIso =
            windowStatus.grace_deadline_at ||
            windowStatus.deadline_at ||
            windowStatus.closed_at;
          if (!closedIso) return false;
          const closedTime = new Date(closedIso).getTime();
          if (isNaN(closedTime)) return false;
          const diffMs = currentTick - closedTime;
          const twoHoursMs = 2 * 60 * 60 * 1000;
          return diffMs >= 0 && diffMs <= twoHoursMs;
        })())
  );

  const pastSubmissionsList = useMemo(() => {
    let list = localSubmissions.filter((s) => s.submission_status !== "SUPERSEDED");
    if (shouldShowExamWindowCard && activeExam && activeExamSubmission) {
      list = list.filter((s) => s.exam_id !== activeExam.id);
    }
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const item of list) {
      const key = item.exam_id || item.id;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(item);
      }
    }
    return deduped;
  }, [localSubmissions, shouldShowExamWindowCard, activeExam, activeExamSubmission]);

  // Past Exams Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [examSubjectFilter, setExamSubjectFilter] = useState("ALL");
  const [examStatusFilter, setExamStatusFilter] = useState("ALL");
  const [isPastExamsFilterExpanded, setIsPastExamsFilterExpanded] = useState(false);
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});

  const uniqueExamSubjects = useMemo(() => {
    const set = new Set<string>();
    localSubmissions.forEach((s) => {
      const sub = s.exam_subject || s.subject;
      if (sub && typeof sub === "string" && sub.trim()) {
        set.add(sub.trim());
      }
    });
    return Array.from(set).sort();
  }, [localSubmissions]);

  const filteredPastSubmissions = useMemo(() => {
    return pastSubmissionsList.filter((sub) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (sub.exam_title || "").toLowerCase().includes(q);
        const subjectMatch = (sub.exam_subject || sub.subject || "").toLowerCase().includes(q);
        if (!titleMatch && !subjectMatch) return false;
      }
      if (examSubjectFilter !== "ALL") {
        const subName = sub.exam_subject || sub.subject || "";
        if (subName.toLowerCase() !== examSubjectFilter.toLowerCase()) return false;
      }
      if (examStatusFilter !== "ALL") {
        const isPublished =
          sub.publication_status === "PUBLISHED" ||
          (sub.publication_status !== "UNPUBLISHED" && Boolean(sub.exam_is_published || sub.is_published));
        if (examStatusFilter === "PUBLISHED" && !isPublished) return false;
        if (examStatusFilter === "IN_PROGRESS" && isPublished) return false;
      }
      return true;
    });
  }, [pastSubmissionsList, searchQuery, examSubjectFilter, examStatusFilter]);

  const handleToggleAllCards = (expand: boolean) => {
    const updated: Record<string, boolean> = {};
    if (expand) {
      paginatedPastExams.forEach((s) => {
        updated[s.id] = true;
      });
    }
    setExpandedCardIds(updated);
  };

  const toggleCard = useCallback((id: string) => {
    setExpandedCardIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  // Dedicated Past Exams Infinite Scrolling & API State
  const [paginatedPastExams, setPaginatedPastExams] = useState<any[]>([]);
  const [pastExamsPage, setPastExamsPage] = useState<number>(1);
  const [hasMorePastExams, setHasMorePastExams] = useState<boolean>(true);
  const [isPastExamsInitialLoading, setIsPastExamsInitialLoading] = useState<boolean>(false);
  const [isLoadingMorePastExams, setIsLoadingMorePastExams] = useState<boolean>(false);
  const [pastExamsTotal, setPastExamsTotal] = useState<number>(0);

  const isLoadingMoreRef = useRef<boolean>(false);
  const isInitialLoadingRef = useRef<boolean>(false);
  const pastExamsPageRef = useRef<number>(pastExamsPage);
  const hasMorePastExamsRef = useRef<boolean>(hasMorePastExams);
  const filteredPastSubmissionsRef = useRef<any[]>(filteredPastSubmissions);

  useEffect(() => {
    pastExamsPageRef.current = pastExamsPage;
    hasMorePastExamsRef.current = hasMorePastExams;
    filteredPastSubmissionsRef.current = filteredPastSubmissions;
  });

  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const activeFilterKeyRef = useRef<string>("");

  const fetchPastExamsPage = useCallback(
    async (pageToFetch: number, isReset = false) => {
      if (isReset) {
        setIsPastExamsInitialLoading(true);
        isInitialLoadingRef.current = true;
      } else {
        if (isLoadingMoreRef.current || !hasMorePastExamsRef.current) return;
        setIsLoadingMorePastExams(true);
        isLoadingMoreRef.current = true;
      }

      try {
        const res = await api.getStudentPastSubmissions({
          page: pageToFetch,
          limit: PAST_EXAMS_BATCH_SIZE,
          search: searchQuery,
          subject: examSubjectFilter,
          status: examStatusFilter,
        });

        if (res && Array.isArray(res.items)) {
          if (pageToFetch === 1) {
            setPaginatedPastExams(res.items);
          } else {
            setPaginatedPastExams((prev) => {
              const existingIds = new Set(prev.map((i) => i.id));
              const fresh = res.items.filter((i: any) => !existingIds.has(i.id));
              return [...prev, ...fresh];
            });
          }
          const totalCount = typeof res.total === "number" ? res.total : res.items.length;
          setPastExamsTotal(totalCount);
          const hasMore = Boolean(res.has_more);
          setHasMorePastExams(hasMore);
          hasMorePastExamsRef.current = hasMore;
          setPastExamsPage(pageToFetch);
          pastExamsPageRef.current = pageToFetch;
          return;
        }
      } catch (err) {
        console.warn("API past submissions fetch failed, falling back to cached portal data", err);
      } finally {
        if (isReset) {
          setIsPastExamsInitialLoading(false);
          isInitialLoadingRef.current = false;
        } else {
          setIsLoadingMorePastExams(false);
          isLoadingMoreRef.current = false;
        }
      }

      // Fallback: local slice
      const localSubs = filteredPastSubmissionsRef.current || [];
      const offset = (pageToFetch - 1) * PAST_EXAMS_BATCH_SIZE;
      const slice = localSubs.slice(offset, offset + PAST_EXAMS_BATCH_SIZE);
      if (pageToFetch === 1) {
        setPaginatedPastExams(slice);
      } else {
        setPaginatedPastExams((prev) => {
          const existingIds = new Set(prev.map((i) => i.id));
          const fresh = slice.filter((i: any) => !existingIds.has(i.id));
          return [...prev, ...fresh];
        });
      }
      setPastExamsTotal(localSubs.length);
      const hasMore = offset + slice.length < localSubs.length;
      setHasMorePastExams(hasMore);
      hasMorePastExamsRef.current = hasMore;
      setPastExamsPage(pageToFetch);
      pastExamsPageRef.current = pageToFetch;
    },
    [searchQuery, examSubjectFilter, examStatusFilter]
  );

  useEffect(() => {
    if (activeTab !== "exams") return;

    const filterKey = `${searchQuery.trim().toLowerCase()}|${examSubjectFilter}|${examStatusFilter}`;
    if (activeFilterKeyRef.current === filterKey && paginatedPastExams.length > 0) {
      return;
    }
    activeFilterKeyRef.current = filterKey;

    let isMounted = true;
    const timer = setTimeout(() => {
      if (!isMounted) return;
      fetchPastExamsPage(1, true);
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [activeTab, searchQuery, examSubjectFilter, examStatusFilter, fetchPastExamsPage, paginatedPastExams.length]);

  useEffect(() => {
    if (activeTab !== "exams") return;
    const node = loadMoreSentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (
          first.isIntersecting &&
          hasMorePastExamsRef.current &&
          !isLoadingMoreRef.current &&
          !isInitialLoadingRef.current
        ) {
          fetchPastExamsPage(pastExamsPageRef.current + 1, false);
        }
      },
      { root: null, rootMargin: "400px", threshold: 0 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [activeTab, fetchPastExamsPage, paginatedPastExams.length]);

  // Modal Handlers
  const handleOpenRankingsModal = useCallback(async (sub: any) => {
    const isExamPublished = Boolean(
      sub?.exam_is_published === 1 ||
      sub?.exam_is_published === true ||
      sub?.exam_lifecycle_status === "PUBLISHED" ||
      sub?.exam_status === "PUBLISHED"
    );

    if (!isExamPublished) {
      toast.info("Class standings will become available once results are officially published by faculty.", {
        title: "Standings Pending",
      });
      return;
    }

    const examId = sub.exam_id;
    const examTitle = sub.exam_title || sub.title || "Exam";
    const maxMarks = sub.max_marks || sub.exam_total_marks || 25;

    setRankingsExam({ id: examId, title: examTitle, max_marks: maxMarks });
    setRankingsModalOpen(true);
    setIsRankingsLoading(true);

    try {
      const data = await api.getExamRankings(examId);
      if (data && Array.isArray(data.rankings) && data.is_published !== false) {
        setRankingsData(data.rankings);
      } else {
        setRankingsData([]);
      }
    } catch (err: any) {
      console.warn("Could not load exam rankings:", err);
      setRankingsData([]);
    } finally {
      setIsRankingsLoading(false);
    }
  }, [toast]);

  const handleOpenBreakdownModal = useCallback(async (sub: any) => {
    const isPub =
      sub.publication_status === "PUBLISHED" ||
      (sub.publication_status !== "UNPUBLISHED" && Boolean(sub.exam_is_published || sub.is_published));
    if (!isPub) {
      toast.info("Evaluation marks and summary are undergoing faculty review and will be accessible once officially published.", {
        title: "Grading in Progress",
      });
      return;
    }
    setBreakdownSubmission(sub);
    setBreakdownModalOpen(true);

    const hasDetailsAlready = Boolean(
      sub.answers &&
      sub.answers.length > 0 &&
      sub.answers.some((a: any) => (a.criterion_scores && a.criterion_scores.length > 0) || a.question_text)
    );
    setIsBreakdownLoadingDetails(!hasDetailsAlready);

    try {
      const details = await api.getSubmission(sub.id);
      if (details && details.answers) {
        setBreakdownSubmission((prev: any) => ({
          ...prev,
          ...details,
          answers: details.answers,
        }));
        setLocalSubmissions((prevList) =>
          prevList.map((s) => (s.id === sub.id ? { ...s, ...details, answers: details.answers } : s))
        );
      }
    } catch (err) {
      console.warn("Could not fetch detailed answers for breakdown modal", err);
    } finally {
      setIsBreakdownLoadingDetails(false);
    }
  }, [toast]);

  const handleOpenArtifacts = useCallback((sub: any) => {
    const hasQP = Boolean(sub.has_question_paper ?? sub.question_paper_path ?? sub.exam_question_paper_path);
    const hasAK = Boolean(sub.has_answer_key ?? sub.answer_key_path ?? sub.exam_answer_key_path);
    setArtifactModalExam({
      id: sub.exam_id,
      title: sub.exam_title,
      subject: sub.exam_subject || sub.subject,
      has_question_paper: hasQP,
      has_answer_key: hasAK,
      is_document_purged: sub.exam_is_document_purged,
    });
    setArtifactModalInitialTab(hasQP ? "question-paper" : (hasAK ? "answer-key" : "question-paper"));
    setArtifactModalOpen(true);
  }, []);

  const handleOpenRevalModal = useCallback(async (sub: any) => {
    setRevalSubmission(sub);
    setRevalModalOpen(true);

    if (!sub.answers || sub.answers.length === 0) {
      try {
        const details = await api.getSubmission(sub.id);
        if (details && details.answers) {
          setRevalSubmission((prev: any) => ({
            ...prev,
            ...details,
            answers: details.answers,
          }));
        }
      } catch (err) {
        console.warn("Could not fetch detailed answers for revaluation modal", err);
      }
    }
  }, []);

  const handleAppealSubmitted = useCallback((updatedSubmission: any) => {
    setLocalSubmissions((prev) =>
      prev.map((s) => (s.id === updatedSubmission.id ? updatedSubmission : s))
    );
    queryClient.invalidateQueries({ queryKey: queryKeys.submissions.studentPortalState() });
  }, [queryClient]);

  const handleUploadSuccess = useCallback(async () => {
    await refetchPortalState();
    queryClient.invalidateQueries({ queryKey: queryKeys.submissions.studentPortalState() });
  }, [refetchPortalState, queryClient]);

  if (isPortalLoading && !portalState) {
    return <StudentPortalSkeleton />;
  }

  // Summary Metrics
  const totalSubmissionsCount = localSubmissions.length;
  const publishedSubmissions = localSubmissions.filter(
    (s) => s.publication_status === "PUBLISHED" || s.exam_is_published || s.is_published
  );
  const avgPercentage =
    publishedSubmissions.length > 0
      ? (
          publishedSubmissions.reduce((acc, curr) => acc + (Number(curr.percentage) || 0), 0) /
          publishedSubmissions.length
        ).toFixed(1)
      : null;
  const activeRevalsCount = localSubmissions.filter(
    (s) => s.revaluation && (s.revaluation.status === "SUBMITTED" || s.revaluation.status === "UNDER_REVIEW")
  ).length;

  return (
    <div className="max-w-5xl mx-auto space-y-5 sm:space-y-7 pt-5 sm:pt-8 pb-16 px-3 sm:px-6 cascade-group overflow-x-hidden">
      {/* 1. Profile Header */}
      <StudentProfileHeader
        user={user}
        onReportIssueClick={() => setReportModalOpen(true)}
      />

      {/* 2. Portal Top Navigation Switcher */}
      <div className="relative grid grid-cols-2 p-1 rounded-xl bg-canvas-soft/80 border border-hairline w-full sm:w-80 select-none">
        <span
          ref={tabIndicatorPillRef}
          aria-hidden="true"
          className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg bg-surface shadow-xs border border-hairline/60 pointer-events-none will-change-transform"
          style={{
            transform: activeTab === "dashboard" ? "translate3d(0%, 0, 0)" : "translate3d(100%, 0, 0)",
            transition: isTouchDragging ? "none" : "transform 280ms cubic-bezier(0.2, 0.8, 0.25, 1)",
          }}
        />

        <button
          type="button"
          onClick={() => handleTabSwitch("dashboard")}
          className={`relative z-10 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs transition-colors duration-150 cursor-pointer ${
            activeTab === "dashboard"
              ? "font-bold text-ink"
              : "font-semibold text-ink-muted hover:text-ink"
          }`}
        >
          <Layers className={`h-3.5 w-3.5 transition-colors ${activeTab === "dashboard" ? "text-primary" : "text-ink-muted"}`} />
          <span>Dashboard</span>
          {activeWindows.length > 0 && (
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabSwitch("exams")}
          className={`relative z-10 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs transition-colors duration-150 cursor-pointer ${
            activeTab === "exams"
              ? "font-bold text-ink"
              : "font-semibold text-ink-muted hover:text-ink"
          }`}
        >
          <BookOpen className={`h-3.5 w-3.5 transition-colors ${activeTab === "exams" ? "text-primary" : "text-ink-muted"}`} />
          <span>Past Exams</span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.2 rounded border transition-colors ${
              activeTab === "exams"
                ? "bg-canvas-soft border-hairline/60 text-ink font-semibold"
                : "bg-surface/50 border-hairline/40 text-ink-muted"
            }`}
          >
            {pastSubmissionsList.length}
          </span>
        </button>
      </div>

      {/* 3. 2-Pane Connected Touch Track */}
      <div
        ref={tabContainerRef}
        className="w-full overflow-hidden"
        style={{ touchAction: "pan-y" }}
        onTouchStart={handlePortalTouchStart}
        onTouchMove={handlePortalTouchMove}
        onTouchEnd={handlePortalTouchEnd}
        onTouchCancel={handlePortalTouchEnd}
      >
        <div
          ref={tabTrackRef}
          className="flex items-start w-[200%] will-change-transform"
          style={{
            transform: activeTab === "dashboard" ? "translate3d(0%, 0, 0)" : "translate3d(-50%, 0, 0)",
            transition: isTouchDragging ? "none" : "transform 280ms cubic-bezier(0.2, 0.8, 0.25, 1)",
          }}
        >
          {/* Pane 0: Dashboard */}
          <div
            className={`w-1/2 shrink-0 min-w-0 space-y-6 px-0.5 ${
              activeTab === "dashboard"
                ? "block opacity-100"
                : isTouchDragging || isTransitioning
                ? "block opacity-100"
                : "h-0 max-h-0 overflow-hidden opacity-0 pointer-events-none"
            }`}
          >
            {/* Push Notification Banner */}
            <StudentNotificationBanner />

            {/* Academic Counters */}
            <StudentAcademicCounters
              totalSubmissionsCount={totalSubmissionsCount}
              publishedCount={publishedSubmissions.length}
              avgPercentage={avgPercentage}
              activeRevalsCount={activeRevalsCount}
            />

            {/* Trajectory Graph */}
            <StudentMarksTrajectory submissions={localSubmissions} />

            {/* Active Exam Submission Card */}
            {shouldShowExamWindowCard && activeExam && (
              <div className="space-y-3">
                <MultiWindowSelector
                  activeWindows={activeWindows}
                  selectedExamId={selectedExamId}
                  onSelectExam={setSelectedExamId}
                  uploading={false}
                  hasStagedPages={false}
                />

                <ActiveExamSubmissionCard
                  activeExam={activeExam}
                  windowStatus={windowStatus}
                  activeExamSubmission={activeExamSubmission}
                  user={user}
                  currentTick={currentTick}
                  onUploadSuccess={handleUploadSuccess}
                />
              </div>
            )}

            {/* Recent Past Submissions Preview */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold text-ink">Past Exam Submissions</h2>
                    {pastSubmissionsList.length > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-canvas-soft border border-hairline text-ink-muted shrink-0">
                        {pastSubmissionsList.length} {pastSubmissionsList.length === 1 ? "Paper" : "Papers"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted leading-relaxed mt-0.5">
                    Review evaluated answer sheets, question-by-question marks, and faculty revaluations.
                  </p>
                </div>
              </div>

              {pastSubmissionsList.length === 0 ? (
                <div className="rounded-xl border border-hairline bg-surface p-6 sm:p-8 text-center space-y-2">
                  <FileText className="h-7 w-7 text-ink-faint mx-auto" />
                  <h3 className="text-sm font-semibold text-ink">No past exam submissions</h3>
                  <p className="text-xs text-ink-muted max-w-sm mx-auto">
                    Your evaluated answer sheets and marks from completed exams will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    {pastSubmissionsList.slice(0, 1).map((sub, idx) => (
                      <PastExamCard
                        key={sub.id}
                        sub={sub}
                        idx={idx}
                        isExpanded={Boolean(expandedCardIds[sub.id])}
                        onToggle={toggleCard}
                        onOpenBreakdown={handleOpenBreakdownModal}
                        onOpenRankings={handleOpenRankingsModal}
                        onOpenArtifacts={handleOpenArtifacts}
                        onOpenReval={handleOpenRevalModal}
                      />
                    ))}
                  </div>

                  {pastSubmissionsList.length > 0 && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => handleTabSwitch("exams", true)}
                        className="w-full flex items-center justify-center gap-2 h-11 px-4 rounded-xl btn-glass-utility text-xs font-semibold text-ink hover:text-primary transition-all group shadow-2xs text-center cursor-pointer active:scale-[0.99]"
                      >
                        <BookOpen className="h-4 w-4 text-primary" />
                        <span>
                          View All {pastSubmissionsList.length}{" "}
                          {pastSubmissionsList.length === 1 ? "Past Exam Submission" : "Past Exam Submissions"} →
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Support Card */}
            <StudentSupportCard onReportIssueClick={() => setReportModalOpen(true)} />
          </div>

          {/* Pane 1: Dedicated Past Exams */}
          <div
            className={`w-1/2 shrink-0 min-w-0 space-y-4 px-0.5 ${
              activeTab === "exams"
                ? "block opacity-100"
                : isTouchDragging || isTransitioning
                ? "block opacity-100"
                : "h-0 max-h-0 overflow-hidden opacity-0 pointer-events-none"
            }`}
          >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pt-0.5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-ink">Past Exam Submissions</h2>
                  {pastExamsTotal > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-canvas-soft border border-hairline text-ink-muted shrink-0">
                      {pastExamsTotal} {pastExamsTotal === 1 ? "Paper" : "Papers"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-muted leading-relaxed mt-0.5">
                  Search by title or subject. Click any exam card to expand detailed scores, verified PDF viewer, and answer keys.
                </p>
              </div>
            </div>

            {/* Toolbar */}
            <PastExamsToolbar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              examSubjectFilter={examSubjectFilter}
              onSubjectFilterChange={setExamSubjectFilter}
              examStatusFilter={examStatusFilter}
              onStatusFilterChange={setExamStatusFilter}
              uniqueExamSubjects={uniqueExamSubjects}
              isFilterExpanded={isPastExamsFilterExpanded}
              onToggleFilterExpanded={() => setIsPastExamsFilterExpanded((prev) => !prev)}
              loadedCount={paginatedPastExams.length}
              totalCount={pastExamsTotal}
              onToggleAllCards={handleToggleAllCards}
              onResetFilters={() => {
                setSearchQuery("");
                setExamSubjectFilter("ALL");
                setExamStatusFilter("ALL");
              }}
            />

            {/* Card List / Skeleton / Empty state */}
            {isPastExamsInitialLoading ? (
              <PastExamsCardsSkeleton count={3} />
            ) : paginatedPastExams.length === 0 ? (
              <div className="rounded-xl border border-hairline bg-surface p-10 text-center space-y-3">
                <FileText className="h-10 w-10 text-ink-faint mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-ink">
                    {pastExamsTotal === 0
                      ? "No exam submissions found"
                      : "No matching exams found"}
                  </h3>
                  <p className="text-xs text-ink-muted max-w-md mx-auto">
                    {pastExamsTotal === 0
                      ? "When you upload your answer sheets during an active examination window, your verified submissions, AI evaluations, and faculty remarks will appear here."
                      : `No past exams matched "${searchQuery || examSubjectFilter || examStatusFilter}". Try adjusting or clearing your filters.`}
                  </p>
                </div>
                {pastExamsTotal > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setExamSubjectFilter("ALL");
                      setExamStatusFilter("ALL");
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Reset all filters
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {paginatedPastExams.map((sub, idx) => (
                    <PastExamCard
                      key={sub.id}
                      sub={sub}
                      idx={idx}
                      isExpanded={Boolean(expandedCardIds[sub.id])}
                      onToggle={toggleCard}
                      onOpenBreakdown={handleOpenBreakdownModal}
                      onOpenRankings={handleOpenRankingsModal}
                      onOpenArtifacts={handleOpenArtifacts}
                      onOpenReval={handleOpenRevalModal}
                    />
                  ))}
                </div>

                {/* Infinite Scroll Sentinel */}
                <div
                  ref={loadMoreSentinelRef}
                  className="py-4 flex flex-col items-center justify-center min-h-[50px]"
                >
                  {isLoadingMorePastExams ? (
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-surface border border-hairline text-xs font-medium text-ink-muted shadow-2xs animate-in fade-in duration-200">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span>Loading next exams...</span>
                    </div>
                  ) : hasMorePastExams ? (
                    <button
                      type="button"
                      onClick={() => fetchPastExamsPage(pastExamsPageRef.current + 1, false)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-surface hover:bg-canvas-soft border border-hairline text-xs font-semibold text-primary transition-all shadow-2xs cursor-pointer select-none active:scale-95"
                    >
                      <span>Load More Exams</span>
                      {pastExamsTotal > paginatedPastExams.length && (
                        <span className="text-[10.5px] font-mono text-ink-muted">
                          ({pastExamsTotal - paginatedPastExams.length} remaining)
                        </span>
                      )}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  ) : paginatedPastExams.length > 0 ? (
                    <span className="text-[11px] font-mono text-ink-faint select-none">
                      • All {pastExamsTotal} past exams loaded •
                    </span>
                  ) : null}
                </div>
              </>
            )}

            {/* Support Card */}
            <StudentSupportCard onReportIssueClick={() => setReportModalOpen(true)} />
          </div>
        </div>
      </div>

      {/* 4. Modals */}
      <StudentQuestionBreakdownModal
        isOpen={breakdownModalOpen}
        onClose={() => setBreakdownModalOpen(false)}
        submission={breakdownSubmission}
        isLoadingDetails={isBreakdownLoadingDetails}
        onOpenRankings={handleOpenRankingsModal}
      />

      <StudentRankingsModal
        isOpen={rankingsModalOpen}
        onClose={() => setRankingsModalOpen(false)}
        exam={rankingsExam}
        rankingsData={rankingsData}
        isLoading={isRankingsLoading}
        currentStudentRoll={user?.roll_number}
        currentStudentId={user?.student_id}
      />

      <StudentRevaluationModal
        isOpen={revalModalOpen}
        onClose={() => setRevalModalOpen(false)}
        submission={revalSubmission}
        onAppealSubmitted={handleAppealSubmitted}
      />

      <ReportIssueModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        userRole="STUDENT"
      />

      {artifactModalExam && (
        <ArtifactViewerModal
          isOpen={artifactModalOpen}
          onClose={() => {
            setArtifactModalOpen(false);
            setArtifactModalExam(null);
          }}
          examId={artifactModalExam.id}
          examTitle={artifactModalExam.title}
          examSubject={artifactModalExam.subject}
          initialArtifact={artifactModalInitialTab}
          hasQuestionPaper={artifactModalExam.has_question_paper}
          hasAnswerKey={artifactModalExam.has_answer_key}
          isExamDocumentPurged={artifactModalExam.is_document_purged}
        />
      )}
    </div>
  );
}
