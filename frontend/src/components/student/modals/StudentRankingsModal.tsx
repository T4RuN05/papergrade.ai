"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Trophy } from "lucide-react";
import { ModalCard, ButtonUtility } from "@/components/ui";

const ExamRankedTable = dynamic(
  () => import("@/components/ExamRankedTable").then((mod) => mod.ExamRankedTable),
  { ssr: false }
);

export interface StudentRankingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: { id: string; title: string; max_marks?: number } | null;
  rankingsData: any[];
  isLoading: boolean;
  currentStudentRoll?: string;
  currentStudentId?: string;
}

export function StudentRankingsModal({
  isOpen,
  onClose,
  exam,
  rankingsData,
  isLoading,
  currentStudentRoll,
  currentStudentId,
}: StudentRankingsModalProps) {
  if (!exam && !isOpen) return null;

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={onClose}
      title={
        exam ? `Class Standings • ${exam.title || "Examination"}` : "Class Standings"
      }
    >
      <div className="space-y-4 pt-1 w-full max-w-full overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center space-y-3">
            <div className="inline-flex items-center justify-center p-3 rounded-full bg-amber-50 text-amber-600 animate-pulse">
              <Trophy className="h-8 w-8" />
            </div>
            <p className="text-xs text-ink-muted">Loading class standings...</p>
          </div>
        ) : rankingsData.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <Trophy className="h-8 w-8 text-ink-faint mx-auto" />
            <h4 className="text-xs font-semibold text-ink">Standings Pending Publication</h4>
            <p className="text-[11px] text-ink-muted max-w-xs mx-auto">
              Class rankings will be published once faculty concludes all evaluations for this examination.
            </p>
          </div>
        ) : (
          <ExamRankedTable
            examId={exam?.id || ""}
            examTitle={exam?.title || "Exam"}
            maxMarks={exam?.max_marks || 25}
            submissions={rankingsData}
            isStudentView={true}
            currentStudentRoll={currentStudentRoll}
            currentStudentId={currentStudentId}
          />
        )}

        <div className="flex items-center justify-between pt-3 border-t border-hairline">
          <ButtonUtility onClick={onClose}>Close Standings</ButtonUtility>
        </div>
      </div>
    </ModalCard>
  );
}
