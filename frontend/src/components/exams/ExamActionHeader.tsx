"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Trash2,
  MoreHorizontal,
  FileSpreadsheet,
  Globe,
  Lock,
  Play,
  RefreshCw,
} from "lucide-react";
import { Skeleton } from "@/components/ui";

interface ExamActionHeaderProps {
  title?: string;
  subject?: string;
  totalMarks?: number;
  branchName?: string;
  isPublished?: boolean;
  isPublishing?: boolean;
  isRubricApproved?: boolean;
  hasRubric?: boolean;
  totalSubmissions?: number;
  isRootAdmin?: boolean;
  isLoading?: boolean;
  isEvaluating?: boolean;
  canStartEvaluation?: boolean;
  isStartingEval?: boolean;
  unprocessedCount?: number;
  evaluatedCount?: number;
  hasFailedPapers?: boolean;
  evaluationDisabledReason?: string;
  onStartEvaluation?: () => void;
  onTogglePublish?: () => void;
  onExportCsv?: () => void;
  onDeleteExam?: () => void;
}

export function ExamActionHeader({
  title,
  subject,
  totalMarks,
  branchName,
  isPublished = false,
  isPublishing = false,
  isRubricApproved = false,
  hasRubric = false,
  totalSubmissions,
  isRootAdmin = false,
  isLoading = false,
  isEvaluating = false,
  canStartEvaluation = false,
  isStartingEval = false,
  unprocessedCount,
  evaluatedCount,
  hasFailedPapers = false,
  evaluationDisabledReason,
  onStartEvaluation,
  onTogglePublish,
  onExportCsv,
  onDeleteExam,
}: ExamActionHeaderProps) {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

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

  const statusPill = isPublished
    ? { label: "Published", dot: "bg-emerald-500" }
    : isRubricApproved
    ? { label: "Rubric Approved", dot: "bg-emerald-500" }
    : hasRubric
    ? { label: "Draft Rubric", dot: "bg-amber-500" }
    : { label: "No Rubric", dot: "bg-ink-faint" };

  return (
    <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-hairline">
      <div className="space-y-1.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          {isLoading && !title ? (
            <>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-md" />
              <Skeleton className="h-4 w-28 rounded" />
            </>
          ) : (
            <>
              {subject && (
                <span className="px-2 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-xs font-medium text-ink-secondary">
                  {subject}
                </span>
              )}
              {totalMarks !== undefined && (
                <span className="text-xs font-mono tabular-nums font-semibold text-ink-secondary bg-canvas-soft border border-hairline px-2 py-0.5 rounded-xs">
                  {totalMarks} Marks
                </span>
              )}
              {branchName && (
                <span className="text-xs text-ink-muted font-medium truncate max-w-[160px] sm:max-w-none">
                  {branchName}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary whitespace-nowrap">
                <span className={`w-1.5 h-1.5 rounded-full ${statusPill.dot} shrink-0`} />
                {statusPill.label}
              </span>
            </>
          )}
        </div>

        {isLoading && !title ? (
          <Skeleton className="h-7 sm:h-8 w-64 sm:w-96 rounded-md my-0.5" />
        ) : (
          <h1 className="notion-heading-2 text-2xl sm:text-[26px] text-ink break-words">
            {title}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-2 self-start sm:self-end flex-wrap w-full sm:w-auto">
        {isLoading && !title ? (
          <>
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-9 rounded-md" />
          </>
        ) : (
          <>
            {/* 1. Evaluating Status Pill */}
            {isEvaluating ? (
              <div className="inline-flex items-center gap-2 h-9 px-3 rounded-md text-xs font-medium bg-surface text-ink border border-hairline select-none tabular-nums">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                <span>Evaluating ({evaluatedCount || 0}/{totalSubmissions || 0})</span>
              </div>
            ) : (
              <>
                {/* 2. Start / Retry Evaluation Primary Action */}
                {unprocessedCount !== undefined && unprocessedCount > 0 && onStartEvaluation && (
                  <button
                    type="button"
                    onClick={onStartEvaluation}
                    disabled={!canStartEvaluation || isStartingEval}
                    title={evaluationDisabledReason}
                    className="notion-btn-primary flex-1 sm:flex-initial justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {isStartingEval
                        ? "Starting Evaluation..."
                        : hasFailedPapers
                        ? `Retry Evaluation (${unprocessedCount})`
                        : `Start Evaluation (${unprocessedCount})`}
                    </span>
                  </button>
                )}

                {/* 3. Publication Status Action */}
                {isPublished ? (
                  <span className="h-9 px-3 rounded-md border border-hairline bg-surface text-ink-muted text-xs font-medium inline-flex items-center gap-1.5 select-none">
                    <Lock className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                    <span>Finalized</span>
                  </span>
                ) : onTogglePublish && (unprocessedCount === 0 || (evaluatedCount !== undefined && evaluatedCount > 0)) ? (
                  <button
                    type="button"
                    onClick={onTogglePublish}
                    disabled={isPublishing || (unprocessedCount === 0 && totalSubmissions !== undefined && totalSubmissions === 0)}
                    title={
                      unprocessedCount === 0 && totalSubmissions === 0
                        ? "Submissions must be ingested before publishing results"
                        : unprocessedCount !== 0
                        ? "Publish currently graded results"
                        : undefined
                    }
                    className={`${
                      unprocessedCount === 0 ? "notion-btn-primary" : "notion-btn-utility"
                    } flex-1 sm:flex-initial justify-center disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    <span>{isPublishing ? "Publishing..." : "Publish Results"}</span>
                  </button>
                ) : null}
              </>
            )}

            {/* More Actions Dropdown Menu */}
            <div className="relative ml-auto sm:ml-0" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setMoreMenuOpen((prev) => !prev)}
                className="notion-btn-utility px-2.5"
                title="More Actions"
                aria-label="More Actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {moreMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 max-w-[calc(100vw-2rem)] rounded-lg bg-surface border border-hairline shadow-notion-modal py-1 z-30 text-xs text-ink animate-in fade-in zoom-in-95">
                  {onExportCsv && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        onExportCsv();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-canvas-soft transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>Export Standings CSV</span>
                    </button>
                  )}

                  {isRootAdmin && onDeleteExam && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        onDeleteExam();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-red-600 dark:text-[#f28b82] hover:bg-red-50/70 dark:hover:bg-[#2a1313] transition-colors cursor-pointer border-t border-hairline mt-1"
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0" />
                      <span>Delete Examination</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
