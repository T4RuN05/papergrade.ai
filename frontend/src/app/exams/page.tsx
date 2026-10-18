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
  const { selectedBranch, loading: tenantLoading } = useTenant();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowsMap, setWindowsMap] = useState<Record<string, any>>({});
  const [closingExamId, setClosingExamId] = useState<string | null>(null);

  // Reopen Window Modal
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [targetExamForReopen, setTargetExamForReopen] = useState<Exam | null>(null);
  const [reopenDuration, setReopenDuration] = useState("30");
  const [reopenReason, setReopenReason] = useState("");
  const [reopenScope, setReopenScope] = useState("ALL_STUDENTS");


  const loadExamsAndWindows = useCallback(async () => {
    if (tenantLoading && !selectedBranch?.id) return;

    setLoading(true);
    try {
      const data = await api.listExams(selectedBranch?.id);
      const examList = Array.isArray(data) ? data : [];
      setExams(examList);

      // Fetch window status for each exam
      const statusMap: Record<string, any> = {};
      await Promise.all(
        examList.map(async (exam) => {
          try {
            const win = await api.getWindowStatus(exam.id);
            statusMap[exam.id] = win;
          } catch {
            statusMap[exam.id] = null;
          }
        })
      );
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

  // Open 30-min window
  const handleOpenWindow = async (examId: string, examTitle: string) => {
    try {
      await api.openWindow(examId, 30, 2);
      toast.success(`30-minute student submission window opened for "${examTitle}"!`, { title: "Window Opened" });
      const win = await api.getWindowStatus(examId);
      setWindowsMap((prev) => ({ ...prev, [examId]: win }));
    } catch (err: any) {
      const msg = err.message || "Failed to open window.";
      toast.error(msg, { title: "Window Open Failed" });
    }
  };

  // Hard close active window
  const handleHardCloseWindow = async (examId: string, examTitle: string) => {
    const ok = await confirm({
      title: "Hard Close Submission Window",
      message: `Are you sure you want to hard close the active submission window for "${examTitle}"? Students will immediately be blocked from uploading any further answer sheets.`,
      confirmText: "Hard Close Window",
      variant: "danger",
    });
    if (!ok) return;

    setClosingExamId(examId);
    try {
      await api.closeWindow(examId, "Hard closed early by administrator");
      toast.success(`Submission window hard closed for "${examTitle}".`, { title: "Window Closed" });
      const win = await api.getWindowStatus(examId);
      setWindowsMap((prev) => ({ ...prev, [examId]: win }));
    } catch (err: any) {
      const msg = err.message || "Failed to close window.";
      toast.error(msg, { title: "Window Close Failed" });
    } finally {
      setClosingExamId(null);
    }
  };

  // Submit Reopen
  const handleReopenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetExamForReopen || !reopenReason.trim()) return;

    try {
      await api.reopenWindow(targetExamForReopen.id, {
        duration_minutes: parseInt(reopenDuration, 10),
        reason: reopenReason.trim(),
        reopen_scope: reopenScope,
      });
      setReopenModalOpen(false);
      setReopenReason("");
      toast.success(`Submission window reopened for "${targetExamForReopen.title}" (${reopenDuration}m)!`, { title: "Window Reopened" });
      const win = await api.getWindowStatus(targetExamForReopen.id);
      setWindowsMap((prev) => ({ ...prev, [targetExamForReopen.id]: win }));
    } catch (err: any) {
      const msg = err.message || "Failed to reopen window.";
      toast.error(msg, { title: "Reopen Failed" });
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2">
            <BadgePill label="Academic Operations" color="purple" />
            {selectedBranch && (
              <span className="text-xs font-semibold text-ink-secondary bg-canvas-soft border border-hairline px-2 py-0.5 rounded-md">
                {selectedBranch.name} • {selectedBranch.city}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink mt-1">
            Examinations & Evaluation Rubrics
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-0.5">
            Manage question papers, answer keys, AI rubrics, and 30-minute student upload windows for{" "}
            <span className="font-semibold text-ink">{selectedBranch?.name || "Active Branch"}</span>.
          </p>
        </div>

        <ButtonPrimary href="/exams/new" size="sm" className="self-start sm:self-auto">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                className="p-5 flex flex-col justify-between space-y-4 hover:border-[#d0d0d0] transition-colors"
              >
                {/* Top Section */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-ink leading-tight">{exam.title}</h3>
                      <p className="text-xs text-ink-muted mt-0.5">
                        Subject: <span className="font-medium text-ink-secondary">{exam.subject}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
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

                  {/* Submission Window Pill / Controller */}
                  <div className="p-2.5 sm:p-3 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-between gap-2.5 sm:gap-3">
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-md bg-surface border border-hairline shrink-0">
                        <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-ink-secondary" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-ink flex items-center gap-1.5 flex-wrap">
                          <span className="whitespace-nowrap">30-Min Window:</span>
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
                        <div className="text-[10px] text-ink-faint truncate max-w-[190px] xs:max-w-[240px] sm:max-w-none">
                          {isWindowActive
                            ? "Eligible students can submit or replace PDF."
                            : "Uploads blocked until opened by operator."}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {!isWindowActive && !isInGrace ? (
                        <div className="flex items-center gap-1.5">
                          <ButtonPrimary
                            size="sm"
                            onClick={() => handleOpenWindow(exam.id, exam.title)}
                            className="whitespace-nowrap px-3 py-1.5 text-xs shadow-xs"
                          >
                            Open 30m
                          </ButtonPrimary>
                          <ButtonUtility
                            size="sm"
                            onClick={() => {
                              setTargetExamForReopen(exam);
                              setReopenModalOpen(true);
                            }}
                            className="whitespace-nowrap px-2 py-1.5 text-xs"
                            title="Reopen window with custom duration/reason"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </ButtonUtility>
                        </div>
                      ) : (
                        <ButtonUtility
                          size="sm"
                          onClick={() => handleHardCloseWindow(exam.id, exam.title)}
                          disabled={closingExamId === exam.id}
                          className="whitespace-nowrap px-2.5 py-1.5 text-xs bg-red-50 text-red-700 border-red-200 hover:bg-red-100 font-semibold cursor-pointer"
                          title="Terminate active submission window immediately"
                        >
                          <Square className="h-3 w-3 mr-1 fill-red-600 text-red-600" />
                          {closingExamId === exam.id ? "Closing..." : "Hard Close"}
                        </ButtonUtility>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="flex items-center justify-between text-xs text-ink-muted border-t border-hairline pt-3">
                  <span>
                    Total Marks: <span className="font-mono font-bold text-ink">{exam.total_marks && exam.total_marks > 0 ? exam.total_marks : "N/A"}</span>
                  </span>

                  <div className="flex items-center gap-3">
                    <Link
                      href={`/exams/${exam.id}/rubric`}
                      className="text-ink-secondary hover:text-ink font-semibold text-xs transition-colors"
                    >
                      Rubric
                    </Link>

                    <Link
                      href={`/marks`}
                      className="text-ink-secondary hover:text-ink font-semibold text-xs transition-colors flex items-center gap-1"
                    >
                      <FileSpreadsheet className="h-3 w-3" />
                      Marks
                    </Link>

                    <Link
                      href={`/exams/${exam.id}`}
                      className="inline-flex items-center gap-1 font-bold text-primary hover:text-primary-active transition-colors text-xs"
                    >
                      <span>Submissions</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </FeatureCard>
            );
          })}
        </div>
      )}

      {/* MODAL: Reopen Submission Window */}
      {reopenModalOpen && targetExamForReopen && (
        <ModalCard
          title={`Reopen Window: ${targetExamForReopen.title}`}
          onClose={() => setReopenModalOpen(false)}
        >
          <form onSubmit={handleReopenSubmit} className="space-y-4">
            <p className="text-xs text-ink-muted">
              Reopening a submission window requires an explicit justification reason, duration, and scope.
              This action is recorded in the immutable audit log.
            </p>

            <FormInput
              label="Audit Reason for Reopening"
              placeholder="e.g. Server connectivity delay at branch, student scan issue"
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
                  className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
                >
                  <option value="5">5 Minutes</option>
                  <option value="15">15 Minutes</option>
                  <option value="30">30 Minutes</option>
                  <option value="60">60 Minutes</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Target Scope</label>
                <select
                  value={reopenScope}
                  onChange={(e) => setReopenScope(e.target.value)}
                  className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-xs text-ink focus:border-primary focus:outline-none"
                >
                  <option value="ALL_STUDENTS">All Students (Replacements Allowed)</option>
                  <option value="UNSUBMITTED_ONLY">Unsubmitted Students Only</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <ButtonUtility type="button" onClick={() => setReopenModalOpen(false)}>
                Cancel
              </ButtonUtility>
              <ButtonPrimary type="submit" disabled={!reopenReason.trim()}>
                Confirm Reopening
              </ButtonPrimary>
            </div>
          </form>
        </ModalCard>
      )}
    </div>
  );
}
