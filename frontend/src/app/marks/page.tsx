"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Trophy, Layers, FileText } from "lucide-react";
import { useTenant } from "@/lib/TenantContext";
import { MarksTable } from "@/components/MarksTable";
import { MarksMatrixSkeleton, AppleSelect } from "@/components/ui";
import { useExamsList, useExamDetail, useSubmissionsForExam } from "@/lib/queries";

const ExamRankedTable = dynamic(
  () => import("@/components/ExamRankedTable").then((m) => m.ExamRankedTable),
  { ssr: false }
);

function ClassMarksPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryExamId = searchParams.get("exam_id") || searchParams.get("examId") || "";
  const queryView = searchParams.get("view");

  const { selectedBranch } = useTenant();
  const [selectedExamId, setSelectedExamId] = useState<string>(queryExamId);
  const [viewMode, setViewMode] = useState<"matrix" | "ranked">(
    queryView === "matrix" ? "matrix" : "ranked"
  );

  // 1. Fetch exams for active branch with TanStack Query caching
  const { data: exams = [], isLoading: examsLoading } = useExamsList(selectedBranch?.id);

  // Sync selectedExamId when exams list loads or changes
  useEffect(() => {
    if (exams.length > 0) {
      setSelectedExamId((prev) => {
        const match = queryExamId ? exams.find((e) => e.id === queryExamId) : null;
        if (match) return match.id;
        if (prev && exams.some((e) => e.id === prev)) return prev;
        return exams[0].id;
      });
    } else if (!examsLoading) {
      setSelectedExamId("");
    }
  }, [exams, queryExamId, examsLoading]);

  // Handle dropdown exam change
  const handleExamChange = (newExamId: string) => {
    setSelectedExamId(newExamId);
    router.replace(`/marks?exam_id=${newExamId}&view=${viewMode}`, { scroll: false });
  };

  const handleViewModeChange = (mode: "matrix" | "ranked") => {
    setViewMode(mode);
    router.replace(`/marks?exam_id=${selectedExamId}&view=${mode}`, { scroll: false });
  };

  // 2. Fetch current exam details & submissions via TanStack Query with placeholderData: keepPreviousData
  const { data: currentExam } = useExamDetail(selectedExamId);
  const {
    data: submissions = [],
    isFetching: submissionsFetching,
  } = useSubmissionsForExam(selectedExamId);

  // Full skeleton only on the very first mount when no exams have loaded yet
  if (examsLoading && exams.length === 0) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto pb-16">
        <MarksMatrixSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-hairline">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="notion-eyebrow text-ink-muted">Academic Operations</span>
            {selectedBranch && (
              <>
                <span className="text-ink-faint text-xs">•</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary bg-surface border border-hairline px-2 py-0.5 rounded-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  {selectedBranch.name} • {selectedBranch.city}
                </span>
              </>
            )}
          </div>
          <h1 className="notion-heading-2 text-2xl sm:text-[26px] text-ink mt-1.5">
            Class Marks &amp; Results Ledger
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-1 leading-relaxed">
            Aggregated question-by-question marks matrix, manual overrides, and paper inspection for{" "}
            <span className="font-medium text-ink">{selectedBranch?.name || "Active Branch"}</span>.
          </p>
        </div>

        {exams.length > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto shrink-0">
            {/* View Switcher: Ranked Standings vs Rubric Matrix */}
            <div className="grid grid-cols-2 sm:inline-flex items-center p-1 rounded-md bg-canvas-soft border border-hairline w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleViewModeChange("matrix")}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === "matrix"
                    ? "bg-surface text-primary border border-hairline shadow-2xs font-semibold"
                    : "text-ink-muted hover:text-ink border border-transparent"
                }`}
                title="Question-by-question marks matrix"
              >
                <Layers className="h-3.5 w-3.5 shrink-0" />
                <span>Rubric Matrix</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange("ranked")}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === "ranked"
                    ? "bg-surface text-primary border border-hairline shadow-2xs font-semibold"
                    : "text-ink-muted hover:text-ink border border-transparent"
                }`}
                title="Ranked standings sorted top to bottom by marks"
              >
                <Trophy className="h-3.5 w-3.5 shrink-0" />
                <span>Ranked Standings</span>
              </button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-medium text-ink-muted shrink-0">Exam:</span>
              <AppleSelect
                size="sm"
                value={selectedExamId}
                onChange={(val) => handleExamChange(val)}
                options={exams.map((e) => ({
                  value: e.id,
                  label: `${e.title} (${e.subject})`,
                }))}
                className="flex-1 sm:w-[240px] md:w-[260px]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area: Persistently Mounted Component Tree */}
      {exams.length === 0 ? (
        <div className="notion-card p-8 sm:p-12 text-center space-y-3">
          <div className="mx-auto h-11 w-11 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-center text-ink-muted">
            <FileText className="h-5 w-5" />
          </div>
          <p className="notion-section-title text-base text-ink">
            No examinations found for {selectedBranch?.name || "this branch"}
          </p>
          <p className="text-xs sm:text-sm text-ink-muted max-w-sm mx-auto leading-relaxed">
            Create an exam to grade papers and inspect student marks matrices.
          </p>
          <div className="pt-2">
            <Link href="/exams/new" className="notion-btn-primary">
              Create Exam Now
            </Link>
          </div>
        </div>
      ) : viewMode === "ranked" ? (
        <ExamRankedTable
          examId={selectedExamId}
          examTitle={currentExam?.title || "Examination"}
          maxMarks={currentExam?.total_marks || 25}
          submissions={submissions}
          isFetching={submissionsFetching}
        />
      ) : (
        <MarksTable
          examId={selectedExamId}
          rubric={currentExam?.rubric_version?.rubric_data}
          submissions={submissions}
          isFetching={submissionsFetching}
        />
      )}
    </div>
  );
}

export default function ClassMarksPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 max-w-7xl mx-auto pb-16">
          <MarksMatrixSkeleton />
        </div>
      }
    >
      <ClassMarksPageContent />
    </Suspense>
  );
}
