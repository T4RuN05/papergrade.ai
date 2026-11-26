"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Layers,
  Sparkles,
  ClipboardCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { UsageCards } from "@/components/UsageCards";
import { AnalyticsSkeleton, AppleNumberStepper, AppleSelect } from "@/components/ui";
import { useToast } from "@/lib/ToastContext";
import { useTenant } from "@/lib/TenantContext";
import { useQueryClient } from "@tanstack/react-query";
import { useTelemetryMetrics, useExamsList, useBenchmarks } from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";

export default function AnalyticsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isBranchManager, isInstituteDirector } = useTenant();

  // Primary Tab: "telemetry" | "logs" | "benchmarks"
  const [activeMainTab, setActiveMainTab] = useState<"telemetry" | "logs" | "benchmarks">("telemetry");

  // TanStack Queries (Cached in-memory, instant back-nav, CLS = 0.00)
  const {
    data: metrics,
    isLoading: isMetricsLoading,
    isRefetching: isMetricsRefetching,
    error: metricsError,
    refetch: refetchMetrics,
  } = useTelemetryMetrics();
  const { data: exams = [] } = useExamsList();

  const [selectedExamId, setSelectedExamId] = useState<string>("");

  useEffect(() => {
    if (exams.length > 0 && !selectedExamId) {
      setSelectedExamId(exams[0].id);
    }
  }, [exams, selectedExamId]);

  const { data: benchmarks, refetch: refetchBenchmarks } = useBenchmarks(selectedExamId);

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
    if (isBranchManager || isInstituteDirector) {
      router.replace("/branch/batches");
    }
  }, [isBranchManager, isInstituteDirector, router]);

  const handleExamChange = (examId: string) => {
    setSelectedExamId(examId);
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
      queryClient.invalidateQueries({ queryKey: queryKeys.telemetry.benchmarks(selectedExamId) });
      await refetchBenchmarks();
      setBenchSubId("");
      setBenchNotes("");
    } catch (err: any) {
      toast.error(err.message || "Failed to record benchmark", { title: "Recording Failed" });
    } finally {
      setIsSubmittingBench(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12 cascade-group">
      {/* Page Header & Segmented View Switcher */}
      <header className="pb-4 border-b border-hairline flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <p className="notion-eyebrow text-ink-muted">Gemini Multimodal Engine</p>
          <h1 className="notion-heading-2 text-2xl sm:text-[26px] text-ink">
            Telemetry &amp; Quotas
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed max-w-2xl">
            API consumption, latency percentiles, dynamic pacing feasibility, and empirical accuracy benchmarks.
          </p>
        </div>

        {/* Symmetrical Segmented Control */}
        <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-surface border border-hairline rounded-md w-full lg:w-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveMainTab("telemetry")}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeMainTab === "telemetry"
                ? "bg-canvas-soft text-ink border border-hairline"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <Activity className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>Telemetry</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab("logs")}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeMainTab === "logs"
                ? "bg-canvas-soft text-ink border border-hairline"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>Ledger</span>
            {metrics && (
              <span className="hidden xs:inline-flex rounded-full bg-surface border border-hairline px-1.5 py-0.5 text-[10px] font-mono text-ink-secondary tabular-nums">
                {metrics.recent_events.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab("benchmarks")}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeMainTab === "benchmarks"
                ? "bg-canvas-soft text-ink border border-hairline"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <ClipboardCheck className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>Benchmarks</span>
            {benchmarks && (
              <span className="hidden xs:inline-flex rounded-full bg-surface border border-hairline px-1.5 py-0.5 text-[10px] font-mono text-ink-secondary tabular-nums">
                {benchmarks.sample_size}
              </span>
            )}
          </button>
        </div>
      </header>

      {isMetricsLoading && !metrics ? (
        <AnalyticsSkeleton />
      ) : metricsError || !metrics ? (
        <div className="max-w-xl mx-auto py-12 px-4">
          <div className="notion-card p-6 sm:p-8 text-center space-y-4">
            <div className="mx-auto h-11 w-11 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary">
              <Activity className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h2 className="notion-heading-3 text-base text-ink">Telemetry Unavailable</h2>
              <p className="text-xs text-ink-muted leading-relaxed">
                {(metricsError as any)?.message || "Unable to load telemetry metrics from the server."}
              </p>
            </div>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => refetchMetrics()}
                className="notion-btn-primary"
              >
                Retry Telemetry Fetch
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Main Telemetry & Request Ledger Component (Kept mounted to preserve state & prevent CLS) */}
          <div className={activeMainTab === "benchmarks" ? "hidden" : "space-y-4"}>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-1">
              <div className="min-w-0 space-y-0.5">
                <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
                  {activeMainTab === "logs" ? "Request Execution Ledger" : "Quota, Latency & Cost Projections"}
                </h2>
                <p className="text-xs sm:text-[13px] text-ink-muted leading-relaxed">
                  {activeMainTab === "logs"
                    ? "Chronological log of recent Gemini inference requests, token counts, and statuses."
                    : "Monitor AI Studio key pool throughput, GCP Vertex usage, and dynamic batch pacing."}
                </p>
              </div>
            </div>

            <UsageCards
              metrics={metrics}
              activeView={activeMainTab === "logs" ? "logs" : "telemetry"}
              onQuotaUpdated={() => { refetchMetrics(); }}
              onRefreshLogs={async () => { await refetchMetrics(); }}
              isRefreshingLogs={isMetricsRefetching}
            />
          </div>

          {/* Repeatable Accuracy & Teacher Ground-Truth Benchmark Section */}
          {activeMainTab === "benchmarks" && (
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-1">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
                      Accuracy &amp; Ground-Truth Benchmarks
                    </h2>
                    {benchmarks && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface border border-hairline text-ink-muted tabular-nums">
                        {benchmarks.sample_size} papers
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-[13px] text-ink-muted leading-relaxed">
                    Empirically verify Gemini evaluation against human teacher marks without synthetic composites.
                  </p>
                </div>

                {exams.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    <span className="text-xs font-medium text-ink-muted shrink-0">Exam:</span>
                    <AppleSelect
                      size="sm"
                      value={selectedExamId}
                      onChange={(val) => handleExamChange(val)}
                      options={exams.map((e) => ({ value: e.id, label: e.title }))}
                      className="flex-1 sm:w-[240px]"
                    />
                  </div>
                )}
              </div>

              <div className="notion-card p-4 sm:p-6 space-y-6">
                {/* Benchmark Scorecards (2x3 on mobile, 3x2 on sm, 6-col on lg) */}
                {benchmarks && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="rounded-lg border border-hairline bg-canvas-soft p-3.5 space-y-1">
                      <span className="text-xs font-medium text-ink-muted block truncate">Evaluated</span>
                      <span className="font-mono text-lg font-bold text-ink tabular-nums block">
                        {benchmarks.sample_size}
                      </span>
                      <span className="text-[11px] text-ink-muted block truncate">Verified papers</span>
                    </div>

                    <div className="rounded-lg border border-hairline bg-canvas-soft p-3.5 space-y-1">
                      <span className="text-xs font-medium text-ink-muted block truncate">Transcription</span>
                      <span className="font-mono text-lg font-bold text-ink tabular-nums block">
                        {benchmarks.transcription_accuracy_pct}%
                      </span>
                      <span className="text-[11px] text-ink-muted block truncate">OCR acceptance</span>
                    </div>

                    <div className="rounded-lg border border-hairline bg-canvas-soft p-3.5 space-y-1">
                      <span className="text-xs font-medium text-ink-muted block truncate">Question Map</span>
                      <span className="font-mono text-lg font-bold text-primary tabular-nums block">
                        {benchmarks.question_mapping_accuracy_pct}%
                      </span>
                      <span className="text-[11px] text-ink-muted block truncate">Item matching</span>
                    </div>

                    <div className="rounded-lg border border-hairline bg-canvas-soft p-3.5 space-y-1">
                      <span className="text-xs font-medium text-ink-muted block truncate">Boxes Accepted</span>
                      <span className="font-mono text-lg font-bold text-ink tabular-nums block">
                        {benchmarks.localization_acceptance_pct}%
                      </span>
                      <span className="text-[11px] text-ink-muted block truncate">Region overlap</span>
                    </div>

                    <div className="rounded-lg border border-hairline bg-canvas-soft p-3.5 space-y-1">
                      <span className="text-xs font-medium text-ink-muted block truncate">Mark Agreement</span>
                      <span className="font-mono text-lg font-bold text-ink tabular-nums block">
                        {benchmarks.exact_score_agreement_pct}%
                      </span>
                      <span className="text-[11px] text-ink-muted block truncate">Exact key match</span>
                    </div>

                    <div className="rounded-lg border border-hairline bg-canvas-soft p-3.5 space-y-1">
                      <span className="text-xs font-medium text-ink-muted block truncate">Intervention</span>
                      <span className="font-mono text-lg font-bold text-ink tabular-nums block">
                        {benchmarks.manual_intervention_rate_pct}%
                      </span>
                      <span className="text-[11px] text-ink-muted block truncate">Manual edits</span>
                    </div>
                  </div>
                )}

                {/* Record Benchmark Form */}
                <form
                  onSubmit={handleRecordBenchmark}
                  className="rounded-lg border border-hairline bg-canvas-soft p-4 sm:p-5 space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <h3 className="notion-section-title text-sm text-ink">
                      Record Teacher Verification for a Paper
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-ink-secondary block mb-1.5">
                        Submission ID
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Paste submission ID (e.g. sub_...)"
                        value={benchSubId}
                        onChange={(e) => setBenchSubId(e.target.value)}
                        className="w-full h-9 rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-ink-secondary block mb-1.5">
                        Teacher Reference Total Marks
                      </label>
                      <AppleNumberStepper
                        value={benchMarks}
                        onChange={(val) => setBenchMarks(val)}
                        min={0}
                        max={500}
                        step={0.5}
                        allowDecimal
                        suffix="marks"
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3 text-xs text-ink-secondary pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={benchTranscription}
                        onChange={(e) => setBenchTranscription(e.target.checked)}
                        className="rounded-xs border-hairline text-primary focus:ring-primary cursor-pointer"
                      />
                      <span>Transcription Accepted As-is</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={benchMapping}
                        onChange={(e) => setBenchMapping(e.target.checked)}
                        className="rounded-xs border-hairline text-primary focus:ring-primary cursor-pointer"
                      />
                      <span>Question Mapping Correct</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={benchBox}
                        onChange={(e) => setBenchBox(e.target.checked)}
                        className="rounded-xs border-hairline text-primary focus:ring-primary cursor-pointer"
                      />
                      <span>Bounding Boxes Accepted</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={benchMarksMatch}
                        onChange={(e) => setBenchMarksMatch(e.target.checked)}
                        className="rounded-xs border-hairline text-primary focus:ring-primary cursor-pointer"
                      />
                      <span>Marks Matched Teacher Key</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={benchExplanation}
                        onChange={(e) => setBenchExplanation(e.target.checked)}
                        className="rounded-xs border-hairline text-primary focus:ring-primary cursor-pointer"
                      />
                      <span>Explanation Was Sufficient</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={benchIntervention}
                        onChange={(e) => setBenchIntervention(e.target.checked)}
                        className="rounded-xs border-hairline text-primary focus:ring-primary cursor-pointer"
                      />
                      <span>Manual Intervention Required</span>
                    </label>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                    <input
                      type="text"
                      placeholder="Notes on model reasoning or bounding box alignment..."
                      value={benchNotes}
                      onChange={(e) => setBenchNotes(e.target.value)}
                      className="flex-1 rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface px-3 py-2 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary"
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingBench}
                      className="notion-btn-primary justify-center w-full sm:w-auto disabled:opacity-50"
                    >
                      {isSubmittingBench ? "Saving..." : "Record Evaluation"}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
