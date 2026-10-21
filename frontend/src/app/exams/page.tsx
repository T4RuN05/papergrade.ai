"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  GraduationCap,
  Plus,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  RotateCcw,
  Square,
  Sparkles,
  BarChart3,
  Layers,
  Building2,
  AlertCircle,
  FileSpreadsheet,
  Trash2,
  AlertTriangle,
  Loader2,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { Exam } from "@/lib/types";
import { useTenant } from "@/lib/TenantContext";
import { useToast } from "@/lib/ToastContext";
import {
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
  ModalCard,
  FormInput,
  ExamsGridSkeleton,
  useConfirm,
} from "@/components/ui";

export default function ExamsPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { selectedBranch, isRootAdmin, isBranchManager, currentUser, loading: tenantLoading } = useTenant();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowsMap, setWindowsMap] = useState<Record<string, any>>({});
  const [closingExamId, setClosingExamId] = useState<string | null>(null);

  // Custom Open/Reopen Window Modal
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [targetExamForReopen, setTargetExamForReopen] = useState<Exam | null>(null);
  const [reopenDuration, setReopenDuration] = useState("30");
  const [reopenReason, setReopenReason] = useState("");
  const [reopenScope, setReopenScope] = useState("ALL_STUDENTS");
  const [isSubmittingWindow, setIsSubmittingWindow] = useState(false);

  // Delete Exam State
  const [targetExamForDelete, setTargetExamForDelete] = useState<Exam | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingExam, setIsDeletingExam] = useState(false);

  const canDeleteExam = (exam: Exam) => Boolean(
    isRootAdmin ||
    (isBranchManager && (!currentUser?.branch_id || !exam.branch_id || currentUser.branch_id === exam.branch_id))
  );


  const loadExamsAndWindows = useCallback(async () => {
    if (tenantLoading && !selectedBranch?.id) return;

    setLoading(true);
    try {
      const data = await api.listExams(selectedBranch?.id);
      const examList = Array.isArray(data) ? data : [];
      setExams(examList);

      // Batch window status is already joined by the backend in a single query (0 extra roundtrips)
      const statusMap: Record<string, any> = {};
      for (const exam of examList) {
        statusMap[exam.id] = (exam as any).window_status || null;
      }
      setWindowsMap(statusMap);
    } catch (err: any) {
      console.error("Failed to load exams:", err);
      setExams([]);
    } finally {
      setLoading(false);
    }
  }, [selectedBranch?.id, tenantLoading]);

  useEffect(() => {
    loadExamsAndWindows();
  }, [loadExamsAndWindows]);

  // Real-time smooth local countdown ticker for active windows
  useEffect(() => {
    const hasActive = Object.values(windowsMap).some((w) => w?.is_active && w.seconds_remaining > 0);
    if (!hasActive) return;

    const ticker = setInterval(() => {
      setWindowsMap((prev) => {
        let changed = false;
        const next: Record<string, any> = {};
        for (const [id, win] of Object.entries(prev)) {
          if (win?.is_active && win.seconds_remaining > 0) {
            const rem = win.seconds_remaining - 1;
            next[id] = {
              ...win,
              seconds_remaining: rem,
              is_active: rem > 0,
              status: rem > 0 ? "OPEN" : "CLOSED",
            };
            changed = true;
          } else {
            next[id] = win;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(ticker);
  }, [windowsMap]);

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
    } catch (err: any) {
      const msg = err.message || "Failed to close window.";
      toast.error(msg, { title: "Window Close Failed" });
    } finally {
      setClosingExamId(null);
    }
  };

  // Submit Open / Custom Window
  const handleOpenWindowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetExamForReopen) return;

    const durationNum = parseInt(reopenDuration, 10) || 30;
    const reasonText = reopenReason.trim() || "Scheduled examination upload session";
    const examId = targetExamForReopen.id;
    const examTitle = targetExamForReopen.title;
    const hasPriorWindow = Boolean(windowsMap[examId]?.has_window);

    setIsSubmittingWindow(true);
    try {
      if (hasPriorWindow) {
        await api.reopenWindow(examId, {
          duration_minutes: durationNum,
          reason: reasonText,
          reopen_scope: reopenScope,
        });
      } else {
        await api.openWindow(examId, durationNum, 2);
      }

      toast.success(`Submission window opened for "${examTitle}" (${durationNum}m)!`, {
        title: "Window Opened",
      });

      // Optimistic immediate update + fetch status
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
      setReopenModalOpen(false);
      setTargetExamForReopen(null);
    } catch (err: any) {
      const msg = err.message || "Failed to open submission window.";
      toast.error(msg, { title: "Window Open Failed" });
    } finally {
      setIsSubmittingWindow(false);
    }
  };

  const handleDeleteExam = async () => {
    if (!targetExamForDelete) return;
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      toast.error("Please type DELETE to confirm deletion.", { title: "Confirmation Required" });
      return;
    }
    setIsDeletingExam(true);
    try {
      const res = await api.deleteExam(targetExamForDelete.id);
      toast.success(
        res.message || `Exam "${targetExamForDelete.title}" and all associated files/evaluations permanently deleted.`,
        { title: "Exam Deleted" }
      );
      setExams((prev) => prev.filter((e) => e.id !== targetExamForDelete.id));
      setWindowsMap((prev) => {
        const next = { ...prev };
        delete next[targetExamForDelete.id];
        return next;
      });
      setTargetExamForDelete(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete exam", { title: "Deletion Failed" });
    } finally {
      setIsDeletingExam(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-16">
        <ExamsGridSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <BadgePill label="Academic Operations" color="purple" />
            {selectedBranch && (
              <span className="text-xs font-semibold text-ink-secondary bg-canvas-soft border border-hairline px-2 py-0.5 rounded-md truncate max-w-[220px] sm:max-w-none">
                {selectedBranch.name} • {selectedBranch.city}
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink mt-1">
            Examinations & Evaluation Rubrics
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-0.5">
            Manage question papers, answer keys, AI rubrics, and 30-minute student upload windows for{" "}
            <span className="font-semibold text-ink">{selectedBranch?.name || "Active Branch"}</span>.
          </p>
        </div>

        <ButtonPrimary href="/exams/new" size="sm" className="w-full sm:w-auto justify-center">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Create New Exam
        </ButtonPrimary>
      </div>



      {/* 3. Main Content Area */}
      {loading ? (
        <FeatureCard className="p-16 text-center text-xs text-ink-muted animate-pulse">
          Loading examinations for {selectedBranch?.name || "active branch"}...
        </FeatureCard>
      ) : exams.length === 0 ? (
        <FeatureCard className="p-12 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-canvas-soft border border-hairline flex items-center justify-center text-ink-muted">
            <FileText className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-ink">
            No examinations found for {selectedBranch?.name || "this branch"}.
          </p>
          <p className="text-xs text-ink-muted max-w-sm mx-auto">
            Create an examination and upload a question paper to begin automated rubric generation and student testing.
          </p>
          <div className="pt-2">
            <ButtonPrimary href="/exams/new" size="sm">
              Create Exam Now →
            </ButtonPrimary>
          </div>
        </FeatureCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {exams.map((exam) => {
            const win = windowsMap[exam.id];
            const isWindowActive = win?.is_active;
            const isInGrace = win?.is_in_grace;
            const secondsRemaining = win?.seconds_remaining || 0;
            const minutesRemaining = Math.max(0, Math.floor(secondsRemaining / 60));

            const isRubricApproved = Boolean(
              exam.is_rubric_approved ||
              exam.has_approved_rubric ||
              exam.status === "RUBRIC_APPROVED" ||
              exam.lifecycle_status === "APPROVED" ||
              ["RUBRIC_APPROVED", "SUBMISSION_OPEN", "EVALUATING", "EVALUATED", "COMPLETED", "PUBLISHED"].includes(exam.status) ||
              ["RUBRIC_APPROVED", "SUBMISSION_OPEN", "EVALUATING", "EVALUATED", "COMPLETED", "PUBLISHED", "APPROVED"].includes(exam.lifecycle_status || "")
            );

            return (
              <FeatureCard
                key={exam.id}
                className="p-3.5 sm:p-5 flex flex-col justify-between space-y-3.5 sm:space-y-4 hover:border-[#c5c5c5] transition-colors"
              >
                {/* Top Section */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    {/* Title and Badges */}
                    <div className="flex items-start justify-between gap-2.5">
                      <h3 className="text-sm sm:text-base font-bold text-ink leading-snug break-words min-w-0 flex-1">
                        {exam.title}
                      </h3>

                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        {exam.is_published ? (
                          <BadgePill label="Published" color="purple" />
                        ) : exam.status === "EVALUATED" || exam.lifecycle_status === "EVALUATED" ? (
                          <BadgePill label="Evaluated" color="teal" />
                        ) : exam.status === "EVALUATING" || exam.lifecycle_status === "EVALUATING" ? (
                          <BadgePill label="Evaluating" color="purple" />
                        ) : null}

                        <BadgePill
                          label={
                            isRubricApproved
                              ? "Rubric Approved"
                              : exam.current_rubric_version_id
                              ? "Draft Rubric"
                              : "No Rubric"
                          }
                          color={
                            isRubricApproved
                              ? "green"
                              : exam.current_rubric_version_id
                              ? "orange"
                              : "gray"
                          }
                        />
                      </div>
                    </div>

                    {/* Subject & Scoped Batch Meta Tags */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center text-[11px] font-semibold text-ink-secondary bg-canvas-soft px-2 py-0.5 rounded border border-hairline/80">
                        {exam.subject}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted bg-canvas-soft px-2 py-0.5 rounded border border-hairline/80">
                        <Users className="h-3 w-3 text-ink-secondary shrink-0" />
                        <span className="truncate max-w-[200px] sm:max-w-none">
                          {exam.batch_scope === "SPECIFIC" && exam.scoped_batches && exam.scoped_batches.length > 0
                            ? exam.scoped_batches.length === 1
                              ? exam.scoped_batches[0].name
                              : `${exam.scoped_batches.length} Batches`
                            : "Whole Branch"}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Submission Window Pill / Controller */}
                  <div className="p-2.5 sm:p-3 rounded-lg bg-canvas-soft border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                      <div className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-md border shrink-0 ${
                        isWindowActive
                          ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                          : isInGrace
                          ? "bg-amber-50 border-amber-200 text-amber-600"
                          : "bg-surface border-hairline text-ink-secondary"
                      }`}>
                        <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-ink flex items-center gap-1.5 flex-wrap">
                          <span className="whitespace-nowrap">Submission Window:</span>
                          {isWindowActive ? (
                            <span className="text-emerald-700 font-bold whitespace-nowrap">
                              Active ({minutesRemaining}m left)
                            </span>
                          ) : isInGrace ? (
                            <span className="text-amber-700 font-bold whitespace-nowrap">
                              Grace ({win?.grace_seconds_remaining || 0}s)
                            </span>
                          ) : (
                            <span className="text-ink-muted font-medium whitespace-nowrap">Closed</span>
                          )}
                        </div>
                        <p className="text-[10.5px] sm:text-[11px] text-ink-muted leading-tight mt-0.5">
                          {isWindowActive
                            ? "Eligible students can submit or replace PDF."
                            : "Uploads blocked until opened by operator."}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center">
                      {!isWindowActive && !isInGrace ? (
                        <ButtonPrimary
                          size="sm"
                          onClick={() => {
                            setTargetExamForReopen(exam);
                            setReopenReason(windowsMap[exam.id]?.has_window ? "Reopened by administrator" : "Scheduled examination upload session");
                            setReopenDuration("30");
                            setReopenScope("ALL_STUDENTS");
                            setReopenModalOpen(true);
                          }}
                          className="w-full sm:w-auto justify-center whitespace-nowrap px-3 py-1.5 text-xs shadow-xs cursor-pointer"
                        >
                          <Clock className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                          Open Window
                        </ButtonPrimary>
                      ) : (
                        <ButtonUtility
                          size="sm"
                          onClick={() => handleHardCloseWindow(exam.id, exam.title)}
                          disabled={closingExamId === exam.id}
                          className="w-full sm:w-auto justify-center whitespace-nowrap px-2.5 py-1.5 text-xs bg-red-50 text-red-700 border-red-200 hover:bg-red-100 font-semibold cursor-pointer"
                          title="Terminate active submission window immediately"
                        >
                          <Square className="h-3 w-3 mr-1 fill-red-600 text-red-600 shrink-0" />
                          {closingExamId === exam.id ? "Closing..." : "Close"}
                        </ButtonUtility>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="border-t border-hairline pt-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-ink-muted">
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink-muted text-xs">Total Marks:</span>
                      <span className="font-mono font-bold text-ink bg-canvas-soft px-1.5 py-0.5 rounded border border-hairline/70 text-xs">
                        {exam.total_marks && exam.total_marks > 0 ? exam.total_marks : "N/A"}
                      </span>
                    </div>

                    {canDeleteExam(exam) && (
                      <button
                        type="button"
                        onClick={() => {
                          setTargetExamForDelete(exam);
                          setDeleteConfirmText("");
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-ink-muted hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer text-xs font-medium"
                        title="Permanently Delete Exam"
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-[11px] sm:hidden">Delete</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                    <Link
                      href={`/exams/${exam.id}/rubric`}
                      className="inline-flex items-center justify-center py-2 px-2 rounded-md border border-hairline bg-surface hover:bg-canvas-soft text-ink-secondary hover:text-ink font-semibold text-xs transition-colors shadow-2xs text-center active:scale-[0.98]"
                    >
                      <span>Rubric</span>
                    </Link>

                    <Link
                      href={`/marks?exam_id=${exam.id}`}
                      className="inline-flex items-center justify-center gap-1 py-2 px-2 rounded-md border border-hairline bg-surface hover:bg-canvas-soft text-ink-secondary hover:text-ink font-semibold text-xs transition-colors shadow-2xs text-center active:scale-[0.98]"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                      <span>Marks</span>
                    </Link>

                    <Link
                      href={`/exams/${exam.id}`}
                      className="inline-flex items-center justify-center gap-1 py-2 px-2 rounded-md bg-primary hover:bg-primary-hover text-white font-bold text-xs transition-colors shadow-xs text-center active:scale-[0.98]"
                    >
                      <span className="truncate">Submissions</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    </Link>
                  </div>
                </div>
              </FeatureCard>
            );
          })}
        </div>
      )}

      {/* MODAL: Open / Reopen Submission Window */}
      {reopenModalOpen && targetExamForReopen && (
        <ModalCard
          title={
            windowsMap[targetExamForReopen.id]?.has_window
              ? `Reopen Window: ${targetExamForReopen.title}`
              : `Open Window: ${targetExamForReopen.title}`
          }
          onClose={() => !isSubmittingWindow && setReopenModalOpen(false)}
        >
          <form onSubmit={handleOpenWindowSubmit} className="space-y-4">
            <p className="text-xs text-ink-muted">
              Configure submission window duration and target student scope. Once activated, the server-enforced countdown timer begins immediately for all eligible students.
            </p>

            <FormInput
              label="Session Note / Audit Reason"
              placeholder="e.g. Scheduled examination upload, network delay grace"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Duration</label>
                <select
                  value={reopenDuration}
                  onChange={(e) => setReopenDuration(e.target.value)}
                  disabled={isSubmittingWindow}
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
                  value={reopenScope}
                  onChange={(e) => setReopenScope(e.target.value)}
                  disabled={isSubmittingWindow}
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
                onClick={() => setReopenModalOpen(false)}
                disabled={isSubmittingWindow}
              >
                Cancel
              </ButtonUtility>
              <ButtonPrimary
                type="submit"
                isLoading={isSubmittingWindow}
                disabled={isSubmittingWindow || !reopenReason.trim()}
              >
                {isSubmittingWindow
                  ? "Opening Window..."
                  : windowsMap[targetExamForReopen.id]?.has_window
                  ? "Confirm Reopening"
                  : "Open Window"}
              </ButtonPrimary>
            </div>
          </form>
        </ModalCard>
      )}

      {/* MODAL: Delete Exam Permanently */}
      {targetExamForDelete && (
        <ModalCard
          title="Delete Examination Permanently"
          onClose={() => !isDeletingExam && setTargetExamForDelete(null)}
        >
          <div className="space-y-4">
            {/* Warning Banner */}
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200/80 text-red-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-red-700">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                <span>CRITICAL WARNING: Irreversible Cascade Deletion</span>
              </div>
              <p className="text-xs text-red-800 leading-relaxed">
                Deleting <span className="font-bold underline">{targetExamForDelete.title}</span> will permanently wipe out all related academic and evaluation assets across the entire system:
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
                onClick={() => setTargetExamForDelete(null)}
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
