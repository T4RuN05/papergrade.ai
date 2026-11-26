"use client";

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  Trophy,
  Medal,
  Award,
  Search,
  ArrowRight,
  TrendingUp,
  Target,
  Sparkles,
  FileSpreadsheet,
  BarChart3,
  X,
  Lock,
} from "lucide-react";
import { useToast } from "@/lib/ToastContext";
import { PodiumBooths } from "./student/PodiumBooths";
import { PodiumCelebrationOverlay } from "./student/PodiumCelebrationOverlay";

export interface ExamRankedItem {
  id: string;
  student_name: string;
  roll_number?: string;
  student_id?: string;
  google_picture?: string | null;
  total_awarded_marks?: number | null;
  score?: number | null;
  max_marks?: number;
  percentage?: number | null;
  status?: string;
  is_manual_override?: boolean | number;
  page_count?: number;
  rank?: number;
  is_current_student?: boolean;
}

export function computeRankedSubmissions(
  submissions: ExamRankedItem[],
  maxMarks: number = 25,
  currentStudentRoll: string = "",
  currentStudentId: string = ""
) {
  const evaluatedSubmissions = submissions.filter((s) => {
    const mark = s.total_awarded_marks ?? s.score;
    return mark !== null && mark !== undefined && s.status?.toUpperCase() !== "FAILED";
  });

  const sorted = [...evaluatedSubmissions].sort((a, b) => {
    const marksA = Number(a.total_awarded_marks ?? a.score ?? 0);
    const marksB = Number(b.total_awarded_marks ?? b.score ?? 0);
    if (Math.abs(marksB - marksA) > 0.001) return marksB - marksA;

    const pctA = Number(a.percentage ?? 0);
    const pctB = Number(b.percentage ?? 0);
    if (Math.abs(pctB - pctA) > 0.001) return pctB - pctA;

    if (a.roll_number && b.roll_number) {
      return a.roll_number.localeCompare(b.roll_number, undefined, { numeric: true });
    }
    return (a.student_name || "").localeCompare(b.student_name || "");
  });

  let currentDenseRank = 1;
  return sorted.map((sub, idx, arr) => {
    const currentScore = Number(sub.total_awarded_marks ?? sub.score ?? 0);
    if (idx > 0) {
      const prevScore = Number(arr[idx - 1].total_awarded_marks ?? arr[idx - 1].score ?? 0);
      if (Math.abs(currentScore - prevScore) > 0.001) {
        currentDenseRank += 1;
      }
    }

    const totalStudents = arr.length;
    const percentile =
      totalStudents > 1
        ? Math.max(0, Math.min(100, Math.round(((totalStudents - idx) / totalStudents) * 100)))
        : 100;

    const isCurrentStudent =
      Boolean(sub.is_current_student) ||
      Boolean(currentStudentRoll && sub.roll_number && sub.roll_number.toLowerCase() === currentStudentRoll.toLowerCase()) ||
      Boolean(currentStudentId && sub.student_id && String(sub.student_id) === String(currentStudentId));

    return {
      ...sub,
      rank: sub.rank || currentDenseRank,
      percentile,
      isCurrentStudent,
      effectiveMaxMarks: sub.max_marks || maxMarks || 25,
      effectiveScore: currentScore,
      effectivePercentage: Number(sub.percentage ?? (currentScore / (sub.max_marks || maxMarks || 25)) * 100),
    };
  });
}

