"use client";

import React from "react";
import Link from "next/link";
import {
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Sparkles,
  ChevronDown,
  Eye,
  FileText,
  Trophy,
  BookOpen,
  Download,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { FeatureCard } from "@/components/ui";
import { api } from "@/lib/api";
import { useToast } from "@/lib/ToastContext";

export function GoogleDriveIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 87.3 78" fill="none">
      <path
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z"
        fill="currentColor"
        opacity="0.8"
      />
      <path
        d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44C.4 49.9 0 51.45 0 53h27.5z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.15z"
        fill="currentColor"
        opacity="0.75"
      />
      <path
        d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"
        fill="currentColor"
      />
      <path
        d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.4 4.5-1.2z"
        fill="currentColor"
        opacity="0.85"
      />
      <path
        d="m73.55 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.8 25l16 27.7h27.5c0-1.55-.4-3.1-1.2-4.5z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}

export const PAST_EXAMS_BATCH_SIZE = 5;

export interface PastExamCardProps {
  sub: any;
  idx: number;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onOpenBreakdown: (sub: any) => void;
  onOpenRankings: (sub: any) => void;
  onOpenArtifacts: (sub: any) => void;
  onOpenReval: (sub: any) => void;
}

export const PastExamCard = React.memo(function PastExamCard({
  sub,
  idx,
  isExpanded,
  onToggle,
  onOpenBreakdown,
  onOpenRankings,
  onOpenArtifacts,
  onOpenReval,
}: PastExamCardProps) {
  const { toast } = useToast();
  const isAbsent = sub.status === "ABSENT" || Boolean(sub.is_absent);
  const isExamPublished =
    !isAbsent &&
    Boolean(
      sub.exam_is_published === 1 ||
      sub.exam_is_published === true ||
      sub.exam_lifecycle_status === "PUBLISHED" ||
      sub.exam_status === "PUBLISHED"
    );
  const isPublished =
    !isAbsent && (
      sub.publication_status === "PUBLISHED" ||
      (sub.publication_status !== "UNPUBLISHED" && Boolean(sub.exam_is_published || sub.is_published))
    );
  const hasAnswers = sub.answers && sub.answers.length > 0;
  const reval = sub.revaluation;
  const hasOpenReval =
    reval && (reval.status === "SUBMITTED" || reval.status === "UNDER_REVIEW");
  const isRevalResolved = reval && reval.status === "RESOLVED";

  const [syncing, setSyncing] = React.useState(false);
  const [driveArchive, setDriveArchive] = React.useState(sub.drive_archive);

  React.useEffect(() => {
    setDriveArchive(sub.drive_archive);
  }, [sub.drive_archive]);

  const handleManualSync = async () => {
    if (syncing) return;
    try {
      setSyncing(true);
      const res = await api.syncSubmissionToDrive(sub.id);
      if (res.archive_status === "EXPORTED") {
        setDriveArchive({
          archive_status: "EXPORTED",
          drive_web_view_link: res.web_view_link,
          exported_at: res.exported_at || new Date().toISOString(),
        });
        toast.success(
          `${sub.exam_title || "Exam paper"} successfully backed up to your Google Drive!`,
          { title: "Drive Synced", duration: 5000 }
        );
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not sync exam paper to Google Drive.", {
        title: "Sync Failed",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <FeatureCard
      style={{ animationDelay: `${(idx % PAST_EXAMS_BATCH_SIZE) * 40}ms` }}
      className={`animate-cascade transition-colors duration-200 rounded-lg border p-4 sm:p-5 ${
        isExpanded
          ? "border-primary/40 ring-1 ring-primary/15"
          : "hover:border-hairline-strong hover:bg-canvas-soft/30 cursor-pointer"
      }`}
    >
      {/* Collapsed Header */}
      <div
        onClick={() => onToggle(sub.id)}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm sm:text-[15px] font-semibold text-ink tracking-[-0.008em] leading-snug">
              {sub.exam_title || "Academic Examination"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
            {(sub.exam_subject || sub.subject) && (
              <>
                <span className="font-medium text-ink-secondary">{sub.exam_subject || sub.subject}</span>
                <span className="text-ink-faint">•</span>
              </>
            )}
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <Calendar className="h-3 w-3 text-ink-faint shrink-0" />
              <span>
                {isAbsent ? "Missed" : "Submitted"}{" "}
                {sub.created_at
                  ? new Date(sub.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "Recorded"}
              </span>
            </span>
            <span className="text-ink-faint">•</span>
            <span className="font-mono text-[11px] text-ink-secondary whitespace-nowrap">
              {sub.roll_number}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-0.5 sm:pt-0">
          {/* Primary Status Indicator (Single calm dot badge) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {isAbsent ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                Absent
              </span>
            ) : isPublished ? (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary whitespace-nowrap"
                title={
                  sub.is_document_purged
                    ? "PDF purged per retention policy; marks archived"
                    : `${sub.days_remaining ?? 15} days until PDF archival`
                }
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                {hasOpenReval
                  ? "In Revaluation"
                  : isRevalResolved && reval.decision === "MARKS_REVISED"
                  ? "Marks Revised"
                  : sub.is_document_purged
                  ? "Archived"
                  : "Published"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                Grading
              </span>
            )}

            {/* Tabular Score Pill */}
            {isAbsent ? (
              <span className="px-2.5 py-0.5 rounded-md bg-canvas-soft border border-hairline text-xs font-mono tabular-nums font-semibold text-ink-muted whitespace-nowrap">
                0.0 / {sub.max_marks || sub.exam_total_marks || 25}m
              </span>
            ) : isPublished && sub.total_awarded_marks !== null ? (
              <span className="px-2.5 py-0.5 rounded-md bg-canvas-soft border border-hairline text-xs font-mono tabular-nums font-semibold text-ink whitespace-nowrap">
                {Number(sub.total_awarded_marks).toFixed(1)} / {sub.max_marks || sub.exam_total_marks || 25}m
                {sub.percentage !== null && (
                  <span className="text-ink-muted font-normal ml-1">
                    ({Number(sub.percentage).toFixed(0)}%)
                  </span>
                )}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(sub.id);
            }}
            className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
            aria-label={isExpanded ? "Collapse exam card" : "Expand exam card"}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${
                isExpanded ? "rotate-180 text-primary" : "rotate-0 text-ink-muted"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Expanded Content (Apple-style smooth CSS grid accordion) */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[grid-template-rows] ${
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden min-h-0">
          <div
            className={`pt-3.5 mt-3 border-t border-hairline space-y-4 transition-[opacity,transform] duration-250 ease-out will-change-[opacity,transform] ${
              isExpanded
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-1 pointer-events-none"
            }`}
          >
            {isAbsent ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-lg bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-rose-900 dark:text-rose-200">Candidate Recorded as Absent</div>
                    <div className="text-[11px] text-rose-700 dark:text-rose-400">
                      No answer sheet was uploaded during the exam window. This paper was not evaluated.
                    </div>
                  </div>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <div className="text-sm font-bold text-rose-700 dark:text-rose-300 font-mono">0.0 / {sub.exam_total_marks || 25}</div>
                  <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold uppercase">Absent</div>
                </div>
              </div>
            ) : isPublished ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2.5 sm:p-3.5 rounded-lg bg-canvas-soft border border-hairline">
                <div className="grid grid-cols-3 sm:flex items-center gap-2 sm:gap-4">
                  <div>
                    <div className="text-[10px] sm:text-[11px] font-medium text-ink-muted leading-none">
                      Total Score
                    </div>
                    <div className="text-base sm:text-xl font-bold text-ink mt-0.5 leading-tight">
                      {sub.total_awarded_marks !== null && sub.total_awarded_marks !== undefined
                        ? Number(sub.total_awarded_marks).toFixed(1)
                        : "—"}{" "}
                      <span className="text-[10px] sm:text-xs font-normal text-ink-muted">
                        / {sub.max_marks || sub.exam_total_marks || 25}m
                      </span>
                    </div>
                  </div>

                  <div className="h-7 w-px bg-hairline hidden sm:block" />

                  <div>
                    <div className="text-[10px] sm:text-[11px] font-medium text-ink-muted leading-none">
                      Percentage
                    </div>
                    <div className="text-sm sm:text-base font-bold text-ink mt-0.5 leading-tight">
                      {sub.percentage !== null && sub.percentage !== undefined
                        ? `${Number(sub.percentage).toFixed(1)}%`
                        : "—"}
                    </div>
                  </div>

                  <div className="h-7 w-px bg-hairline hidden sm:block" />

                  <div>
                    <div className="text-[10px] sm:text-[11px] font-medium text-ink-muted leading-none">
                      Questions
                    </div>
                    <div className="text-[11px] sm:text-xs font-semibold text-ink mt-0.5 leading-tight truncate">
                      {hasAnswers ? `${sub.answers.length} Graded` : "Registered"}
                    </div>
                  </div>
                </div>

                {isRevalResolved && reval.reviewer_notes && (
                  <div className="sm:max-w-xs text-left bg-surface border border-hairline p-2 rounded-md">
                    <div className="text-[10px] font-semibold text-ink-secondary">
                      Faculty Feedback:
                    </div>
                    <p className="text-[11px] text-ink italic line-clamp-2">
                      "{reval.reviewer_notes}"
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {/* Actions Row — Symmetrical Notion Action Grid */}
            <div className="pt-1 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
              {isAbsent ? (
                <button
                  type="button"
                  disabled
                  className="w-full sm:w-auto notion-btn-utility opacity-60 cursor-not-allowed text-ink-muted"
                >
                  <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                  <span>No Script Uploaded</span>
                </button>
              ) : (
                <Link
                  href={`/student/submissions/${sub.id}`}
                  className="w-full sm:w-auto notion-btn-primary"
                >
                  <Eye className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {isPublished
                      ? sub.is_document_purged
                        ? "View Archived Marks →"
                        : "Inspect Sheet →"
                      : "View Submitted Sheet →"}
                  </span>
                </Link>
              )}

              <div className="grid grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1 sm:flex sm:flex-wrap sm:items-center gap-2 w-full sm:w-auto sm:flex-1">
                {/* Secondary: View Breakdown */}
                {isPublished ? (
                  <button
                    type="button"
                    onClick={() => onOpenBreakdown(sub)}
                    className="notion-btn-utility"
                  >
                    <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>View Summary</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Detailed breakdown will be accessible once marks are officially published by faculty."
                    className="notion-btn-utility opacity-55 cursor-not-allowed text-ink-muted"
                  >
                    <FileText className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                    <span>Summary Pending</span>
                  </button>
                )}

                {/* Class Standings & Rankings */}
                {isExamPublished && (
                  <button
                    type="button"
                    onClick={() => onOpenRankings(sub)}
                    className="notion-btn-utility"
                    title="View Official Class Standings & Rankings"
                  >
                    <Trophy className="h-3.5 w-3.5 text-ink-secondary shrink-0" />
                    <span>Class Standings</span>
                  </button>
                )}

                {/* Question Paper & Answer Key Viewer */}
                {isPublished && (sub.has_question_paper || sub.has_answer_key) && (
                  <button
                    type="button"
                    onClick={() => onOpenArtifacts(sub)}
                    className="notion-btn-utility"
                    title="View Question Paper & Official Answer Key"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>QP & Key</span>
                  </button>
                )}

                {/* Download Graded PDF */}
                {isPublished ? (
                  sub.is_document_purged ? (
                    <button
                      type="button"
                      disabled
                      title="Graded PDF was permanently purged after 15 days to preserve storage. Question marks remain archived."
                      className="notion-btn-utility opacity-55 cursor-not-allowed text-ink-muted"
                    >
                      <Download className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                      <span>PDF Expired</span>
                    </button>
                  ) : (
                    <a
                      href={api.getAnnotatedPdfUrl(sub.id)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() =>
                        toast.info("Opening evaluated answer sheet...", { title: "Graded Paper" })
                      }
                      className="notion-btn-utility"
                      title={`Download before expiration (${sub.days_remaining ?? 15} days remaining)`}
                    >
                      <Download className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>Download PDF</span>
                    </a>
                  )
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Evaluated PDF download will be enabled once faculty officially publishes results."
                    className="notion-btn-utility opacity-55 cursor-not-allowed text-ink-muted"
                  >
                    <Download className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                    <span>PDF Pending</span>
                  </button>
                )}

                {/* Google Drive Action Button */}
                {isPublished && !sub.is_document_purged && (
                  driveArchive?.archive_status === "EXPORTED" && driveArchive.drive_web_view_link ? (
                    <a
                      href={driveArchive.drive_web_view_link}
                      target="_blank"
                      rel="noreferrer"
                      className="notion-btn-utility"
                      title="Open backed up script in personal Google Drive"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <GoogleDriveIcon className="h-3.5 w-3.5 shrink-0" />
                      <span>In Drive</span>
                      <ExternalLink className="h-3 w-3 text-ink-muted shrink-0" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={handleManualSync}
                      disabled={syncing}
                      className="notion-btn-utility disabled:opacity-50"
                      title="Backup graded paper to personal Google Drive"
                    >
                      {syncing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-ink-muted" />
                      ) : (
                        <GoogleDriveIcon className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>{syncing ? "Syncing..." : "Backup to Drive"}</span>
                    </button>
                  )
                )}

                {/* Revaluation Appeal Status / Action */}
                {isPublished && (hasOpenReval || isRevalResolved) && (
                  hasOpenReval ? (
                    <Link
                      href="/student/revaluation"
                      className="notion-btn-utility"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      <span>Reval Active →</span>
                    </Link>
                  ) : (
                    <Link
                      href="/student/revaluation"
                      className="notion-btn-utility"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span>Reval Done →</span>
                    </Link>
                  )
                )}

                {isPublished && !hasOpenReval && !isRevalResolved && (
                  <button
                    type="button"
                    onClick={() => onOpenReval(sub)}
                    className="notion-btn-utility"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                    <span>Revaluation</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </FeatureCard>
  );
});
