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
import { BadgePill, ButtonPrimary, ButtonUtility } from "@/components/ui";

interface ExamActionHeaderProps {
  title: string;
  subject?: string;
  totalMarks?: number;
  branchName?: string;
  isPublished: boolean;
  isPublishing: boolean;
  isRootAdmin: boolean;
  onTogglePublish: () => void;
  onExportCsv: () => void;
  onDeleteExam: () => void;
}

export function ExamActionHeader({
  title,
  subject,
  totalMarks,
  branchName,
  isPublished,
  isPublishing,
  isRootAdmin,
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
          {subject && <BadgePill label={subject} color="purple" />}
          {totalMarks && (
            <span className="text-xs font-mono font-bold text-ink-secondary bg-canvas-soft border border-hairline px-2 py-0.5 rounded-md">
              {totalMarks} Marks
            </span>
          )}
          {branchName && (
            <span className="text-xs text-ink-muted font-medium truncate max-w-[160px] sm:max-w-none">
              {branchName}
            </span>
          )}
        </div>

        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
        {/* Publication Status Action */}
        {isPublished ? (
          <div className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Published</span>
          </div>
        ) : (
          <ButtonPrimary
            size="sm"
            onClick={onTogglePublish}
            disabled={isPublishing}
            className="text-xs"
          >
            <Globe className="h-3.5 w-3.5 mr-1.5" />
            {isPublishing ? "Publishing..." : "Publish Results"}
          </ButtonPrimary>
        )}

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
            <div className="absolute right-0 top-full mt-1.5 w-48 rounded-lg bg-surface border border-hairline shadow-lg py-1 z-30 text-xs text-ink animate-in fade-in zoom-in-95">
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

              {isRootAdmin && (
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
      </div>
    </div>
  );
}
