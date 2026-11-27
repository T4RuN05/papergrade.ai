"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ArrowRight,
  Clock,
  FileText,
  RotateCcw,
  Square,
  FileSpreadsheet,
  Trash2,
  AlertTriangle,
  Loader2,
  Users,
  Search,
  X,
  Lock,
  Archive,
  Calendar,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatExamDate, resolveExamDate } from "@/lib/dateFormat";
import { Exam } from "@/lib/types";
import { useTenant } from "@/lib/TenantContext";
import { useToast } from "@/lib/ToastContext";
import { useExamsList } from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";
import { useWindowCountdown } from "@/hooks/useWindowCountdown";
import {
  ModalCard,
  useConfirm,
  AppleSelect,
  RefetchProgressLine,
  Skeleton,
} from "@/components/ui";
import { ExamSubmissionWindowModal } from "@/components/exams/modals/ExamSubmissionWindowModal";

function ExamWindowCountdownLabel({
  win,
  isExamPublished,
  isEvaluationLocked,
}: {
  win: any;
  isExamPublished: boolean;
  isEvaluationLocked: boolean;
}) {
  const { remainingSeconds } = useWindowCountdown(win);
  const minutesRemaining = Math.max(0, Math.floor(remainingSeconds / 60));

  if (win?.is_active && remainingSeconds > 0) {
    return (
      <span className="text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums whitespace-nowrap">
        Active ({minutesRemaining}m left)
      </span>
    );
  }
  if (win?.is_in_grace) {
    return (
      <span className="text-amber-700 dark:text-amber-400 font-semibold tabular-nums whitespace-nowrap">
        Grace ({win?.grace_seconds_remaining || 0}s)
      </span>
    );
  }
  if (isExamPublished) {
    return (
      <span className="text-ink-secondary font-medium whitespace-nowrap">
        Closed (Published)
      </span>
    );
  }
  if (isEvaluationLocked) {
    return (
      <span className="text-ink-secondary font-medium whitespace-nowrap">
        Closed (Evaluated)
      </span>
    );
  }
  return <span className="text-ink-muted font-medium whitespace-nowrap">Closed</span>;
}