export function exportRankedStandingsCSV(
  examTitle: string,
  rankedAll: ReturnType<typeof computeRankedSubmissions>
): boolean {
  if (rankedAll.length === 0) return false;

  const headers = ["Rank", "Roll Number", "Student Name", "Marks Awarded", "Max Marks", "Percentage", "Percentile", "Status"];
  const rows = rankedAll.map((r) => [
    r.rank,
    `"${r.roll_number || ""}"`,
    `"${r.student_name}"`,
    r.effectiveScore.toFixed(1),
    r.effectiveMaxMarks,
    `${r.effectivePercentage.toFixed(1)}%`,
    `${r.percentile}th`,
    `"${r.status || "COMPLETED"}"`,
  ]);

  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${examTitle.replace(/[^a-z0-9]/gi, "_")}_Ranked_Leaderboard.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

export function exportRosterCSV(
  examTitle: string,
  submissions: any[],
  maxMarks: number = 25
): boolean {
  if (submissions.length === 0) return false;

  const headers = ["Roll Number", "Student Name", "Pages", "Marks Awarded", "Max Marks", "Percentage", "Status"];
  const rows = submissions.map((s) => [
    `"${s.roll_number || ""}"`,
    `"${s.student_name || ""}"`,
    s.page_count || 1,
    s.total_awarded_marks != null ? Number(s.total_awarded_marks).toFixed(1) : "—",
    maxMarks,
    s.percentage != null ? `${Number(s.percentage).toFixed(1)}%` : "—",
    `"${s.status || "PENDING"}"`,
  ]);

  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${examTitle.replace(/[^a-z0-9]/gi, "_")}_Roster_Ledger.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

interface ExamRankedTableProps {
  examId: string;
  examTitle: string;
  maxMarks?: number;
  submissions: ExamRankedItem[];
  isStudentView?: boolean;
  currentStudentRoll?: string;
  currentStudentId?: string;
  currentUserGooglePicture?: string | null;
  onInspectSubmission?: (submissionId: string) => void;
  hideSummaryCards?: boolean;
  hideToolbar?: boolean;
  searchTerm?: string;
  bracketFilter?: "ALL" | "TOP10" | "DISTINCTION" | "PASS";
  isFetching?: boolean;
}

export function ExamRankedTable({
  examId,
  examTitle,
  maxMarks = 25,
  submissions,
  isStudentView = false,
  currentStudentRoll = "",
  currentStudentId = "",
  currentUserGooglePicture = null,
  hideSummaryCards = false,
  hideToolbar = false,
  searchTerm: propSearchTerm,
  bracketFilter: propBracketFilter,
  isFetching = false,
}: ExamRankedTableProps) {
  const { toast } = useToast();
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [internalBracketFilter, setInternalBracketFilter] = useState<"ALL" | "TOP10" | "DISTINCTION" | "PASS">("ALL");

  const effectiveSearchTerm = propSearchTerm !== undefined ? propSearchTerm : internalSearchTerm;
  const effectiveBracketFilter = propBracketFilter !== undefined ? propBracketFilter : internalBracketFilter;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [visibleRows, setVisibleRows] = useState<Record<string, boolean>>({});
  const isInitialMountRef = useRef(true);

  // 1. Compute rankings with DENSE RANKING logic (1, 1, 2, 3...) - never skips ranks on ties!
  const rankedAll = useMemo(() => {
    return computeRankedSubmissions(submissions, maxMarks, currentStudentRoll, currentStudentId);
  }, [submissions, maxMarks, currentStudentRoll, currentStudentId]);

  // 2. Compute High-Level Summary Statistics
  const stats = useMemo(() => {
    if (rankedAll.length === 0) {
      return { topper: null, average: 0, median: 0, distinctionCount: 0, total: 0 };
    }

    const topper = rankedAll[0];
    const scores = rankedAll.map((r) => r.effectiveScore);
    const sum = scores.reduce((acc, val) => acc + val, 0);
    const average = sum / scores.length;

    // Median
    const mid = Math.floor(scores.length / 2);
    const median = scores.length % 2 !== 0 ? scores[mid] : (scores[mid - 1] + scores[mid]) / 2;

    // Distinction count (>= 75%)
    const distinctionCount = rankedAll.filter((r) => r.effectivePercentage >= 75).length;

    return {
      topper,
      average: Number(average.toFixed(1)),
      median: Number(median.toFixed(1)),
      distinctionCount,
      total: rankedAll.length,
    };
  }, [rankedAll]);

  // Current logged in student entry (if any)
  const currentStudentEntry = useMemo(() => {
    return rankedAll.find((r) => r.isCurrentStudent);
  }, [rankedAll]);

  // Synchronized Choreography for Student Drawer:
  // Top-3 (1st time): Greeting (centered) -> Avatar Glide + Podium Mount (3rd -> 2nd -> 1st) -> Student List Mount
  // Non-Top-3 / Repeat: Podium Mount (3rd -> 2nd -> 1st) -> Student List Mount
  const targetAvatarElRef = useRef<HTMLDivElement | null>(null);
  const setTargetAvatarEl = useCallback((el: HTMLDivElement | null) => {
    targetAvatarElRef.current = el;
  }, []);
  const [celebrationSpec, setCelebrationSpec] = useState<{
    rank: 1 | 2 | 3;
    studentName: string;
    googlePicture?: string | null;
  } | null>(null);
  const [holdTargetBoothAvatar, setHoldTargetBoothAvatar] = useState(false);
  const [justSettledMorph, setJustSettledMorph] = useState(false);
  const [podiumMounted, setPodiumMounted] = useState(!isStudentView);
  const [listMounted, setListMounted] = useState(!isStudentView);
  const listRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrationStartedRef = useRef(false);

  const markCelebratedOnce = useCallback((rankNum: 1 | 2 | 3) => {
    if (!examId) return;
    try {
      window.localStorage.setItem(`pg_podium_celebrated_${examId}_r${rankNum}`, "1");
    } catch {
      // Ignore storage failures in restricted contexts
    }
  }, [examId]);

  const scheduleListRevealAfterPodium = useCallback(() => {
    if (listRevealTimerRef.current) clearTimeout(listRevealTimerRef.current);
    // Allow 3rd -> 2nd -> 1st booth rise & avatars (~1.35s) to settle cleanly before revealing student list
    listRevealTimerRef.current = setTimeout(() => {
      setListMounted(true);
    }, 1350);
  }, []);

  useEffect(() => {
    celebrationStartedRef.current = false;
    return () => {
      if (listRevealTimerRef.current) clearTimeout(listRevealTimerRef.current);
    };
  }, [examId]);

  useEffect(() => {
    if (!isStudentView || hideSummaryCards) {
      setPodiumMounted(true);
      setListMounted(true);
      return;
    }
    if (!examId || stats.total === 0) return;

    // Never interrupt or reset an already-running celebration in the same open session
    if (celebrationStartedRef.current) return;

    const rankNum = currentStudentEntry?.rank;
    let shouldCelebrate = false;
    if (rankNum === 1 || rankNum === 2 || rankNum === 3) {
      const storageKey = `pg_podium_celebrated_${examId}_r${rankNum}`;
      try {
        // NOTE: Read only here — write in onStartGlide/onComplete so React StrictMode double-invoke never cancels it!
        shouldCelebrate = window.localStorage.getItem(storageKey) !== "1";
      } catch {
        shouldCelebrate = true;
      }
    }

    if (shouldCelebrate && currentStudentEntry && (rankNum === 1 || rankNum === 2 || rankNum === 3)) {
      celebrationStartedRef.current = true;
      setPodiumMounted(false);
      setListMounted(false);
      setHoldTargetBoothAvatar(true);
      setJustSettledMorph(false);
      setCelebrationSpec({
        rank: rankNum,
        studentName: currentStudentEntry.student_name,
        googlePicture: currentStudentEntry.google_picture || currentUserGooglePicture,
      });
    } else {
      setPodiumMounted(true);
      setListMounted(false);
      setHoldTargetBoothAvatar(false);
      scheduleListRevealAfterPodium();
    }
  }, [
    isStudentView,
    hideSummaryCards,
    examId,
    stats.total,
    currentStudentEntry,
    currentUserGooglePicture,
    scheduleListRevealAfterPodium,
  ]);

  // 3. Apply search & bracket filtering
  const filteredRanked = useMemo(() => {
    return rankedAll.filter((item) => {
      // Search
      const query = effectiveSearchTerm.trim().toLowerCase();
      const matchSearch =
        !query ||
        item.student_name.toLowerCase().includes(query) ||
        (item.roll_number && !isStudentView && item.roll_number.toLowerCase().includes(query));

      if (!matchSearch) return false;

      // Bracket (Faculty only - disabled in student view)
      if (!isStudentView) {
        if (effectiveBracketFilter === "TOP10") return item.rank <= 10;
        if (effectiveBracketFilter === "DISTINCTION") return item.effectivePercentage >= 75;
        if (effectiveBracketFilter === "PASS") return item.effectivePercentage >= 40 && item.effectivePercentage < 75;
      }
      return true;
    });
  }, [rankedAll, effectiveSearchTerm, effectiveBracketFilter, isStudentView]);

  // Dynamically check whether list overflows and user can scroll down
  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) {
      setCanScrollDown(false);
      return;
    }
    const hasOverflow = el.scrollHeight > el.clientHeight + 4;
    const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    setCanScrollDown(hasOverflow && !isAtBottom);
  }, []);

  // Check scroll state when items or filters change
  useEffect(() => {
    checkScroll();
    const timer = setTimeout(checkScroll, 80);
    const el = scrollContainerRef.current;
    if (!el) return () => clearTimeout(timer);

    const onScroll = () => checkScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, filteredRanked]);

  // Handle row initial mount cascade vs scroll-driven morph & snap
  useEffect(() => {
    if (!listMounted) return;
    isInitialMountRef.current = true;
    setVisibleRows({});
    const timer = setTimeout(() => {
      isInitialMountRef.current = false;
    }, 550);
    return () => clearTimeout(timer);
  }, [effectiveBracketFilter, effectiveSearchTerm, listMounted]);

  // IntersectionObserver: Morph upcoming rows from small when entering from bottom
  useEffect(() => {
    if (!listMounted) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const rowEls = container.querySelectorAll<HTMLElement>("[data-standings-row]");
    if (rowEls.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const rowId = entry.target.getAttribute("data-standings-row");
          if (!rowId) return;

          if (entry.isIntersecting) {
            setVisibleRows((prev) => (prev[rowId] ? prev : { ...prev, [rowId]: true }));
          } else {
            // If the row exits out of the bottom of the scroll container, reset so it morphs again on entry
            if (entry.rootBounds && entry.boundingClientRect.top > entry.rootBounds.bottom - 4) {
              setVisibleRows((prev) => (prev[rowId] === false ? prev : { ...prev, [rowId]: false }));
            }
          }
        });
      },
      {
        root: container,
        rootMargin: "0px 0px -6px 0px",
        threshold: 0.05,
      }
    );

    rowEls.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [filteredRanked, listMounted]);

  // 4. Export Ranked List as CSV (Faculty only)
  const handleExportCSV = () => {
    const success = exportRankedStandingsCSV(examTitle, rankedAll);
    if (!success) {
      toast.warning("No ranked student data available to export.", { title: "Export CSV" });
      return;
    }
    toast.success("Ranked exam standings exported successfully.", { title: "CSV Download" });
  };

  // Helper to render Rank column badge
  const renderRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span
          className="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_1px_2px_rgba(0,0,0,0.06)] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_1px_3px_rgba(0,0,0,0.3)] shrink-0"
          title="Rank 1 • Gold"
        >
          <Trophy className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-[#b07b30] dark:text-[#e5ad68] shrink-0" />
          <span>#1</span>
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span
          className="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#f1f0ee] text-[#4d4a46] border border-[#dedcd8] shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_1px_2px_rgba(0,0,0,0.06)] dark:bg-[#1e1e1e] dark:text-[#a8a6a2] dark:border-[#2f2f2f] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_1px_3px_rgba(0,0,0,0.3)] shrink-0"
          title="Rank 2 • Silver"
        >
          <Medal className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-[#6c6964] dark:text-[#a8a6a2] shrink-0" />
          <span>#2</span>
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span
          className="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#f4f1ec] text-[#594532] border border-[#ded5c7] shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_1px_2px_rgba(0,0,0,0.06)] dark:bg-[#221b14] dark:text-[#c4ae97] dark:border-[#382b20] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_1px_3px_rgba(0,0,0,0.3)] shrink-0"
          title="Rank 3 • Bronze"
        >
          <Award className="h-3 sm:h-3.5 w-3 sm:w-3.5 text-[#8b6542] dark:text-[#c4ae97] shrink-0" />
          <span>#3</span>
        </span>
      );
    }
    return (
      <span className="font-mono text-xs font-bold text-ink-muted px-1.5 py-0.5 inline-block text-center min-w-[24px]">
        #{rank}
      </span>
    );
  };

  return (
    <div className={hideSummaryCards && hideToolbar ? "w-full" : "space-y-3.5 w-full"}>
      {/* TOP-3 CELEBRATORY OPENING ANIMATION (1st / 2nd / 3rd — ONE TIME PER EXAM) */}
      {celebrationSpec && (
        <PodiumCelebrationOverlay
          rank={celebrationSpec.rank}
          studentName={celebrationSpec.studentName}
          googlePicture={celebrationSpec.googlePicture}
          getTargetRect={() => targetAvatarElRef.current?.getBoundingClientRect() || null}
          onStartGlide={() => {
            markCelebratedOnce(celebrationSpec.rank);
            setPodiumMounted(true);
            scheduleListRevealAfterPodium();
          }}
          onRevealTarget={() => {
            setHoldTargetBoothAvatar(false);
            setJustSettledMorph(true);
          }}
          onComplete={() => {
            markCelebratedOnce(celebrationSpec.rank);
            setCelebrationSpec(null);
            setHoldTargetBoothAvatar(false);
            setJustSettledMorph(true);
          }}
        />
      )}

      {/* SUMMARY BANNER: Luxury Pure-CSS 3D Podium for Student Drawer | Analytical KPI Cards for Faculty */}
      {!hideSummaryCards && stats.total > 0 && (
        isStudentView ? (
          podiumMounted ? (
            <PodiumBooths
              rankedAll={rankedAll}
              maxMarks={maxMarks}
              isFetching={isFetching}
              currentUserGooglePicture={currentUserGooglePicture}
              hideTargetStudentAvatar={holdTargetBoothAvatar}
              setTargetAvatarEl={setTargetAvatarEl}
              justSettledFromMorph={justSettledMorph}
            />
          ) : (
            <div
              className="w-full rounded-2xl border border-hairline/40 bg-canvas-soft/30 min-h-[192px] sm:min-h-[214px]"
              aria-hidden="true"
            />
          )
        ) : (
        <div
          className={`grid gap-3 transition-opacity duration-200 ${
            isFetching ? "opacity-75" : "opacity-100"
          } grid-cols-2 sm:grid-cols-4`}
        >
          {/* Top Score */}
          <div className="notion-card p-3.5 sm:p-4 flex flex-col justify-between min-h-[100px] min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">Top Score</span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <Trophy className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="notion-heading-3 text-xl sm:text-[22px] font-mono text-ink tabular-nums">
                {stats.topper?.effectiveScore.toFixed(1)}
              </span>
              <span className="text-xs text-ink-muted font-mono">
                / {stats.topper?.effectiveMaxMarks}m
              </span>
            </div>
            <div className="text-xs text-ink-muted truncate mt-1">
              {stats.topper?.student_name}
            </div>
          </div>

          {/* Class Mean */}
          <div className="notion-card p-3.5 sm:p-4 flex flex-col justify-between min-h-[100px] min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">Class Mean</span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-primary shrink-0">
                <TrendingUp className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="notion-heading-3 text-xl sm:text-[22px] font-mono text-ink tabular-nums">
                {stats.average}
              </span>
              <span className="text-xs text-ink-muted font-mono">/ {maxMarks}m</span>
            </div>
            <div className="text-xs text-ink-muted truncate mt-1">
              {((stats.average / (maxMarks || 25)) * 100).toFixed(0)}% avg
            </div>
          </div>

          {/* Median */}
          <div className="notion-card p-3.5 sm:p-4 flex flex-col justify-between min-h-[100px] min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">Median Score</span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <Target className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="notion-heading-3 text-xl sm:text-[22px] font-mono text-ink tabular-nums">
                {stats.median}
              </span>
              <span className="text-xs text-ink-muted font-mono">/ {maxMarks}m</span>
            </div>
            <div className="text-xs text-ink-muted truncate mt-1">50th percentile</div>
          </div>

          {/* Distinction Count */}
          <div className="notion-card p-3.5 sm:p-4 flex flex-col justify-between min-h-[100px] min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">Distinctions (≥75%)</span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-1.5">
              <span className="notion-heading-3 text-xl sm:text-[22px] font-mono text-ink tabular-nums">
                {stats.distinctionCount}
              </span>
              <span className="text-xs text-ink-muted">of {stats.total}</span>
            </div>
            <div className="text-xs text-ink-muted truncate mt-1">
              {((stats.distinctionCount / stats.total) * 100).toFixed(0)}% distinction rate
            </div>
          </div>
        </div>
        )
      )}

      {/* SEARCH & RANKED TABLE SECTION (Mounts right after Podium mounts for synchronized choreography) */}
      {listMounted ? (
      <div className={isStudentView ? "animate-podium-list-reveal space-y-3.5 w-full" : "space-y-3.5 w-full"}>
      {/* SEARCH, BRACKET FILTERS, & TOOLBAR */}
      {!hideToolbar && (
        <div className={`notion-card p-3 ${!isStudentView ? "space-y-2.5" : ""}`}>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
              <input
                type="text"
                value={effectiveSearchTerm}
                onChange={(e) => setInternalSearchTerm(e.target.value)}
                placeholder={isStudentView ? "Search student name..." : "Search student by name or roll number..."}
                className="w-full pl-8 pr-7 py-1.5 bg-canvas-soft focus:bg-surface text-xs text-ink placeholder:text-ink-faint rounded-xs border border-hairline focus:outline-none focus:border-primary transition-colors"
              />
              {effectiveSearchTerm && (
                <button
                  type="button"
                  onClick={() => setInternalSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink rounded-xs transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Export CSV Button (Faculty Only) */}
            {!isStudentView && (
              <button
                type="button"
                onClick={handleExportCSV}
                className="notion-btn-utility w-full sm:w-auto shrink-0"
                title="Download complete ranked list as CSV"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-[#1aae39] shrink-0" />
                <span>Export CSV</span>
              </button>
            )}
          </div>

          {/* Quick Filter Pills (Faculty only - removed from student PWA) */}
          {!isStudentView && (
            <div className="flex items-center gap-1.5 text-xs overflow-x-auto no-scrollbar py-0.5 shrink-0 select-none" data-no-swipe="true">
              <span className="text-xs font-medium text-ink-muted mr-0.5 shrink-0">
                Filter:
              </span>
              <button
                type="button"
                onClick={() => setInternalBracketFilter("ALL")}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                  effectiveBracketFilter === "ALL"
                    ? "bg-primary text-white font-semibold"
                    : "bg-canvas-soft text-ink-secondary hover:text-ink border border-hairline font-medium"
                }`}
              >
                All Ranked ({rankedAll.length})
              </button>
              <button
                type="button"
                onClick={() => setInternalBracketFilter("TOP10")}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                  effectiveBracketFilter === "TOP10"
                    ? "bg-primary text-white font-semibold"
                    : "bg-canvas-soft text-ink-secondary hover:text-ink border border-hairline font-medium"
                }`}
              >
                Top 10
              </button>
              <button
                type="button"
                onClick={() => setInternalBracketFilter("DISTINCTION")}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                  effectiveBracketFilter === "DISTINCTION"
                    ? "bg-primary text-white font-semibold"
                    : "bg-canvas-soft text-ink-secondary hover:text-ink border border-hairline font-medium"
                }`}
              >
                Distinction (≥75%)
              </button>

              {(effectiveSearchTerm || effectiveBracketFilter !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setInternalSearchTerm("");
                    setInternalBracketFilter("ALL");
                  }}
                  className="text-xs font-medium text-primary hover:underline ml-1 cursor-pointer shrink-0 whitespace-nowrap"
                >
                  Reset
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* RANKED TABLE VIEW */}
      {isFetching && (
        <div className="h-0.5 w-full bg-hairline overflow-hidden rounded-full">
          <div className="h-full bg-primary w-2/5" />
        </div>
      )}
      <div className={`transition-opacity duration-200 ${isFetching ? "opacity-60 pointer-events-none" : "opacity-100"}`}>
        {filteredRanked.length === 0 ? (
        <div className="notion-card p-6 sm:p-8 text-center space-y-2 w-full">
          <BarChart3 className="h-8 w-8 text-ink-faint mx-auto" />
          <h4 className="text-xs sm:text-sm font-semibold text-ink">
            {rankedAll.length === 0
              ? "No evaluated student scores recorded yet."
              : isStudentView
              ? "No students match your search."
              : "No students match your filter criteria."}
          </h4>
          <p className="text-xs text-ink-muted max-w-sm mx-auto">
            {rankedAll.length === 0
              ? "Once answer sheets are graded and marks are recorded, the ranked leaderboard will compute automatically."
              : isStudentView
              ? `No student found matching "${effectiveSearchTerm}".`
              : `Try clearing "${effectiveSearchTerm || effectiveBracketFilter}" to view all student standings.`}
          </p>
        </div>
      ) : isStudentView ? (
        /* =========================================================================
           STUDENT PWA VIEW: EXACTLY 3 COLUMNS (Rank, Student, Score)
           Full-size dignified rows with smooth bottom-fade scrolling experience.
           ========================================================================= */
        <div className="w-full rounded-xl border border-hairline bg-surface shadow-2xs overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="max-h-[50vh] sm:max-h-[55vh] overflow-y-auto relative sleek-scrollbar overscroll-contain"
            style={{
              maskImage: canScrollDown
                ? "linear-gradient(to bottom, black calc(100% - 44px), transparent 100%)"
                : "none",
              WebkitMaskImage: canScrollDown
                ? "linear-gradient(to bottom, black calc(100% - 44px), transparent 100%)"
                : "none",
              transition: "mask-image 0.2s ease, -webkit-mask-image 0.2s ease",
            }}
          >
            <table className="w-full text-left text-xs border-collapse table-fixed">
              <thead className="sticky top-0 z-10 bg-canvas-soft border-b border-hairline">
                <tr className="text-ink-muted notion-eyebrow">
                  <th className="py-2.5 px-2.5 sm:px-3 text-center w-14 sm:w-16">Rank</th>
                  <th className="py-2.5 px-2.5 sm:px-3">Student</th>
                  <th className="py-2.5 px-2.5 sm:px-3 text-right w-20 sm:w-24">Score (/{maxMarks}m)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {filteredRanked.map((item, idx) => {
                  const isYou = item.isCurrentStudent;
                  const isRank1 = item.rank === 1;
                  const isRank2 = item.rank === 2;
                  const isRank3 = item.rank === 3;
                  const isSeen = visibleRows[item.id] ?? (idx < 5);
                  const transitionDelay = isInitialMountRef.current ? `${Math.min(idx, 6) * 45}ms` : "0ms";

                  // Subtle row-wise gold, silver, bronze tint from left fading to right
                  const rowTintClass = isYou
                    ? "bg-gradient-to-r from-primary/20 via-primary/5 to-transparent border-l-4 border-l-primary font-medium"
                    : isRank1
                    ? "bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent dark:from-amber-400/20 dark:via-amber-400/5 dark:to-transparent hover:from-amber-500/20"
                    : isRank2
                    ? "bg-gradient-to-r from-slate-400/15 via-slate-400/5 to-transparent dark:from-slate-300/20 dark:via-slate-300/5 dark:to-transparent hover:from-slate-400/20"
                    : isRank3
                    ? "bg-gradient-to-r from-amber-700/15 via-amber-700/5 to-transparent dark:from-amber-600/20 dark:via-amber-600/5 dark:to-transparent hover:from-amber-700/20"
                    : "bg-surface hover:bg-canvas-soft/50";

                  return (
                    <tr
                      key={item.id}
                      data-standings-row={item.id}
                      style={{
                        transitionDelay,
                      }}
                      className={`h-12 ${rowTintClass} ${isSeen ? "standings-row-seen" : "standings-row-unseen"}`}
                    >
                      {/* Column 1: Rank */}
                      <td className="py-2.5 px-2.5 sm:px-3 text-center whitespace-nowrap">
                        {renderRankBadge(item.rank)}
                      </td>

                      {/* Column 2: Student (NO Roll Number) */}
                      <td className="py-2.5 px-2.5 sm:px-3 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`truncate text-xs sm:text-sm ${isYou ? "font-bold text-ink" : "font-medium text-ink"}`}>
                            {item.student_name}
                          </span>
                          {isYou && (
                            <span className="px-1.5 py-0.5 rounded-xs text-[10px] font-semibold bg-primary text-white shrink-0">
                              You
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 3: Score (Minimal: only score number, total marks in header) */}
                      <td className="py-2.5 px-2.5 sm:px-3 text-right whitespace-nowrap">
                        <span className="font-mono font-bold text-ink text-xs sm:text-sm">
                          {item.effectiveScore.toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* =========================================================================
           FACULTY / ROSTER VIEW: Mobile Card Stack (< 640px) + Desktop Table (>= 640px)
           ========================================================================= */
        <div className={`${hideToolbar ? "rounded-none border-0 shadow-none bg-surface" : "notion-card overflow-hidden"} w-full`}>
          {/* Mobile Card List (< 640px) */}
          <div className="sm:hidden divide-y divide-hairline">
            {filteredRanked.map((item) => {
              const isYou = item.isCurrentStudent;
              const sUpper = (item.status || "").toUpperCase();
              const isEvaluating = ["QUEUED", "PROCESSING", "EVALUATING"].includes(sUpper);
              const dotClass =
                sUpper === "NEEDS_REVIEW"
                  ? "bg-[#8b5cf6]"
                  : isEvaluating
                  ? "bg-[#dd5b00]"
                  : sUpper === "UPLOADED" || sUpper === "PENDING"
                  ? "bg-primary"
                  : "bg-[#1aae39]";
              const statusLabel =
                sUpper === "NEEDS_REVIEW"
                  ? "Needs Review"
                  : isEvaluating
                  ? "Evaluating"
                  : sUpper === "UPLOADED" || sUpper === "PENDING"
                  ? "Uploaded"
                  : "Finalized";

              return (
                <div
                  key={item.id}
                  className={`p-3.5 space-y-2 ${isYou ? "bg-primary/[0.04] border-l-2 border-l-primary" : "bg-surface"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {renderRankBadge(item.rank)}
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-ink truncate flex items-center gap-1.5">
                          <span className="truncate">{item.student_name}</span>
                          {Boolean(item.is_manual_override) && (
                            <span className="px-1.5 py-0.2 rounded-xs text-[10px] font-medium bg-canvas-soft text-ink-secondary border border-hairline shrink-0">
                              Overridden
                            </span>
                          )}
                        </div>
                        {item.roll_number && (
                          <div className="text-xs font-mono text-ink-muted">
                            Roll: {item.roll_number}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-sm text-ink tabular-nums">
                        {item.effectiveScore.toFixed(1)}
                        <span className="text-ink-muted font-normal text-xs">/{item.effectiveMaxMarks}m</span>
                      </div>
                      <div className="font-mono text-xs text-primary font-semibold tabular-nums">
                        {item.effectivePercentage.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-hairline">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
                      <span>{statusLabel}</span>
                    </span>

                    {isEvaluating ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted opacity-50">
                        <Lock className="h-3 w-3" />
                        <span>Evaluating...</span>
                      </span>
                    ) : (
                      <Link
                        href={`/grading/${item.id}`}
                        className="notion-btn-utility min-h-0 h-7 px-2.5 text-primary"
                      >
                        <span>Inspect Sheet</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (>= 640px) */}
          <div className="hidden sm:block overflow-x-auto sleek-scrollbar w-full">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas-soft border-b border-hairline text-ink-muted notion-eyebrow">
                <th className="py-3 px-4 text-center w-20">Rank</th>
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4 text-right">Score</th>
                <th className="py-3 px-4 text-center">Percentage</th>
                <th className="py-3 px-4 text-center hidden md:table-cell">Percentile</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filteredRanked.map((item) => {
                const isTop3 = item.rank <= 3;
                const isYou = item.isCurrentStudent;

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      isYou
                        ? "bg-primary/[0.04] hover:bg-primary/[0.08] border-l-4 border-l-primary font-medium"
                        : isTop3
                        ? "bg-surface hover:bg-canvas-soft/70"
                        : "hover:bg-canvas-soft/50"
                    }`}
                  >
                    {/* Rank Badge Column */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {renderRankBadge(item.rank)}
                    </td>

                    {/* Student Identity */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-semibold text-ink flex items-center gap-1.5">
                            <span>{item.student_name}</span>
                            {isYou && (
                              <span className="px-1.5 py-0.2 rounded-xs text-[10px] font-semibold bg-primary text-white">
                                You
                              </span>
                            )}
                            {Boolean(item.is_manual_override) && (
                              <span className="px-1.5 py-0.2 rounded-xs text-[10px] font-medium bg-canvas-soft text-ink-secondary border border-hairline">
                                Overridden
                              </span>
                            )}
                          </div>
                          {item.roll_number && (
                            <div className="text-[11px] font-mono text-ink-muted">
                              Roll: <strong className="text-ink font-medium">{item.roll_number}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Score */}
                    <td className="py-3 px-4 text-right whitespace-nowrap tabular-nums">
                      <span className="font-mono font-bold text-ink text-sm">
                        {item.effectiveScore.toFixed(1)}
                      </span>
                      <span className="font-mono text-ink-muted text-[11px] ml-1">
                        / {item.effectiveMaxMarks}m
                      </span>
                    </td>

                    {/* Percentage */}
                    <td className="py-3 px-4 text-center whitespace-nowrap tabular-nums">
                      <span className="font-mono font-semibold text-ink text-xs">
                        {item.effectivePercentage.toFixed(1)}%
                      </span>
                    </td>

                    {/* Percentile */}
                    <td className="py-3 px-4 text-center whitespace-nowrap font-mono text-xs text-ink-secondary hidden md:table-cell tabular-nums">
                      {item.percentile}th %ile
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {(() => {
                        const sUpper = (item.status || "").toUpperCase();
                        if (sUpper === "NEEDS_REVIEW") {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xs text-[11px] font-medium bg-canvas-soft text-ink-secondary border border-hairline">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6]" />
                              Needs Review
                            </span>
                          );
                        }
                        if (["QUEUED", "PROCESSING", "EVALUATING"].includes(sUpper)) {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xs text-[11px] font-medium bg-canvas-soft text-ink-secondary border border-hairline">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#dd5b00]" />
                              Evaluating
                            </span>
                          );
                        }
                        if (sUpper === "UPLOADED" || sUpper === "PENDING") {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xs text-[11px] font-medium bg-canvas-soft text-ink-secondary border border-hairline">
                              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                              Uploaded
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xs text-[11px] font-medium bg-canvas-soft text-ink-secondary border border-hairline">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#1aae39]" />
                            Finalized
                          </span>
                        );
                      })()}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {["QUEUED", "PROCESSING", "EVALUATING"].includes((item.status || "").toUpperCase()) ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted opacity-45 cursor-not-allowed select-none"
                          title="Evaluation in progress. Paper inspection will unlock once evaluation completes."
                        >
                          <Lock className="h-3 w-3" />
                          <span>Evaluating...</span>
                        </span>
                      ) : (
                        <Link
                          href={`/grading/${item.id}`}
                          className="notion-btn-utility min-h-0 h-7 px-2.5 text-primary"
                        >
                          <span>Inspect Sheet</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
      </div>
      </div>
      ) : (
        <div className="w-full" aria-hidden="true" />
      )}
    </div>
  );
}
