"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, GraduationCap, Building2, Plus, FileText, FileSpreadsheet, Trophy, Layers } from "lucide-react";
import { api } from "@/lib/api";
import { Exam, Submission } from "@/lib/types";
import { useTenant } from "@/lib/TenantContext";
import { MarksTable } from "@/components/MarksTable";
import { ExamRankedTable } from "@/components/ExamRankedTable";
import { FeatureCard, BadgePill, ButtonPrimary, MarksMatrixSkeleton, Skeleton, AppleSelect } from "@/components/ui";

function ClassMarksPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryExamId = searchParams.get("exam_id") || searchParams.get("examId") || "";

  const { selectedBranch, loading: tenantLoading } = useTenant();
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(queryExamId);
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"matrix" | "ranked">("matrix");

  // Load exams for active branch
  useEffect(() => {
    if (tenantLoading && !selectedBranch?.id) return;

    setLoading(true);
    api
      .listExams(selectedBranch?.id)
      .then((list) => {
        const examList = Array.isArray(list) ? list : [];
        setExams(examList);
        if (examList.length > 0) {
          const match = queryExamId ? examList.find((e) => e.id === queryExamId) : null;
          const chosen = match
            ? match.id
            : selectedExamId && examList.some((e) => e.id === selectedExamId)
            ? selectedExamId
            : examList[0].id;
          setSelectedExamId(chosen);
        } else {
          setSelectedExamId("");
          setCurrentExam(null);
          setSubmissions([]);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load exams for branch:", err);
        setExams([]);
        setLoading(false);
      });
  }, [selectedBranch?.id, tenantLoading, queryExamId]);

  // Synchronize when queryExamId changes
  useEffect(() => {
    if (queryExamId && queryExamId !== selectedExamId) {
      if (exams.length > 0) {
        const match = exams.find((e) => e.id === queryExamId);
        if (match) {
          setSelectedExamId(queryExamId);
        }
      } else {
        setSelectedExamId(queryExamId);
      }
    }
  }, [queryExamId, exams]);

  // Handle dropdown exam change
  const handleExamChange = (newExamId: string) => {
    setSelectedExamId(newExamId);
    router.replace(`/marks?exam_id=${newExamId}`, { scroll: false });
  };

  useEffect(() => {
    if (!selectedExamId) {
      setCurrentExam(null);
      setSubmissions([]);
      return;
    }

    api.getExam(selectedExamId).then((examData) => {
      setCurrentExam(examData);
    });

    // Initial fetch
    fetchSubmissionsForExam(selectedExamId, true);

    // Live polling every 4 seconds to catch newly completed papers
    const interval = setInterval(() => {
      fetchSubmissionsForExam(selectedExamId, false);
    }, 4000);

    return () => clearInterval(interval);
  }, [selectedExamId]);

  const fetchSubmissionsForExam = async (examId: string, isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const subsData = await api.getSubmissionsForExam(examId);
      setSubmissions(subsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading && exams.length === 0) {
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
                onClick={() => setViewMode("matrix")}
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
                onClick={() => setViewMode("ranked")}
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

      {/* Main Content Area */}
      {loading ? (
        <FeatureCard className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-8 flex-1 max-w-xs rounded-md" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="rounded-lg border border-hairline overflow-hidden">
            <div className="h-10 bg-canvas-soft border-b border-hairline flex items-center px-4 gap-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-16 font-mono ml-auto" />
              <Skeleton className="h-3 w-16 font-mono" />
            </div>
            <div className="divide-y divide-hairline bg-surface">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 flex items-center px-4 gap-4">
                  <Skeleton className="h-3.5 w-16 font-mono" />
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3.5 w-10 font-mono" />
                  <Skeleton className="h-3.5 w-10 font-mono" />
                  <Skeleton className="h-3.5 w-10 font-mono" />
                  <Skeleton className="h-4 w-16 font-mono font-bold ml-auto" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </FeatureCard>
      ) : exams.length === 0 ? (
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
        />
      ) : (
        <MarksTable
          examId={selectedExamId}
          rubric={currentExam?.rubric_version?.rubric_data}
          submissions={submissions}
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
