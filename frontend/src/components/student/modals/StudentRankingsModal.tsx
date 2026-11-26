"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Trophy } from "lucide-react";
import { ModalCard, ButtonUtility } from "@/components/ui";
import { useTenant } from "@/lib/TenantContext";

function RankingsSkeleton() {
  return (
    <div className="space-y-3.5 pt-1 w-full animate-pulse">
      {/* Compact 3D Booth Podium Skeleton */}
      <div className="rounded-2xl border border-hairline bg-canvas-soft/60 px-3 pt-3 pb-2.5">
        <div className="grid grid-cols-3 items-end gap-2 sm:gap-3.5 min-h-[144px] sm:min-h-[164px]">
          <div className="flex flex-col items-center gap-1.5">
            <div className="h-4 w-16 rounded-full bg-ink-muted/15" />
            <div className="h-7 w-7 rounded-full bg-ink-muted/20" />
            <div className="h-[56px] sm:h-[64px] w-full rounded-b-lg bg-ink-muted/15" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="h-4 w-20 rounded-full bg-amber-500/20" />
            <div className="h-9 w-9 rounded-full bg-amber-500/25" />
            <div className="h-[74px] sm:h-[84px] w-full rounded-b-lg bg-amber-500/15" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="h-4 w-16 rounded-full bg-ink-muted/15" />
            <div className="h-7 w-7 rounded-full bg-ink-muted/20" />
            <div className="h-[44px] sm:h-[50px] w-full rounded-b-lg bg-ink-muted/15" />
          </div>
        </div>
      </div>

      {/* Search bar skeleton */}
      <div className="h-11 rounded-2xl bg-canvas-soft border border-hairline" />

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
  const { currentUser } = useTenant();
  if (!exam && !isOpen) return null;

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={onClose}
      title={
        exam ? `Class Standings • ${exam.title || "Examination"}` : "Class Standings"
      }
      maxWidth="max-w-4xl"
      className="h-[88vh] sm:h-[84vh] flex flex-col"
    >
      <div className="flex flex-col w-full max-w-full flex-1 min-h-0 overflow-hidden">
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
              currentUserGooglePicture={currentUser?.google_picture}
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
