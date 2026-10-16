"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, GraduationCap, Building2, Plus, FileText, FileSpreadsheet } from "lucide-react";
import { api } from "@/lib/api";
import { Exam, Submission } from "@/lib/types";
import { useTenant } from "@/lib/TenantContext";
import { MarksTable } from "@/components/MarksTable";
import { FeatureCard, BadgePill, ButtonPrimary, MarksMatrixSkeleton, Skeleton } from "@/components/ui";

export default function ClassMarksPage() {
  const { selectedBranch, loading: tenantLoading } = useTenant();
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

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
          setSelectedExamId(examList[0].id);
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
  }, [selectedBranch?.id, tenantLoading]);

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
      const allSubsRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/submissions/exam/${examId}`
      );
      if (allSubsRes && allSubsRes.ok) {
        const subsData = await allSubsRes.json();
        setSubmissions(subsData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (isInitial) setLoading(false);
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
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs font-semibold text-ink-secondary">Exam:</span>
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-bold text-ink focus:border-primary focus:outline-none shadow-2xs cursor-pointer"
            >
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} ({e.subject})
                </option>
              ))}
            </select>
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
