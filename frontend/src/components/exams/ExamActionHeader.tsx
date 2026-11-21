"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Trash2,
  MoreHorizontal,
  FileSpreadsheet,
  Globe,
  Lock,
} from "lucide-react";
import { BadgePill, ButtonPrimary, ButtonUtility, Skeleton } from "@/components/ui";

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

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <Link
            href="/exams"
            className="text-xs text-ink-muted hover:text-ink flex items-center gap-1 font-medium mr-1 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Exams</span>
          </Link>
          <span className="text-ink-faint">•</span>
          {isLoading && !title ? (
            <>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-md" />
              <Skeleton className="h-4 w-28 rounded" />
            </>
          ) : (
            <>
              {subject && <BadgePill label={subject} color="purple" />}
              {totalMarks !== undefined && (
                <span className="text-xs font-mono font-bold text-ink-secondary bg-canvas-soft border border-hairline px-2 py-0.5 rounded-md">
                  {totalMarks} Marks
                </span>
              )}
              {branchName && (
                <span className="text-xs text-ink-muted font-medium truncate max-w-[160px] sm:max-w-none">
                  {branchName}
                </span>
              )}
              {isPublished ? (
                <BadgePill label="Published" color="purple" />
              ) : isRubricApproved ? (
                <BadgePill label="Rubric Approved" color="green" />
              ) : hasRubric ? (
                <BadgePill label="Draft Rubric" color="orange" />
              ) : (
                <BadgePill label="No Rubric" color="gray" />
              )}
            </>
          )}
        </div>

        {isLoading && !title ? (
          <Skeleton className="h-7 sm:h-8 w-64 sm:w-96 rounded-md my-0.5" />
        ) : (
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
            {title}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
        {isLoading && !title ? (
          <>
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </>
        ) : (
          <>
            {/* Publication Status Action */}
            {isPublished ? (
              <span className="h-8 px-2.5 rounded-md border border-hairline/80 bg-surface text-ink-muted text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs select-none">
                <Lock className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                <span>Finalized</span>
              </span>
            ) : onTogglePublish ? (
              <ButtonPrimary
                size="sm"
                onClick={onTogglePublish}
                disabled={isPublishing || (totalSubmissions !== undefined && totalSubmissions === 0)}
                title={totalSubmissions === 0 ? "Submissions must be ingested before publishing results" : undefined}
                className="text-xs"
              >
                <Globe className="h-3.5 w-3.5 mr-1.5" />
                {isPublishing ? "Publishing..." : "Publish Results"}
              </ButtonPrimary>
            ) : null}

            {/* More Actions Dropdown Menu */}
            <div className="relative" ref={moreMenuRef}>
              <ButtonUtility
                size="sm"
                onClick={() => setMoreMenuOpen((prev) => !prev)}
                className="p-2"
                title="More Actions"
                aria-label="More Actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </ButtonUtility>

              {moreMenuOpen && (
                <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 w-48 max-w-[calc(100vw-2rem)] rounded-lg bg-surface border border-hairline shadow-lg py-1 z-30 text-xs text-ink animate-in fade-in zoom-in-95">
                  {onExportCsv && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        onExportCsv();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-canvas-soft transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
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
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer border-t border-hairline mt-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Examination</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
