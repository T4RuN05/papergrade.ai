"use client";

import React from "react";
import { Unlock, FileCheck2 } from "lucide-react";
import { BadgePill, ButtonPrimary, ButtonUtility } from "@/components/ui";

interface RubricHeaderToolbarProps {
  examTitle: string;
  subject: string;
  questionCount: number;
  totalMarks: number;
  isApproved: boolean;
  isSubmitting: boolean;
  isUnlocking: boolean;
  onApprove: () => void;
  onUnlock?: () => void;
}

export function RubricHeaderToolbar({
  examTitle,
  subject,
  questionCount,
  totalMarks,
  isApproved,
  isSubmitting,
  isUnlocking,
  onApprove,
  onUnlock,
}: RubricHeaderToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-hairline">
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <h2 className="text-xl font-bold text-ink tracking-tight">
            {examTitle || "Examination Rubric Studio"}
          </h2>
          {isApproved ? (
            <BadgePill label="Approved & Locked" color="green" />
          ) : (
            <BadgePill label="Draft Pending Approval" color="orange" />
          )}
        </div>
        <p className="text-xs text-ink-muted">
          Subject: <span className="font-semibold text-ink-secondary">{subject}</span> • Total Questions:{" "}
          <span className="font-semibold text-ink-secondary">{questionCount}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
        <div className="text-left sm:text-right">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted block">
            Total Marks
          </span>
          <div className="font-mono text-2xl font-bold text-primary">{totalMarks}</div>
        </div>

        {isApproved ? (
          onUnlock && (
            <ButtonUtility
              type="button"
              onClick={onUnlock}
              isLoading={isUnlocking}
              icon={<Unlock className="h-3.5 w-3.5 text-[#dd5b00]" />}
              className="py-2 px-3.5 text-xs font-semibold"
              title="Unlock rubric to edit questions or criteria"
            >
              {isUnlocking ? "Unlocking..." : "Unlock Rubric to Edit"}
            </ButtonUtility>
          )
        ) : (
          <ButtonPrimary
            type="button"
            onClick={onApprove}
            isLoading={isSubmitting}
            icon={<FileCheck2 className="h-4 w-4" />}
            className="py-2 px-4 text-xs font-semibold"
          >
            {isSubmitting ? "Locking..." : "Approve & Lock Rubric"}
          </ButtonPrimary>
        )}
      </div>
    </div>
  );
}
