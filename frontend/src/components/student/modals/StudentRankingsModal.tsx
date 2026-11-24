"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Trophy } from "lucide-react";
import { ModalCard, ButtonUtility } from "@/components/ui";

function RankingsSkeleton() {
  return (
    <div className="space-y-4 pt-1 w-full animate-pulse">
      {/* Search / stats bar skeleton */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-canvas-soft border border-hairline">
        <div className="h-4 w-32 bg-ink-muted/15 rounded" />
        <div className="h-4 w-24 bg-ink-muted/15 rounded" />
      </div>

      {/* Top 3 Podium Cards Skeleton */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-1">
        {/* Rank 2 */}
        <div className="p-3 sm:p-4 rounded-xl border border-hairline bg-canvas-soft flex flex-col items-center justify-end h-28 space-y-2">
          <div className="w-7 h-7 rounded-full bg-ink-muted/15" />
          <div className="w-14 h-3 bg-ink-muted/20 rounded" />
          <div className="w-10 h-2.5 bg-ink-muted/10 rounded" />
        </div>
        {/* Rank 1 */}
        <div className="p-3 sm:p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex flex-col items-center justify-end h-32 space-y-2 relative">
          <div className="w-9 h-9 rounded-full bg-amber-500/20" />
          <div className="w-16 h-3.5 bg-ink-muted/25 rounded" />
          <div className="w-12 h-3 bg-amber-500/20 rounded" />
        </div>
        {/* Rank 3 */}
        <div className="p-3 sm:p-4 rounded-xl border border-hairline bg-canvas-soft flex flex-col items-center justify-end h-28 space-y-2">
          <div className="w-7 h-7 rounded-full bg-ink-muted/15" />
          <div className="w-14 h-3 bg-ink-muted/20 rounded" />
          <div className="w-10 h-2.5 bg-ink-muted/10 rounded" />
        </div>
      </div>

      {/* Ranked Table Header Skeleton */}
      <div className="h-8 rounded bg-canvas-soft/80 border border-hairline mt-3" />

      {/* Table Rows Skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between p-3 rounded-lg bg-canvas-soft/50 border border-hairline"
          >
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-ink-muted/15 shrink-0" />
              <div className="space-y-1">
                <div className="w-28 sm:w-44 h-3 rounded bg-ink-muted/20" />
                <div className="w-16 sm:w-24 h-2.5 rounded bg-ink-muted/10" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-12 h-4 rounded bg-ink-muted/15" />
              <div className="w-8 h-4 rounded-full bg-ink-muted/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ExamRankedTable = dynamic(
  () => import("@/components/ExamRankedTable").then((mod) => mod.ExamRankedTable),
  {
    ssr: false,
    loading: () => <RankingsSkeleton />,
  }
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
      maxWidth="max-w-4xl"
      className="h-[88vh] sm:h-[85vh] flex flex-col"
    >
      <div className="flex flex-col h-full w-full max-w-full overflow-hidden">
        <div className="flex-1 overflow-y-auto min-h-0 pr-0.5">
          {isLoading ? (
            <RankingsSkeleton />
          ) : rankingsData.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <Trophy className="h-10 w-10 text-ink-muted/30 mx-auto" />
              <h4 className="text-sm font-bold text-ink">Standings Pending Publication</h4>
              <p className="text-xs text-ink-muted max-w-xs mx-auto">
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
        </div>

        <div className="flex items-center justify-between pt-3 mt-2 border-t border-hairline shrink-0">
          <ButtonUtility onClick={onClose}>Close Standings</ButtonUtility>
        </div>
      </div>
    </ModalCard>
  );
}
