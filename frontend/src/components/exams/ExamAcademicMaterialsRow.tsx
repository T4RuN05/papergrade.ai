"use client";

import React from "react";
import Link from "next/link";
import { FileText, Eye, Upload, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { FeatureCard, ButtonUtility, BadgePill, Skeleton } from "@/components/ui";

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
      <FeatureCard className="p-4 sm:p-5 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-primary" />
              Question Paper
            </span>
            {isLoading ? (
              <Skeleton className="h-5.5 w-16 rounded-full" />
            ) : (
              <BadgePill
                label={hasQp ? "Uploaded" : "Pending"}
                color={hasQp ? "green" : "orange"}
              />
            )}
          </div>
          <p className="text-[11px] text-ink-muted leading-relaxed">
            Master question sheet uploaded for student preview and teacher reference.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-hairline">
          {isLoading ? (
            <Skeleton className="h-8 flex-1 rounded-md" />
          ) : (
            <>
              {hasQp && (
                <ButtonUtility size="sm" onClick={onViewQp} className="flex-1 justify-center text-xs">
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  View PDF
                </ButtonUtility>
              )}
              {isRootAdmin && (
                <ButtonUtility
                  size="sm"
                  onClick={onUploadQp}
                  className={`${hasQp ? "" : "flex-1"} justify-center text-xs`}
                >
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  {hasQp ? "Replace" : "Upload QP"}
                </ButtonUtility>
              )}
            </>
          )}
        </div>
      </FeatureCard>

      {/* 2. Official Answer Key */}
      <FeatureCard className="p-4 sm:p-5 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Official Answer Key
            </span>
            {isLoading ? (
              <Skeleton className="h-5.5 w-16 rounded-full" />
            ) : (
              <BadgePill
                label={hasAk ? "Uploaded" : "Pending"}
                color={hasAk ? "green" : "orange"}
              />
            )}
          </div>
          <p className="text-[11px] text-ink-muted leading-relaxed">
            Ground-truth model solutions used by AI grading agents to evaluate criteria.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-hairline">
          {isLoading ? (
            <>
              <Skeleton className="h-8 flex-1 rounded-md" />
              <Skeleton className="h-8 flex-1 rounded-md" />
            </>
          ) : (
            <>
              {hasAk && (
                <ButtonUtility size="sm" onClick={onViewAk} className="flex-1 justify-center text-xs">
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  View PDF
                </ButtonUtility>
              )}
              {isRootAdmin && (
                <ButtonUtility
                  size="sm"
                  onClick={onUploadAk}
                  className={`${hasAk ? "" : "flex-1"} justify-center text-xs`}
                >
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  {hasAk ? "Replace" : "Upload Key"}
                </ButtonUtility>
              )}
            </>
          )}
        </div>
      </FeatureCard>

      {/* 3. Rubric Matrix */}
      <FeatureCard className="p-4 sm:p-5 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              Grading Rubric
            </span>
            {isLoading ? (
              <Skeleton className="h-5.5 w-16 rounded-full" />
            ) : (
              <BadgePill
                label={isRubricApproved ? "Locked" : "Draft"}
                color={isRubricApproved ? "green" : "orange"}
              />
            )}
          </div>
          <p className="text-[11px] text-ink-muted leading-relaxed">
            {isLoading ? (
              <Skeleton className="h-3 w-4/5 rounded" />
            ) : questionCount > 0 ? (
              `${questionCount} questions configured with step-by-step partial marks.`
            ) : (
              "No rubric criteria configured yet."
            )}
          </p>
        </div>

        <div className="pt-2 border-t border-hairline">
          {isLoading ? (
            <Skeleton className="h-8 w-full rounded-md" />
          ) : (
            <ButtonUtility
              size="sm"
              href={`/exams/${examId}/rubric`}
              className="w-full justify-center text-xs"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              {isRubricApproved ? "View Rubric Matrix" : "Configure Rubric →"}
            </ButtonUtility>
          )}
        </div>
      </FeatureCard>
    </div>
  );
}
