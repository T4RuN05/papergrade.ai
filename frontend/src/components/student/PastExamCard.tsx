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
      style={{ animationDelay: `${(idx % PAST_EXAMS_BATCH_SIZE) * 50}ms` }}
      className={`animate-cascade transition-[border-color,box-shadow,background-color] duration-200 border p-4 sm:p-5 ${
        isExpanded
          ? "shadow-sm border-primary/30 ring-1 ring-primary/20"
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
            <span className="text-sm sm:text-base font-bold text-ink hover:text-primary transition-colors leading-snug">
              {sub.exam_title || "Academic Examination"}
            </span>
            {(sub.exam_subject || sub.subject) && (
              <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-md bg-canvas-soft border border-hairline text-ink-muted shrink-0">
                {sub.exam_subject || sub.subject}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-muted mt-0.5">
            <span className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <Calendar className="h-3 w-3 text-ink-muted shrink-0" />
              <span>
                {isAbsent ? "Examination missed" : "Submitted on"}{" "}
                {sub.created_at
                  ? new Date(sub.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Recorded"}
              </span>
            </span>
            <span className="text-ink-faint hidden xs:inline">•</span>
            <span className="inline-flex items-center font-mono whitespace-nowrap bg-canvas-soft/70 dark:bg-[#1a1a1a] border border-hairline/60 px-1.5 py-0.5 rounded-md text-[10.5px] text-ink-secondary shrink-0">
              Roll: <strong className="text-ink ml-1 font-semibold">{sub.roll_number}</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-start sm:self-center pt-0.5 sm:pt-0">
          {isAbsent ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#fbf0f0] text-[#872323] border border-[#ecd0d0] dark:bg-[#261212] dark:text-[#e87878] dark:border-[#491f1f] whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <AlertCircle className="h-3 w-3 text-[#872323] dark:text-[#e87878]" />
              Absent
            </span>
          ) : isPublished ? (
            <>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#edf5f0] text-[#1e613b] border border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <CheckCircle2 className="h-3 w-3 text-[#1e613b] dark:text-[#86d4a4]" />
                Results Published
              </span>
              {sub.is_document_purged ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#f1f0ee] text-[#4d4a46] border border-[#dedcd8] dark:bg-[#1e1e1e] dark:text-[#a8a6a2] dark:border-[#2f2f2f] whitespace-nowrap">
                  <AlertCircle className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                  PDF Archived
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  title="Graded PDFs are deleted 15 days post-evaluation to optimize system storage."
                >
                  <Clock className="h-3 w-3 text-[#7a4e18] dark:text-[#e5ad68]" />
                  {sub.days_remaining !== undefined && sub.days_remaining !== null
                    ? `${sub.days_remaining}d until purge`
                    : "15d retention"}
                </span>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] whitespace-nowrap shadow-2xs">
              <Clock className="h-3 w-3 text-[#7a4e18] dark:text-[#e5ad68]" />
              Grading in Progress
            </span>
          )}

          {hasOpenReval && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] whitespace-nowrap">
              <RotateCcw className="h-3 w-3 animate-spin" />
              In Review
            </span>
          )}

          {isRevalResolved && reval.decision === "MARKS_REVISED" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#edf5f0] text-[#1e613b] border border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] whitespace-nowrap">
              <Sparkles className="h-3 w-3 text-[#1e613b] dark:text-[#86d4a4]" />
              Marks Revised
            </span>
          )}

          {isAbsent ? (
            <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-xs font-bold text-rose-700 dark:text-rose-300 whitespace-nowrap shrink-0">
              0.0 / {sub.max_marks || sub.exam_total_marks || 25}m
            </span>
          ) : isPublished && sub.total_awarded_marks !== null ? (
            <span className="px-2 py-0.5 rounded-md bg-canvas-soft border border-hairline text-xs font-bold text-ink whitespace-nowrap shrink-0">
              {Number(sub.total_awarded_marks).toFixed(1)} / {sub.max_marks || sub.exam_total_marks || 25}m
              {sub.percentage !== null && ` (${Number(sub.percentage).toFixed(0)}%)`}
            </span>
          ) : null}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(sub.id);
            }}
            className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors ml-1 cursor-pointer"
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

            {/* Actions Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                {isAbsent ? (
                  <button
                    type="button"
                    disabled
                    className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted/70 bg-canvas-soft border border-hairline px-4 rounded-md cursor-not-allowed select-none text-center whitespace-nowrap shrink-0"
                  >
                    <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    <span>No Script Uploaded</span>
                  </button>
                ) : (
                  <Link
                    href={`/student/submissions/${sub.id}`}
                    className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md btn-glass-primary transition-all cursor-pointer text-center shrink-0 whitespace-nowrap px-4"
                  >
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {isPublished
                        ? sub.is_document_purged
                          ? "View Archived Question Marks →"
                          : "Inspect in PDF Viewer →"
                        : "View Submitted Script →"}
                    </span>
                  </Link>
                )}

                {/* Secondary: View Breakdown */}
                {isPublished ? (
                  <button
                    type="button"
                    onClick={() => onOpenBreakdown(sub)}
                    className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold btn-glass-utility px-3.5 rounded-md transition-all cursor-pointer text-center whitespace-nowrap shrink-0"
                  >
                    <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>View Summary</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Detailed breakdown will be accessible once marks are officially published by faculty."
                    className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted/80 bg-canvas-soft border border-hairline/70 px-3.5 rounded-md cursor-not-allowed select-none text-center whitespace-nowrap shrink-0"
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
                    className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold btn-glass-utility px-3.5 rounded-md transition-all cursor-pointer text-center whitespace-nowrap shrink-0"
                    title="View Official Class Standings & Rankings"
                  >
                    <Trophy className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span>Class Standings</span>
                  </button>
                )}

                {/* Question Paper & Answer Key Viewer */}
                {isPublished && (sub.has_question_paper || sub.has_answer_key) && (
                  <button
                    type="button"
                    onClick={() => onOpenArtifacts(sub)}
                    className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink bg-surface border border-hairline hover:bg-canvas-soft px-3.5 rounded-md transition-colors cursor-pointer text-center whitespace-nowrap shrink-0 shadow-2xs"
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
                      className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted bg-canvas-soft border border-hairline px-3.5 rounded-md opacity-60 cursor-not-allowed text-center whitespace-nowrap shrink-0"
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
                      className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 px-3.5 rounded-md transition-colors text-center whitespace-nowrap shrink-0 shadow-2xs"
                      title={`Download before expiration (${sub.days_remaining ?? 15} days remaining)`}
                    >
                      <Download className="h-3.5 w-3.5 shrink-0" />
                      <span>Download PDF</span>
                    </a>
                  )
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Evaluated PDF download will be enabled once faculty officially publishes results."
                    className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted/80 bg-canvas-soft border border-hairline/70 px-3.5 rounded-md cursor-not-allowed select-none text-center whitespace-nowrap shrink-0"
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
                      className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 px-3.5 rounded-md transition-colors text-center whitespace-nowrap shrink-0 shadow-2xs"
                      title="Open backed up script in personal Google Drive"
                    >
                      <GoogleDriveIcon className="h-3.5 w-3.5 shrink-0" />
                      <span>In Drive</span>
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={handleManualSync}
                      disabled={syncing}
                      className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-ink bg-surface border border-hairline hover:bg-canvas-soft px-3.5 rounded-md transition-colors text-center whitespace-nowrap shrink-0 shadow-2xs cursor-pointer disabled:opacity-50"
                      title="Backup graded paper to personal Google Drive"
                    >
                      {syncing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      ) : (
                        <GoogleDriveIcon className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>{syncing ? "Syncing..." : "Backup to Drive"}</span>
                    </button>
                  )
                )}
              </div>

              {/* Revaluation Appeal Status Pill */}
              {isPublished && (hasOpenReval || isRevalResolved) && (
                <div className="w-full sm:w-auto">
                  {hasOpenReval ? (
                    <Link
                      href="/student/revaluation"
                      className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 rounded-md text-xs font-semibold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] text-center whitespace-nowrap shadow-2xs hover:opacity-90 transition-opacity"
                    >
                      <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                      <span>Revaluation Appeal Active →</span>
                    </Link>
                  ) : (
                    <Link
                      href="/student/revaluation"
                      className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 rounded-md text-xs font-semibold bg-[#edf5f0] text-[#1e613b] border border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] text-center whitespace-nowrap shadow-2xs hover:opacity-90 transition-opacity"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Revaluation Completed →</span>
                    </Link>
                  )}
                </div>
              )}

              {/* Request Revaluation Button */}
              {isPublished && !hasOpenReval && !isRevalResolved && (
                <button
                  type="button"
                  onClick={() => onOpenReval(sub)}
                  className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-secondary hover:text-ink hover:bg-canvas-soft border border-hairline px-3.5 rounded-md transition-colors cursor-pointer text-center whitespace-nowrap shrink-0 shadow-2xs"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-ink-muted" />
                  <span>Request Revaluation</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </FeatureCard>
  );
});