export default function ExamsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { selectedBranch, isRootAdmin, isInstituteDirector, isBranchManager, currentUser } = useTenant();

  // TanStack Query: In-memory SWR caching (0ms back navigation, 0 redundant fetches)
  const {
    data: exams = [],
    isLoading: examsLoading,
    isFetching: examsFetching,
  } = useExamsList(selectedBranch?.id);

  const [windowsMap, setWindowsMap] = useState<Record<string, any>>({});
  const [closingExamId, setClosingExamId] = useState<string | null>(null);

  // Custom Open/Reopen Window Modal
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [targetExamForReopen, setTargetExamForReopen] = useState<Exam | null>(null);
  const [isSubmittingWindow, setIsSubmittingWindow] = useState(false);

  // Delete Exam State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [targetExamForDelete, setTargetExamForDelete] = useState<Exam | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingExam, setIsDeletingExam] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  const checkIsRubricApproved = useCallback((exam: Exam) => Boolean(
    exam.is_rubric_approved ||
    exam.has_approved_rubric ||
    exam.status === "RUBRIC_APPROVED" ||
    exam.lifecycle_status === "APPROVED" ||
    ["RUBRIC_APPROVED", "SUBMISSION_OPEN", "EVALUATING", "EVALUATED", "COMPLETED", "PUBLISHED"].includes(exam.status) ||
    ["RUBRIC_APPROVED", "SUBMISSION_OPEN", "EVALUATING", "EVALUATED", "COMPLETED", "PUBLISHED", "APPROVED"].includes(exam.lifecycle_status || "")
  ), []);

  const availableSubjects = useMemo(() => {
    const subjects = new Set<string>();
    exams.forEach((e) => {
      if (e.subject) subjects.add(e.subject.trim());
    });
    return Array.from(subjects).sort((a, b) => a.localeCompare(b));
  }, [exams]);

  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      // 1. Subject filter
      if (
        selectedSubject !== "ALL" &&
        (exam.subject || "").trim().toLowerCase() !== selectedSubject.toLowerCase()
      ) {
        return false;
      }

      // 2. Status filter
      const isArchived = exam.status === "ARCHIVED" || exam.lifecycle_status === "ARCHIVED";
      if (selectedStatus === "ARCHIVED") {
        if (!isArchived) return false;
      } else {
        if (isArchived) return false;
        if (selectedStatus !== "ALL") {
          const win = windowsMap[exam.id];
          const isRubricApproved = checkIsRubricApproved(exam);

          if (selectedStatus === "PUBLISHED" && !exam.is_published) return false;
          if (selectedStatus === "APPROVED_RUBRIC" && !isRubricApproved) return false;
          if (selectedStatus === "DRAFT_RUBRIC" && (isRubricApproved || !exam.current_rubric_version_id)) return false;
          if (selectedStatus === "NO_RUBRIC" && (isRubricApproved || exam.current_rubric_version_id)) return false;
          if (selectedStatus === "WINDOW_OPEN" && !win?.is_active) return false;
          if (selectedStatus === "WINDOW_CLOSED" && win?.is_active) return false;
        }
      }

      // 3. Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();

      const titleMatch = (exam.title || "").toLowerCase().includes(q);
      const subjectMatch = (exam.subject || "").toLowerCase().includes(q);
      const idMatch = (exam.id || "").toLowerCase().includes(q);
      const batchMatch =
        exam.batch_scope === "SPECIFIC" && exam.scoped_batches
          ? exam.scoped_batches.some((b) => b.name?.toLowerCase().includes(q))
          : "whole branch".includes(q);

      return titleMatch || subjectMatch || idMatch || batchMatch;
    });
  }, [exams, searchQuery, selectedSubject, selectedStatus, windowsMap, checkIsRubricApproved]);

  const canDeleteExam = (exam: Exam) => Boolean(
    isRootAdmin ||
    (isBranchManager && (!currentUser?.branch_id || !exam.branch_id || currentUser.branch_id === exam.branch_id)) ||
    (isInstituteDirector && (!currentUser?.institute_id || !exam.institute_id || currentUser.institute_id === exam.institute_id))
  );

  // Synchronize initial window status map whenever exams cache updates (per-card hooks handle live countdown ticking)
  useEffect(() => {
    if (exams.length > 0) {
      setWindowsMap((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const exam of exams) {
          if (!next[exam.id] || next[exam.id].seconds_remaining === undefined) {
            next[exam.id] = (exam as any).window_status || null;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [exams]);

  // Close active window
  const handleHardCloseWindow = async (examId: string, examTitle: string) => {
    const ok = await confirm({
      title: "Close Submission Window",
      message: `Are you sure you want to close the active submission window for "${examTitle}"? Students will immediately be blocked from uploading any further answer sheets.`,
      confirmText: "Close Window",
      variant: "danger",
    });
    if (!ok) return;

    setClosingExamId(examId);
    try {
      await api.closeWindow(examId, "Closed early by administrator");
      toast.success(`Submission window closed for "${examTitle}".`, { title: "Window Closed" });
      const win = await api.getWindowStatus(examId);
      setWindowsMap((prev) => ({ ...prev, [examId]: win }));
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.all() });
    } catch (err: any) {
      const msg = err.message || "Failed to close window.";
      toast.error(msg, { title: "Window Close Failed" });
    } finally {
      setClosingExamId(null);
    }
  };

  // Submit Open / Custom Window via Unified Modal
  const handleOpenWindowSubmit = async (data: {
    durationMinutes: number;
    reason: string;
    scope: string;
  }) => {
    if (!targetExamForReopen) return;

    const durationNum = data.durationMinutes || 30;
    const reasonText = data.reason.trim() || "Scheduled examination upload session";
    const examId = targetExamForReopen.id;
    const examTitle = targetExamForReopen.title;
    const hasPriorWindow = Boolean(windowsMap[examId]?.has_window);

    setIsSubmittingWindow(true);
    try {
      if (hasPriorWindow) {
        await api.reopenWindow(examId, {
          duration_minutes: durationNum,
          reason: reasonText,
          reopen_reason: reasonText,
          reopen_scope: data.scope,
        });
      } else {
        await api.openWindow(examId, durationNum, 2);
      }

      toast.success(`Submission window opened for "${examTitle}" (${durationNum}m)!`, {
        title: "Window Opened",
      });

      const win = await api.getWindowStatus(examId).catch(() => ({
        has_window: true,
        is_active: true,
        is_in_grace: false,
        seconds_remaining: durationNum * 60,
        status: "OPEN",
      }));
      setWindowsMap((prev) => ({
        ...prev,
        [examId]: {
          ...win,
          is_active: true,
          seconds_remaining: win.seconds_remaining || durationNum * 60,
          status: "OPEN",
        },
      }));
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.all() });
      setReopenModalOpen(false);
      setTargetExamForReopen(null);
    } catch (err: any) {
      const msg = err.message || "Failed to open submission window.";
      toast.error(msg, { title: "Window Open Failed" });
    } finally {
      setIsSubmittingWindow(false);
    }
  };

  const handleArchiveExam = async (exam: Exam) => {
    const ok = await confirm({
      title: "Archive Examination",
      message: `Are you sure you want to archive "${exam.title}"? The examination will be hidden from active lists, but all student grades, rankings, answer scripts, and revaluation histories will remain permanently preserved.`,
      confirmText: "Archive Exam",
      variant: "warning",
    });
    if (!ok) return;

    try {
      await api.archiveExam(exam.id);
      toast.success(`Exam "${exam.title}" archived successfully.`, { title: "Exam Archived" });
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.all() });
    } catch (err: any) {
      toast.error(err.message || "Failed to archive exam", { title: "Archive Failed" });
    }
  };

  const handleRestoreExam = async (exam: Exam) => {
    try {
      const res = await api.restoreExam(exam.id);
      toast.success(res.message || `Exam "${exam.title}" restored.`, { title: "Exam Restored" });
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.all() });
    } catch (err: any) {
      toast.error(err.message || "Failed to restore exam", { title: "Restore Failed" });
    }
  };

  const promptDeleteExam = (exam: Exam) => {
    const isPublished = Boolean(exam.is_published || ["PUBLISHED", "EVALUATED"].includes(exam.lifecycle_status || ""));
    if (isPublished && !isRootAdmin) {
      toast.error(
        "Published academic records are protected by academic integrity policies. Only Root Administrators can permanently delete published exams. You can Archive this exam instead.",
        { title: "Deletion Blocked" }
      );
      return;
    }
    setTargetExamForDelete(exam);
    setDeleteConfirmText("");
    setDeleteModalOpen(true);
  };

  const handleDeleteExam = async () => {
    if (!targetExamForDelete) return;
    const isPublished = Boolean(
      targetExamForDelete.is_published ||
      ["PUBLISHED", "EVALUATED"].includes(targetExamForDelete.lifecycle_status || "")
    );
    const requiredConfirmation = isPublished ? targetExamForDelete.title.trim() : "DELETE";

    if (isPublished) {
      if (deleteConfirmText.trim() !== requiredConfirmation) {
        toast.error(`Please type the exact exam title "${requiredConfirmation}" to confirm permanent destruction.`, {
          title: "Confirmation Required",
        });
        return;
      }
    } else {
      if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
        toast.error("Please type DELETE to confirm deletion.", { title: "Confirmation Required" });
        return;
      }
    }

    setIsDeletingExam(true);
    try {
      const res = await api.deleteExam(targetExamForDelete.id, isPublished ? requiredConfirmation : undefined);
      toast.success(
        res.message || `Exam "${targetExamForDelete.title}" and all associated files/evaluations permanently deleted.`,
        { title: "Exam Deleted" }
      );
      setWindowsMap((prev) => {
        const next = { ...prev };
        delete next[targetExamForDelete.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.exams.all() });
      setDeleteModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete exam", { title: "Deletion Failed" });
    } finally {
      setIsDeletingExam(false);
    }
  };

  const hasActiveFilters = Boolean(
    searchQuery || selectedSubject !== "ALL" || selectedStatus !== "ALL"
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 cascade-group">
      {/* 1. Notion Page Header */}
      <header className="pb-4 border-b border-hairline flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span className="notion-eyebrow text-ink-secondary">Academic Operations</span>
            {selectedBranch && (
              <>
                <span className="text-ink-faint">•</span>
                <span className="font-medium text-ink-muted truncate max-w-[240px] sm:max-w-none">
                  {selectedBranch.name}
                  {selectedBranch.city ? ` (${selectedBranch.city})` : ""}
                </span>
              </>
            )}
          </div>
          <h1 className="notion-heading-2 text-2xl sm:text-[26px] text-ink">
            Examinations &amp; Rubrics
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
            Manage question papers, answer keys, AI rubrics, and student submission windows for{" "}
            <span className="font-medium text-ink">{selectedBranch?.name || "Active Branch"}</span>.
          </p>
        </div>

        <Link
          href="/exams/new"
          className="notion-btn-primary w-full sm:w-auto justify-center px-4 py-2 text-xs shrink-0"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span>Create New Exam</span>
        </Link>
      </header>

      {/* 2. Symmetrical Section Header + Search & Filter Bar */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
                Examination Ledger
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface border border-hairline text-ink-muted tabular-nums">
                {filteredExams.length}
                {filteredExams.length !== exams.length ? ` of ${exams.length}` : ""}
              </span>
            </div>
            <p className="text-xs sm:text-[13px] text-ink-muted">
              Search and filter active or archived exam schedules.
            </p>
          </div>
        </div>

        <div className="notion-card rounded-lg p-3 sm:p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearchQuery("");
              }}
              placeholder="Search exams by title, subject, batch..."
              className="w-full rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface pl-9 pr-8 py-2 text-xs sm:text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-xs flex items-center justify-center text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Balanced Mobile Filter Grid */}
          <div className="grid grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:flex sm:items-center gap-2 shrink-0">
            {availableSubjects.length > 0 && (
              <AppleSelect
                value={selectedSubject}
                onChange={(val) => setSelectedSubject(val)}
                options={[
                  { value: "ALL", label: "All Subjects" },
                  ...availableSubjects.map((sub) => ({ value: sub, label: sub })),
                ]}
                className="w-full sm:w-auto sm:min-w-[136px]"
              />
            )}

            <AppleSelect
              value={selectedStatus}
              onChange={(val) => setSelectedStatus(val)}
              options={[
                { value: "ALL", label: "All Statuses" },
                { value: "PUBLISHED", label: "Published" },
                { value: "APPROVED_RUBRIC", label: "Rubric Approved" },
                { value: "DRAFT_RUBRIC", label: "Draft Rubric" },
                { value: "NO_RUBRIC", label: "No Rubric" },
                { value: "WINDOW_OPEN", label: "Window Open" },
                { value: "WINDOW_CLOSED", label: "Window Closed" },
                { value: "ARCHIVED", label: "Archived Exams" },
              ]}
              className="w-full sm:w-auto sm:min-w-[144px]"
            />

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedSubject("ALL");
                  setSelectedStatus("ALL");
                }}
                className="notion-btn-utility justify-center px-3 text-xs shrink-0"
                title="Reset all filters"
              >
                <RotateCcw className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Refetch progress indicator */}
      <RefetchProgressLine isFetching={examsFetching} />

      {/* 3. Main Content Grid */}
      {examsLoading && exams.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="notion-card rounded-lg p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-6 w-3/4 rounded-md" />
              <div className="space-y-1.5">
                <Skeleton className="h-12 w-full rounded-md" />
              </div>
              <div className="pt-3 border-t border-hairline flex items-center justify-between">
                <Skeleton className="h-8 w-24 rounded-md" />
                <Skeleton className="h-8 w-20 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : exams.length === 0 ? (
        <div className="notion-card rounded-lg p-10 sm:p-12 text-center space-y-3">
          <div className="mx-auto h-11 w-11 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-center text-ink-muted">
            <FileText className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-ink">
            No examinations found for {selectedBranch?.name || "this branch"}.
          </p>
          <p className="text-xs text-ink-muted max-w-sm mx-auto leading-relaxed">
            Create an examination and upload a question paper to begin automated rubric generation and student testing.
          </p>
          <div className="pt-2">
            <Link href="/exams/new" className="notion-btn-primary px-4 py-2 text-xs">
              Create Exam Now →
            </Link>
          </div>
        </div>
      ) : filteredExams.length === 0 ? (
        <div className="notion-card rounded-lg p-10 sm:p-12 text-center space-y-3">
          <div className="mx-auto h-11 w-11 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-center text-ink-muted">
            <Search className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-ink">
            No examinations match your search or filter criteria.
          </p>
          <p className="text-xs text-ink-muted max-w-sm mx-auto leading-relaxed">
            {searchQuery
              ? `No matches found for "${searchQuery}". Try searching by another keyword, subject, or batch.`
              : "No examinations match the selected subject or status filter."}
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedSubject("ALL");
                setSelectedStatus("ALL");
              }}
              className="notion-btn-utility px-4 py-2 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5 text-ink-muted shrink-0" />
              <span>Clear Search &amp; Filters</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 cascade-fast transition-opacity duration-200 ${
            examsFetching ? "opacity-60" : "opacity-100"
          }`}
        >
          {filteredExams.map((exam) => {
            const win = windowsMap[exam.id];
            const isWindowActive = win?.is_active;
            const isInGrace = win?.is_in_grace;

            const isRubricApproved = checkIsRubricApproved(exam);
            const isExamPublished = Boolean(
              exam.is_published ||
              exam.status === "PUBLISHED" ||
              exam.lifecycle_status === "PUBLISHED"
            );
            const isEvaluationLocked = Boolean(
              isExamPublished ||
              exam.status === "EVALUATED" ||
              exam.lifecycle_status === "EVALUATED" ||
              exam.status === "EVALUATING" ||
              exam.lifecycle_status === "EVALUATING"
            );

            const lifecycleBadge = isExamPublished
              ? { label: "Published", dot: "bg-emerald-500" }
              : exam.status === "EVALUATED" || exam.lifecycle_status === "EVALUATED"
              ? { label: "Evaluated", dot: "bg-teal-500" }
              : exam.status === "EVALUATING" || exam.lifecycle_status === "EVALUATING"
              ? { label: "Evaluating", dot: "bg-primary" }
              : null;

            const rubricBadge = isRubricApproved
              ? { label: "Rubric Approved", dot: "bg-emerald-500" }
              : exam.current_rubric_version_id
              ? { label: "Draft Rubric", dot: "bg-amber-500" }
              : { label: "No Rubric", dot: "bg-ink-faint" };

            return (
              <div
                key={exam.id}
                className="notion-card rounded-lg p-4 sm:p-5 flex flex-col justify-between space-y-4 hover:border-[#d0d0d0] dark:hover:border-[#404040] transition-colors min-w-0"
              >
                {/* Top Section */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <h3 className="notion-heading-3 text-base sm:text-[17px] text-ink leading-snug break-words min-w-0">
                        {exam.title}
                      </h3>

                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:justify-end">
                        {lifecycleBadge && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary whitespace-nowrap">
                            <span className={`w-1.5 h-1.5 rounded-full ${lifecycleBadge.dot} shrink-0`} />
                            {lifecycleBadge.label}
                          </span>
                        )}

                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary whitespace-nowrap">
                          <span className={`w-1.5 h-1.5 rounded-full ${rubricBadge.dot} shrink-0`} />
                          {rubricBadge.label}
                        </span>
                      </div>
                    </div>

                    {/* Subject, Scoped Batch & Exam Date Meta */}
                    <div className="flex items-center gap-2 flex-wrap text-xs text-ink-muted">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-xs bg-canvas-soft border border-hairline font-medium text-ink-secondary">
                        {exam.subject}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-ink-muted max-w-full">
                        <Users className="h-3 w-3 text-ink-secondary shrink-0" />
                        <span className="truncate max-w-[200px] sm:max-w-none">
                          {exam.batch_scope === "SPECIFIC" && exam.scoped_batches && exam.scoped_batches.length > 0
                            ? exam.scoped_batches.length === 1
                              ? exam.scoped_batches[0].name
                              : `${exam.scoped_batches.length} Batches`
                            : "Whole Branch"}
                        </span>
                      </span>
                      {formatExamDate(resolveExamDate(exam)) && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-ink-secondary tabular-nums whitespace-nowrap"
                          title="Exam Date"
                        >
                          <Calendar className="h-3 w-3 text-ink-muted shrink-0" />
                          <span>{formatExamDate(resolveExamDate(exam))}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Submission Window Controller */}
                  <div className="p-3 rounded-lg bg-canvas-soft border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface border border-hairline text-ink-secondary shrink-0 relative">
                        <Clock className="h-4 w-4" />
                        {(isWindowActive || isInGrace) && (
                          <span
                            className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-surface ${
                              isWindowActive ? "bg-emerald-500" : "bg-amber-500"
                            }`}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-ink flex items-center gap-1.5 flex-wrap">
                          <span className="whitespace-nowrap">Submission Window:</span>
                          <ExamWindowCountdownLabel
                            win={win}
                            isExamPublished={isExamPublished}
                            isEvaluationLocked={isEvaluationLocked}
                          />
                        </div>
                        <p className="text-[11px] text-ink-muted leading-tight mt-0.5">
                          {isWindowActive
                            ? "Eligible students can submit or replace PDF."
                            : isExamPublished
                            ? "Results published. Submissions closed permanently."
                            : isEvaluationLocked
                            ? "Evaluation underway or completed. Submissions locked."
                            : "Uploads blocked until opened by operator."}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center w-full sm:w-auto">
                      {isEvaluationLocked ? (
                        <span className="w-full sm:w-auto h-9 px-3 rounded-md border border-hairline bg-surface text-ink-muted text-xs font-medium inline-flex items-center justify-center gap-1.5 select-none">
                          <Lock className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                          <span>Finalized</span>
                        </span>
                      ) : !isWindowActive && !isInGrace ? (
                        <button
                          type="button"
                          onClick={() => {
                            setTargetExamForReopen(exam);
                            setReopenModalOpen(true);
                          }}
                          className="notion-btn-primary w-full sm:w-auto justify-center"
                        >
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span>Open Window</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleHardCloseWindow(exam.id, exam.title)}
                          disabled={closingExamId === exam.id}
                          className="notion-btn-danger w-full sm:w-auto justify-center"
                          title="Terminate active submission window immediately"
                        >
                          <Square className="h-3 w-3 fill-current shrink-0" />
                          <span>{closingExamId === exam.id ? "Closing..." : "Close"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="border-t border-hairline pt-3 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink-muted">Total Marks</span>
                      <span className="font-mono tabular-nums font-semibold text-ink bg-canvas-soft px-2 py-0.5 rounded-xs border border-hairline">
                        {exam.total_marks && exam.total_marks > 0 ? exam.total_marks : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {exam.status === "ARCHIVED" || exam.lifecycle_status === "ARCHIVED" ? (
                        <button
                          type="button"
                          onClick={() => handleRestoreExam(exam)}
                          className="notion-btn-utility min-h-0 h-8 px-2.5 text-xs"
                          title="Restore Archived Exam"
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span>Restore</span>
                        </button>
                      ) : (
                        (exam.is_published || ["PUBLISHED", "EVALUATED", "COMPLETED"].includes(exam.status)) && (
                          <button
                            type="button"
                            onClick={() => handleArchiveExam(exam)}
                            className="notion-btn-utility min-h-0 h-8 px-2.5 text-xs"
                            title="Archive Exam (Preserves all historical grades and records)"
                          >
                            <Archive className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                            <span>Archive</span>
                          </button>
                        )
                      )}

                      {canDeleteExam(exam) && (
                        <button
                          type="button"
                          onClick={() => promptDeleteExam(exam)}
                          className="notion-btn-danger min-h-0 h-8 px-2.5 text-xs"
                          title="Permanently Delete Exam"
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Balanced Action Strip: 2-col with full-width Submissions on mobile, 3-col on sm+ */}
                  <div className="grid grid-cols-2 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-3 gap-2">
                    <Link
                      href={`/exams/${exam.id}/rubric`}
                      className="notion-btn-utility justify-center text-xs"
                    >
                      <span>Rubric</span>
                    </Link>

                    <Link
                      href={`/marks?exam_id=${exam.id}`}
                      className="notion-btn-utility justify-center text-xs"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                      <span>Marks</span>
                    </Link>

                    <Link
                      href={`/exams/${exam.id}`}
                      className="notion-btn-primary justify-center text-xs"
                    >
                      <span className="truncate">Submissions</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CANONICAL UNIFIED MODAL: Open / Reopen Submission Window */}
      <ExamSubmissionWindowModal
        isOpen={reopenModalOpen && Boolean(targetExamForReopen)}
        onClose={() => {
          if (!isSubmittingWindow) {
            setReopenModalOpen(false);
            setTargetExamForReopen(null);
          }
        }}
        examTitle={targetExamForReopen?.title}
        hasPriorWindow={Boolean(targetExamForReopen && windowsMap[targetExamForReopen.id]?.has_window)}
        onSubmit={handleOpenWindowSubmit}
        isStarting={isSubmittingWindow}
      />

      {/* MODAL: Delete Exam Permanently */}
      <ModalCard
        isOpen={deleteModalOpen && Boolean(targetExamForDelete)}
        title="Delete Examination Permanently"
        disableClose={isDeletingExam}
        onClose={() => !isDeletingExam && setDeleteModalOpen(false)}
      >
        {targetExamForDelete && (
          <div className="space-y-4">
            {/* Warning Banner */}
            <div className="p-3.5 rounded-lg bg-red-50/80 dark:bg-[#2a1313] border border-red-200/80 dark:border-[#4a1f1f] text-red-900 dark:text-[#f28b82] space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-red-700 dark:text-[#f28b82]">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-[#f28b82] shrink-0" />
                <span>CRITICAL WARNING: Irreversible Cascade Deletion</span>
              </div>
              <p className="text-xs leading-relaxed">
                Deleting <span className="font-bold underline">{targetExamForDelete.title}</span> will permanently wipe out all related academic and evaluation assets across the entire system:
              </p>
              <ul className="text-xs list-disc list-inside space-y-1 pl-1">
                <li><span className="font-semibold">All Uploaded Answer Sheets:</span> Physical PDF and rendered image files permanently purged from Database and Cloud Storage / CDN.</li>
                <li><span className="font-semibold">All Evaluation Scores &amp; Marks:</span> Criterion-level marks, AI feedback, question breakdowns, and marks ledgers.</li>
                <li><span className="font-semibold">Exam Artifacts:</span> Question paper, answer key master documents, and rubric matrices.</li>
                <li><span className="font-semibold">Student Access &amp; Revaluations:</span> Submission windows, student portal publications, and dispute logs.</li>
              </ul>
              <p className="text-xs font-bold pt-1">
                This action cannot be undone. No recovery or rollback is possible.
              </p>
            </div>

            {/* Confirmation Input */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-ink">
                {targetExamForDelete.is_published ? (
                  <>
                    Because results are published, type the exact exam title{" "}
                    <span className="font-mono font-bold text-red-600 dark:text-[#f28b82] bg-red-50 dark:bg-[#2a1313] px-1.5 py-0.5 rounded-xs border border-red-200 dark:border-[#4a1f1f]">
                      {targetExamForDelete.title}
                    </span>{" "}
                    below to confirm permanent destruction of published academic records:
                  </>
                ) : (
                  <>
                    To proceed, type{" "}
                    <span className="font-mono font-bold text-red-600 dark:text-[#f28b82] bg-red-50 dark:bg-[#2a1313] px-1.5 py-0.5 rounded-xs border border-red-200 dark:border-[#4a1f1f]">
                      DELETE
                    </span>{" "}
                    in the box below:
                  </>
                )}
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={
                  targetExamForDelete.is_published
                    ? `Type "${targetExamForDelete.title}" to confirm`
                    : "Type DELETE to confirm"
                }
                disabled={isDeletingExam}
                className="w-full rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface px-3 py-2 text-xs sm:text-sm font-mono text-ink focus:border-red-500 focus:outline-none"
              />
            </div>

            {/* Modal Actions */}
            <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 pt-3 border-t border-hairline">
              <button
                type="button"
                onClick={() => !isDeletingExam && setDeleteModalOpen(false)}
                disabled={isDeletingExam}
                className="notion-btn-utility justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteExam}
                disabled={
                  isDeletingExam ||
                  (targetExamForDelete.is_published
                    ? deleteConfirmText.trim() !== targetExamForDelete.title.trim()
                    : deleteConfirmText.trim().toUpperCase() !== "DELETE")
                }
                className="notion-btn-danger justify-center font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isDeletingExam ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    <span>Purging...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Delete Exam</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </ModalCard>
    </div>
  );
}
