"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  TrendingUp,
  Cpu,
  Clock,
  DollarSign,
  Activity,
  CheckCircle,
  HelpCircle,
  Sparkles,
  ClipboardCheck,
  Plus,
} from "lucide-react";
import { api } from "@/lib/api";
import { UsageMetrics, BenchmarkSummary, Exam } from "@/lib/types";
import { UsageCards } from "@/components/UsageCards";
import { ButtonPrimary, ButtonUtility, FeatureCard, BadgePill, AnalyticsSkeleton } from "@/components/ui";
import { useToast } from "@/lib/ToastContext";
import { useTenant } from "@/lib/TenantContext";

export default function AnalyticsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isBranchManager } = useTenant();

  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [benchmarks, setBenchmarks] = useState<BenchmarkSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // New benchmark form state
  const [benchSubId, setBenchSubId] = useState("");
  const [benchMarks, setBenchMarks] = useState(18);
  const [benchTranscription, setBenchTranscription] = useState(true);
  const [benchMapping, setBenchMapping] = useState(true);
  const [benchBox, setBenchBox] = useState(true);
  const [benchMarksMatch, setBenchMarksMatch] = useState(true);
  const [benchExplanation, setBenchExplanation] = useState(true);
  const [benchIntervention, setBenchIntervention] = useState(false);
  const [benchNotes, setBenchNotes] = useState("");
  const [isSubmittingBench, setIsSubmittingBench] = useState(false);

  useEffect(() => {
    if (isBranchManager) {
      router.replace("/branch/batches");
      return;
    }
    loadAll();
  }, [isBranchManager]);

  const loadAll = async () => {
    try {
      const [uData, eList] = await Promise.all([
        api.getUsageMetrics(),
        api.listExams(),
      ]);
      setMetrics(uData);
      setExams(eList);
      if (eList.length > 0) {
        setSelectedExamId(eList[0].id);
        const bData = await api.getBenchmarks(eList[0].id);
        setBenchmarks(bData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExamChange = async (examId: string) => {
    setSelectedExamId(examId);
    try {
      const bData = await api.getBenchmarks(examId);
      setBenchmarks(bData);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRecordBenchmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamId || !benchSubId) {
      toast.warning("Please enter a valid submission ID.", { title: "Validation Error" });
      return;
    }
    setIsSubmittingBench(true);
    try {
      await api.recordBenchmark({
        submission_id: benchSubId,
        exam_id: selectedExamId,
        ground_truth_marks: Number(benchMarks),
        transcription_accepted: benchTranscription,
        mapping_correct: benchMapping,
        box_accepted: benchBox,
        marks_matched: benchMarksMatch,
        explanation_sufficient: benchExplanation,
        manual_intervention_required: benchIntervention,
        notes: benchNotes,
      });
      toast.success("Ground-truth benchmark recorded successfully!", { title: "Benchmark Recorded" });
      const bData = await api.getBenchmarks(selectedExamId);
      setBenchmarks(bData);
      setBenchNotes("");
    } catch (err: any) {
      toast.error(err.message || "Failed to record benchmark", { title: "Recording Failed" });
    } finally {
      setIsSubmittingBench(false);
    }
  };

  if (loading || !metrics) {
    return <AnalyticsSkeleton />;
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="pb-3 border-b border-hairline">
        <div className="flex items-center gap-2 mb-1">
          <BadgePill label="Telemetry & Rate Limits" color="purple" />
          <span className="text-xs text-ink-muted">• Google AI Studio Multi-Key Engine</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          API Consumption, Feasibility & Quota Telemetry
        </h1>
        <p className="text-xs sm:text-sm text-ink-muted mt-1">
          Observed Gemini multimodal API usage, latency percentiles, dynamic pacing calculations, and 40/50 paper feasibility simulations.
        </p>
      </div>

      {/* Main Usage & Projection Component */}
      <UsageCards metrics={metrics} onQuotaUpdated={loadAll} />

      {/* Experimental Evaluation & Ground Truth Benchmark Section */}
      <FeatureCard className="p-6 space-y-6">
        <div className="pb-3 border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-ink">
              Repeatable Accuracy & Teacher Ground-Truth Benchmark
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Empirically verify Gemini evaluation against human teacher marks without synthetic composites.
            </p>
          </div>

          {exams.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-ink-muted">Active Exam:</span>
              <select
                value={selectedExamId}
                onChange={(e) => handleExamChange(e.target.value)}
                className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-ink font-medium focus:outline-none focus:border-primary"
              >
                {exams.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Benchmark Scorecards */}
        {benchmarks && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-lg border border-hairline bg-canvas-soft p-3 text-center">
              <span className="text-[10px] text-ink-muted uppercase tracking-wider block">Evaluated</span>
              <span className="font-mono text-lg font-bold text-ink mt-1 block">
                {benchmarks.sample_size} papers
              </span>
            </div>

            <div className="rounded-lg border border-hairline bg-canvas-soft p-3 text-center">
              <span className="text-[10px] text-ink-muted uppercase tracking-wider block">Transcription</span>
              <span className="font-mono text-lg font-bold text-[#1aae39] mt-1 block">
                {benchmarks.transcription_accuracy_pct}%
              </span>
            </div>

            <div className="rounded-lg border border-hairline bg-canvas-soft p-3 text-center">
              <span className="text-[10px] text-ink-muted uppercase tracking-wider block">Question Map</span>
              <span className="font-mono text-lg font-bold text-primary mt-1 block">
                {benchmarks.question_mapping_accuracy_pct}%
              </span>
            </div>

            <div className="rounded-lg border border-hairline bg-canvas-soft p-3 text-center">
              <span className="text-[10px] text-ink-muted uppercase tracking-wider block">Boxes Accepted</span>
              <span className="font-mono text-lg font-bold text-[#dd5b00] mt-1 block">
                {benchmarks.localization_acceptance_pct}%
              </span>
            </div>

            <div className="rounded-lg border border-hairline bg-canvas-soft p-3 text-center">
              <span className="text-[10px] text-ink-muted uppercase tracking-wider block">Mark Agreement</span>
              <span className="font-mono text-lg font-bold text-[#793caf] mt-1 block">
                {benchmarks.exact_score_agreement_pct}%
              </span>
            </div>

            <div className="rounded-lg border border-hairline bg-canvas-soft p-3 text-center">
              <span className="text-[10px] text-ink-muted uppercase tracking-wider block">Intervention</span>
              <span className="font-mono text-lg font-bold text-[#c92a95] mt-1 block">
                {benchmarks.manual_intervention_rate_pct}%
              </span>
            </div>
          </div>
        )}

        {/* Record Benchmark Form */}
        <form onSubmit={handleRecordBenchmark} className="rounded-lg border border-hairline bg-canvas-soft p-4 sm:p-5 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
            Record Teacher Verification for a Paper
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-ink-secondary block mb-1">Submission ID</label>
              <input
                type="text"
                required
                placeholder="Paste submission ID (e.g. sub_...)"
                value={benchSubId}
                onChange={(e) => setBenchSubId(e.target.value)}
                className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-ink-secondary block mb-1">Teacher Reference Total Marks</label>
              <input
                type="number"
                step="0.5"
                value={benchMarks}
                onChange={(e) => setBenchMarks(parseFloat(e.target.value) || 0)}
                className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-ink-secondary">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={benchTranscription}
                onChange={(e) => setBenchTranscription(e.target.checked)}
                className="rounded border-hairline text-primary focus:ring-primary"
              />
              <span>Transcription Accepted As-is</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={benchMapping}
                onChange={(e) => setBenchMapping(e.target.checked)}
                className="rounded border-hairline text-primary focus:ring-primary"
              />
              <span>Question Mapping Correct</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={benchBox}
                onChange={(e) => setBenchBox(e.target.checked)}
                className="rounded border-hairline text-primary focus:ring-primary"
              />
              <span>Bounding Boxes Accepted</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={benchMarksMatch}
                onChange={(e) => setBenchMarksMatch(e.target.checked)}
                className="rounded border-hairline text-primary focus:ring-primary"
              />
              <span>Marks Matched Teacher Key</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={benchExplanation}
                onChange={(e) => setBenchExplanation(e.target.checked)}
                className="rounded border-hairline text-primary focus:ring-primary"
              />
              <span>Explanation Was Sufficient</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={benchIntervention}
                onChange={(e) => setBenchIntervention(e.target.checked)}
                className="rounded border-hairline text-primary focus:ring-primary"
              />
              <span>Manual Intervention Required</span>
            </label>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <input
              type="text"
              placeholder="Notes on model reasoning or bounding box alignment..."
              value={benchNotes}
              onChange={(e) => setBenchNotes(e.target.value)}
              className="flex-1 rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-primary"
            />
            <ButtonPrimary
              type="submit"
              disabled={isSubmittingBench}
              size="sm"
            >
              {isSubmittingBench ? "Saving..." : "Record Evaluation"}
            </ButtonPrimary>
          </div>
        </form>
      </FeatureCard>
    </div>
  );
}
