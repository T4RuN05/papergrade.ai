"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Trophy, Layers, FileText } from "lucide-react";
import { useTenant } from "@/lib/TenantContext";
import { MarksTable } from "@/components/MarksTable";
import { FeatureCard, BadgePill, ButtonPrimary, MarksMatrixSkeleton, AppleSelect } from "@/components/ui";
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2">
            <BadgePill label="Academic Operations" color="purple" />
            {selectedBranch && (
              <span className="text-xs font-semibold text-ink-secondary bg-canvas-soft border border-hairline px-2 py-0.5 rounded-md">
                {selectedBranch.name} • {selectedBranch.city}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink mt-1">
            Class Marks Matrix & Results Inspection
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-0.5">
            Aggregated question-by-question marks matrix, manual overrides, and paper inspection for{" "}
            <span className="font-semibold text-ink">{selectedBranch?.name || "Active Branch"}</span>.
          </p>
        </div>

        {exams.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            {/* View Switcher: Question Matrix vs Ranked Standings */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-canvas-soft border border-hairline">
              <button
                type="button"
                onClick={() => handleViewModeChange("matrix")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === "matrix"
                    ? "bg-surface text-ink shadow-2xs border border-hairline"
                    : "text-ink-muted hover:text-ink border border-transparent"
                }`}
                title="Question-by-question marks matrix"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Rubric Matrix</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange("ranked")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === "ranked"
                    ? "bg-surface text-ink shadow-2xs border border-hairline"
                    : "text-ink-muted hover:text-ink border border-transparent"
                }`}
                title="Ranked standings sorted top to bottom by marks"
              >
                <Trophy className="h-3.5 w-3.5 text-amber-600" />
                <span>Ranked Standings</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-ink-secondary">Exam:</span>
              <AppleSelect
                size="sm"
                value={selectedExamId}
                onChange={(val) => handleExamChange(val)}
                options={exams.map((e) => ({
                  value: e.id,
                  label: `${e.title} (${e.subject})`,
                }))}
                className="max-w-[260px]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area: Persistently Mounted Component Tree */}
      {exams.length === 0 ? (
        <FeatureCard className="p-12 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-canvas-soft border border-hairline flex items-center justify-center text-ink-muted">
            <FileText className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-ink">
            No examinations found for {selectedBranch?.name || "this branch"}.
          </p>
          <p className="text-xs text-ink-muted max-w-sm mx-auto">
            Create an exam to grade papers and inspect student marks matrices.
          </p>
          <div className="pt-2">
            <ButtonPrimary href="/exams/new" size="sm">
              Create Exam Now →
            </ButtonPrimary>
          </div>
        </FeatureCard>
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
