"use client";

import React from "react";
import Link from "next/link";
import { FileText, Eye, Upload, Sparkles, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui";

interface ExamAcademicMaterialsRowProps {
  examId: string;
  hasQp?: boolean;
  hasAk?: boolean;
  isRubricApproved?: boolean;
  questionCount?: number;
  isRootAdmin?: boolean;
  isLoading?: boolean;
  onViewQp: () => void;
  onViewAk: () => void;
  onUploadQp: () => void;
  onUploadAk: () => void;
}

export function ExamAcademicMaterialsRow({
  examId,
  hasQp = false,
  hasAk = false,
  isRubricApproved = false,
  questionCount = 0,
  isRootAdmin = false,
  isLoading = false,
  onViewQp,
  onViewAk,
  onUploadQp,
  onUploadAk,
}: ExamAcademicMaterialsRowProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
      {/* 1. Question Paper */}
      <div className="notion-card rounded-lg p-4 sm:p-5 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <span>Question Paper</span>
            </span>
            {isLoading ? (
              <Skeleton className="h-5 w-16 rounded-full" />
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${hasQp ? "bg-emerald-500" : "bg-amber-500"}`} />
                {hasQp ? "Uploaded" : "Pending"}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted leading-relaxed">
            Master question sheet uploaded for student preview and teacher reference.
          </p>
        </div>

        <div className="grid grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:flex sm:items-center gap-2 pt-3 border-t border-hairline">
          {isLoading ? (
            <Skeleton className="h-9 w-full rounded-md col-span-2" />
          ) : (
            <>
              {hasQp && (
                <button
                  type="button"
                  onClick={onViewQp}
                  className="notion-btn-utility flex-1 justify-center text-xs"
                >
                  <Eye className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                  <span>View PDF</span>
                </button>
              )}
              {isRootAdmin && (
                <button
                  type="button"
                  onClick={onUploadQp}
                  className={`notion-btn-utility justify-center text-xs ${hasQp ? "" : "flex-1"}`}
                >
                  <Upload className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                  <span>{hasQp ? "Replace" : "Upload QP"}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 2. Official Answer Key */}
      <div className="notion-card rounded-lg p-4 sm:p-5 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Official Answer Key</span>
            </span>
            {isLoading ? (
              <Skeleton className="h-5 w-16 rounded-full" />
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${hasAk ? "bg-emerald-500" : "bg-amber-500"}`} />
                {hasAk ? "Uploaded" : "Pending"}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted leading-relaxed">
            Ground-truth model solutions used by AI grading agents to evaluate criteria.
          </p>
        </div>

        <div className="grid grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:flex sm:items-center gap-2 pt-3 border-t border-hairline">
          {isLoading ? (
            <>
              <Skeleton className="h-9 flex-1 rounded-md" />
              <Skeleton className="h-9 flex-1 rounded-md" />
            </>
          ) : (
            <>
              {hasAk && (
                <button
                  type="button"
                  onClick={onViewAk}
                  className="notion-btn-utility flex-1 justify-center text-xs"
                >
                  <Eye className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                  <span>View PDF</span>
                </button>
              )}
              {isRootAdmin && (
                <button
                  type="button"
                  onClick={onUploadAk}
                  className={`notion-btn-utility justify-center text-xs ${hasAk ? "" : "flex-1"}`}
                >
                  <Upload className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                  <span>{hasAk ? "Replace" : "Upload Key"}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 3. Rubric Matrix */}
      <div className="notion-card rounded-lg p-4 sm:p-5 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <span>Grading Rubric</span>
            </span>
            {isLoading ? (
              <Skeleton className="h-5 w-16 rounded-full" />
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${isRubricApproved ? "bg-emerald-500" : "bg-amber-500"}`} />
                {isRubricApproved ? "Locked" : "Draft"}
              </span>
            )}
          </div>
          <div className="text-xs text-ink-muted leading-relaxed">
            {isLoading ? (
              <Skeleton className="h-3.5 w-4/5 rounded mt-1" />
            ) : questionCount > 0 ? (
              `${questionCount} questions configured with step-by-step partial marks.`
            ) : (
              "No rubric criteria configured yet."
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-hairline">
          {isLoading ? (
            <Skeleton className="h-9 w-full rounded-md" />
          ) : (
            <Link
              href={`/exams/${examId}/rubric`}
              className="notion-btn-utility w-full justify-center text-xs"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>{isRubricApproved ? "View Rubric Matrix" : "Configure Rubric →"}</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
