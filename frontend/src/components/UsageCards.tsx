"use client";

import React, { useState } from "react";
import {
  Activity,
  DollarSign,
  Clock,
  Cpu,
  Layers,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Sliders,
  Save,
  HelpCircle,
  Cloud,
  CreditCard,
  ShieldAlert,
  ExternalLink,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";
import { UsageMetrics } from "@/lib/types";
import { api } from "@/lib/api";
import { ButtonPrimary, ButtonUtility, FeatureCard, BadgePill, AppleNumberStepper } from "./ui";
import { useToast } from "@/lib/ToastContext";

interface UsageCardsProps {
  metrics: UsageMetrics;
  onQuotaUpdated?: () => void;
}

export function UsageCards({ metrics, onQuotaUpdated }: UsageCardsProps) {
  const { toast } = useToast();
  const { summary, latency, per_paper_metrics, quota_settings, projections, recent_events, gcp_paid } = metrics;
  const activeKeyCount = metrics.active_key_count || 4;

  // Active Telemetry Tab: Free Tier Pool vs GCP Paid Account
  const [activeTab, setActiveTab] = useState<"free_pool" | "gcp_paid">("free_pool");

  // Free Tier Quota Limits State
  const [rpm, setRpm] = useState(quota_settings?.rpm_limit || 15);
  const [tpm, setTpm] = useState(quota_settings?.tpm_limit || 1000000);
  const [rpd, setRpd] = useState(quota_settings?.rpd_limit || 1500);
  const [isSavingQuota, setIsSavingQuota] = useState(false);
  const [quotaSaved, setQuotaSaved] = useState(false);

  // GCP Paid Diagnostic State
  const [isTestingGcp, setIsTestingGcp] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    error_code?: string;
    http_status?: number;
    duration_ms?: number;
    input_tokens?: number;
    output_tokens?: number;
  } | null>(null);

  const handleSaveQuotas = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingQuota(true);
    try {
      await api.updateQuotaSettings({
        rpm_limit: Number(rpm),
        tpm_limit: Number(tpm),
        rpd_limit: Number(rpd),
      });
      setIsSavingQuota(false);
      setQuotaSaved(true);
      setTimeout(() => setQuotaSaved(false), 2000);
      toast.success("API quota and rate limits updated successfully!", { title: "Quota Updated" });
      if (onQuotaUpdated) onQuotaUpdated();
    } catch (err: any) {
      setIsSavingQuota(false);
      toast.error(err.message || "Failed to update quota settings", { title: "Update Failed" });
    }
  };

  const handleTestGcpConnection = async () => {
    setIsTestingGcp(true);
    setTestResult(null);
    try {
      const res = await api.testGcpPaidConnection();
      setTestResult(res);
      if (res.success) {
        toast.success(`GCP Vertex AI online (${res.duration_ms}ms)`, { title: "Connection Success" });
      } else {
        toast.error(`GCP responded with status ${res.http_status || 500}: ${res.error_code || "Error"}`, {
          title: "GCP Test Reported an Issue",
        });
      }
      if (onQuotaUpdated) onQuotaUpdated();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Network error while reaching test endpoint",
        error_code: "NETWORK_ERROR",
        http_status: 500,
      });
      toast.error(err.message || "Failed to trigger GCP test", { title: "Test Failed" });
    } finally {
      setIsTestingGcp(false);
    }
  };

  const gcpEvents = gcp_paid?.recent_events || [];
  const gcpErrorEntries = Object.entries(gcp_paid?.error_breakdown || {});

  return (
    <div className="space-y-6">
      {/* Telemetry Source Navigation Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-hairline pb-3">
        <div className="flex items-center gap-2 bg-canvas-soft p-1 rounded-lg border border-hairline w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("free_pool")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === "free_pool"
                ? "bg-surface text-ink shadow-sm border border-hairline"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span>AI Studio Engine (Free Pool)</span>
            <span className="ml-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-1.5 py-0.2 text-[10px] font-mono">
              {activeKeyCount} Keys
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("gcp_paid")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === "gcp_paid"
                ? "bg-surface text-ink shadow-sm border border-hairline"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <Cloud className="h-3.5 w-3.5 text-amber-500" />
            <span>Google Cloud Paid Account</span>
            <span className="ml-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 px-1.5 py-0.2 text-[10px] font-bold">
              PAID TIER
            </span>
          </button>
        </div>

        <div className="text-xs text-ink-muted flex items-center gap-2">
          {activeTab === "free_pool" ? (
            <span>Load-balanced round-robin rotation across {activeKeyCount} API keys</span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
              <CreditCard className="h-3.5 w-3.5" />
              Real money billing ledger • Pay-as-you-go auditing
            </span>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: FREE TIER POOL (22 KEYS)                                           */}
      {/* ========================================================================= */}
      {activeTab === "free_pool" && (
        <div className="space-y-6">
          {/* 1. Real-time KPI Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Calls */}
            <FeatureCard className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted">Total Free Pool Requests</span>
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 dark:bg-primary/20 border border-primary/20 text-primary dark:text-sky-400 shadow-2xs">
                  <Activity className="h-4 w-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-ink">{summary.total_requests}</span>
                <span className="text-xs text-ink-muted">
                  ({summary.successful_requests} ok / {summary.failed_requests} err)
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-ink-muted border-t border-hairline pt-2">
                <span>
                  Retry: <span className="font-semibold text-ink">{summary.retry_rate_pct}%</span>
                </span>
                <span>
                  Failure: <span className="font-semibold text-ink">{summary.failure_rate_pct}%</span>
                </span>
              </div>
            </FeatureCard>

            {/* Latency Duration */}
            <FeatureCard className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted">Latency Duration</span>
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-2xs">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-ink">
                  {latency.average_ms} <span className="text-xs font-normal text-ink-muted">ms avg</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-ink-muted border-t border-hairline pt-2">
                <span>
                  Median: <span className="font-semibold text-ink">{latency.median_ms}ms</span>
                </span>
                <span>
                  P95: <span className="font-semibold text-ink">{latency.p95_ms}ms</span>
                </span>
              </div>
            </FeatureCard>

            {/* Tokens Per Paper */}
            <FeatureCard className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted">Avg Tokens / Paper</span>
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20 text-amber-600 dark:text-amber-400 shadow-2xs">
                  <Cpu className="h-4 w-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-ink">
                  {Math.round(per_paper_metrics.avg_total_tokens).toLocaleString()}
                </span>
                <span className="text-xs text-ink-muted">tokens</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-ink-muted border-t border-hairline pt-2">
                <span>
                  In:{" "}
                  <span className="font-semibold text-ink">
                    {Math.round(per_paper_metrics.avg_input_tokens).toLocaleString()}
                  </span>
                </span>
                <span>
                  Out:{" "}
                  <span className="font-semibold text-ink">
                    {Math.round(per_paper_metrics.avg_output_tokens).toLocaleString()}
                  </span>
                </span>
              </div>
            </FeatureCard>

            {/* Cost Estimation */}
            <FeatureCard className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted">Est Equivalent Value</span>
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 border border-purple-500/20 text-purple-600 dark:text-purple-400 shadow-2xs">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-ink">
                  ${per_paper_metrics.avg_cost_usd.toFixed(5)}
                </span>
                <span className="text-xs text-ink-muted">/ paper</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-ink-muted border-t border-hairline pt-2">
                <span>
                  Total:{" "}
                  <span className="font-semibold text-ink">${summary.total_estimated_cost_usd.toFixed(4)}</span>
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Free Tier</span>
              </div>
            </FeatureCard>
          </div>

          {/* 2. User Google AI Studio Project Limits (Editable) */}
          <FeatureCard className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-hairline">
              <div>
                <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-primary" />
                  Configure Active Gemini Project Limits
                </h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Confirm your project rate limits from Google AI Studio. Feasibility projections automatically adapt.
                </p>
              </div>
              <BadgePill label={`Multi-Key Rotation (${activeKeyCount} Keys)`} color="green" />
            </div>

            <form onSubmit={handleSaveQuotas} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
              <div>
                <label className="text-xs font-semibold text-ink-secondary block mb-1.5">
                  Requests Per Minute (RPM)
                </label>
                <AppleNumberStepper
                  value={rpm}
                  onChange={(val) => setRpm(val)}
                  min={1}
                  max={2000}
                  step={1}
                  suffix="RPM"
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-secondary block mb-1.5">
                  Input Tokens Per Minute (TPM)
                </label>
                <AppleNumberStepper
                  value={tpm}
                  onChange={(val) => setTpm(val)}
                  min={1000}
                  step={50000}
                  suffix="TPM"
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-secondary block mb-1.5">
                  Requests Per Day (RPD)
                </label>
                <AppleNumberStepper
                  value={rpd}
                  onChange={(val) => setRpd(val)}
                  min={10}
                  step={50}
                  suffix="RPD"
                  className="w-full"
                />
              </div>

              <div>
                <ButtonPrimary
                  type="submit"
                  disabled={isSavingQuota}
                  className="w-full h-9 text-xs font-semibold"
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {quotaSaved ? "Saved!" : isSavingQuota ? "Saving..." : "Save Limits"}
                </ButtonPrimary>
              </div>
            </form>
          </FeatureCard>

          {/* 3. Feasibility Projections for 40 and 50 Student Submissions */}
          <FeatureCard className="p-6 space-y-4">
            <div className="pb-3 border-b border-hairline">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Batch Feasibility Projections (40 & 50 Submissions)
              </h3>
              <p className="mt-1 text-xs text-ink-muted">
                Projections include exam-setup call, observed retry rate ({summary.retry_rate_pct}%), and compare
                against your configured {rpm} RPM / {rpd} RPD limits.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 40 Submissions Card */}
              <div className="rounded-lg border border-hairline bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-ink">40 Student Submissions</span>
                  <BadgePill
                    label={`${projections.batch_40.total_calls_including_retries} calls`}
                    color="sky"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-canvas-soft p-2.5 border border-hairline">
                    <span className="text-[11px] text-ink-muted block mb-0.5">Average Case</span>
                    <div className="font-mono font-bold text-ink text-xs">
                      {Math.round(projections.batch_40.average_case.total_tokens).toLocaleString()} tokens
                    </div>
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
                      ${projections.batch_40.average_case.cost_usd.toFixed(4)} USD
                    </div>
                  </div>

                  <div className="rounded-md bg-canvas-soft p-2.5 border border-hairline">
                    <span className="text-[11px] text-ink-muted block mb-0.5">Conservative (P90)</span>
                    <div className="font-mono font-bold text-ink text-xs">
                      {Math.round(projections.batch_40.conservative_case.total_tokens).toLocaleString()} tokens
                    </div>
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 font-mono">
                      ${projections.batch_40.conservative_case.cost_usd.toFixed(4)} USD
                    </div>
                  </div>
                </div>

                <div className="rounded-md bg-canvas-soft p-2.5 border border-hairline text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Pacing Time:</span>
                    <span className="font-semibold text-ink">
                      {projections.batch_40.feasibility.min_pacing_minutes} min (delay:{" "}
                      {projections.batch_40.feasibility.recommended_delay_sec}s)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Daily Quota Consumed:</span>
                    <span className="font-semibold text-primary">
                      {projections.batch_40.feasibility.daily_quota_consumed_pct}% of {rpd} RPD
                    </span>
                  </div>
                </div>

                {projections.batch_40.feasibility.bottlenecks.map((b, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-[11px] rounded-lg p-2.5 border border-amber-300/60 bg-amber-50/80 text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/25 dark:text-amber-200 shadow-2xs"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>{b}</span>
                  </div>
                ))}
              </div>

              {/* 50 Submissions Card */}
              <div className="rounded-lg border border-hairline bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-ink">50 Student Submissions</span>
                  <BadgePill
                    label={`${projections.batch_50.total_calls_including_retries} calls`}
                    color="teal"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-canvas-soft p-2.5 border border-hairline">
                    <span className="text-[11px] text-ink-muted block mb-0.5">Average Case</span>
                    <div className="font-mono font-bold text-ink text-xs">
                      {Math.round(projections.batch_50.average_case.total_tokens).toLocaleString()} tokens
                    </div>
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
                      ${projections.batch_50.average_case.cost_usd.toFixed(4)} USD
                    </div>
                  </div>

                  <div className="rounded-md bg-canvas-soft p-2.5 border border-hairline">
                    <span className="text-[11px] text-ink-muted block mb-0.5">Conservative (P90)</span>
                    <div className="font-mono font-bold text-ink text-xs">
                      {Math.round(projections.batch_50.conservative_case.total_tokens).toLocaleString()} tokens
                    </div>
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 font-mono">
                      ${projections.batch_50.conservative_case.cost_usd.toFixed(4)} USD
                    </div>
                  </div>
                </div>

                <div className="rounded-md bg-canvas-soft p-2.5 border border-hairline text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Pacing Time:</span>
                    <span className="font-semibold text-ink">
                      {projections.batch_50.feasibility.min_pacing_minutes} min (delay:{" "}
                      {projections.batch_50.feasibility.recommended_delay_sec}s)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Daily Quota Consumed:</span>
                    <span className="font-semibold text-primary">
                      {projections.batch_50.feasibility.daily_quota_consumed_pct}% of {rpd} RPD
                    </span>
                  </div>
                </div>

                {projections.batch_50.feasibility.bottlenecks.map((b, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-[11px] rounded-lg p-2.5 border border-amber-300/60 bg-amber-50/80 text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/25 dark:text-amber-200 shadow-2xs"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </FeatureCard>

          {/* 4. Live API Experiment Log Table (Free Pool) */}
          <FeatureCard className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-hairline">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Captured AI Studio API Log ({recent_events.length} attempts)
              </h3>
              <span className="text-xs text-ink-muted">Round-Robin Multi-Key Pool</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-hairline bg-canvas-soft text-[11px] uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-3 py-2">Timestamp</th>
                    <th className="px-3 py-2">Purpose</th>
                    <th className="px-3 py-2">Model & Rotated Key</th>
                    <th className="px-3 py-2 text-right">In Tokens</th>
                    <th className="px-3 py-2 text-right">Out Tokens</th>
                    <th className="px-3 py-2 text-right">Duration</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-right">Est Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {recent_events.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-ink-muted">
                        No API attempts logged yet in the free tier pool.
                      </td>
                    </tr>
                  ) : (
                    recent_events.map((ev) => (
                      <tr key={ev.id} className="hover:bg-canvas-soft transition-colors">
                        <td className="px-3 py-2 font-mono text-[11px] text-ink-muted whitespace-nowrap">
                          {new Date(ev.timestamp).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 font-medium text-ink">
                          <span className="rounded bg-canvas-soft border border-hairline px-1.5 py-0.5 text-[10px]">
                            {ev.request_purpose}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-primary">
                          <div>{ev.model_name}</div>
                          {ev.api_key_masked && (
                            <div className="text-[10px] text-ink-muted font-sans font-normal">
                              {ev.api_key_masked}
                            </div>
                          )}
                          {ev.is_mock === 1 && <span className="ml-1 text-[9px] text-amber-600 dark:text-amber-400 font-semibold">(mock)</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-ink">
                          {ev.input_tokens ? ev.input_tokens.toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-ink">
                          {ev.output_tokens ? ev.output_tokens.toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-ink font-semibold">
                          {ev.duration_ms}ms
                        </td>
                        <td className="px-3 py-2 text-center">
                          <BadgePill
                            label={ev.success === 1 ? "SUCCESS" : ev.error_code || "FAIL"}
                            color={ev.success === 1 ? "green" : "pink"}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                          ${(ev.estimated_cost_usd || 0).toFixed(5)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </FeatureCard>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: GOOGLE CLOUD PAID ACCOUNT (VERTEX AI)                              */}
      {/* ========================================================================= */}
      {activeTab === "gcp_paid" && (
        <div className="space-y-6">
          {/* Header Account Summary Banner */}
          <FeatureCard className="p-6 border-amber-200/60 bg-gradient-to-r from-amber-500/5 via-surface to-surface">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20 text-amber-600 dark:text-amber-400 shadow-2xs shrink-0">
                    <Cloud className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink flex items-center gap-2">
                      Google Cloud Paid Vertex AI Account
                      <BadgePill label="Pay-As-You-Go" color="purple" />
                    </h3>
                    <p className="text-xs text-ink-muted">
                      Dedicated end-to-end metrics ledger. Every request made to this paid account is billed to your GCP card.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 text-xs font-mono">
                  <div className="bg-canvas-soft border border-hairline rounded-md px-2.5 py-1.5">
                    <span className="text-[10px] text-ink-muted uppercase block">Project ID</span>
                    <span className="font-semibold text-ink break-all">
                      {gcp_paid?.project_id || "project-fe04c36f-bda1-4c99-86b"}
                    </span>
                  </div>
                  <div className="bg-canvas-soft border border-hairline rounded-md px-2.5 py-1.5">
                    <span className="text-[10px] text-ink-muted uppercase block">Service Account</span>
                    <span className="font-semibold text-ink truncate block" title={gcp_paid?.service_account_email}>
                      {gcp_paid?.service_account_email || "1040007059825-compute@developer.gserviceaccount.com"}
                    </span>
                  </div>
                  <div className="bg-canvas-soft border border-hairline rounded-md px-2.5 py-1.5">
                    <span className="text-[10px] text-ink-muted uppercase block">Location & Status</span>
                    <span className="font-semibold text-ink flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                      {gcp_paid?.location || "global"} • {gcp_paid?.is_configured ? "Ready" : "Active"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ping / Test Action */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                <ButtonPrimary
                  onClick={handleTestGcpConnection}
                  disabled={isTestingGcp}
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isTestingGcp ? "animate-spin" : ""}`} />
                  {isTestingGcp ? "Pinging Vertex AI..." : "Test Paid Connection"}
                </ButtonPrimary>
              </div>
            </div>

            {/* Test Connection Result Box */}
            {testResult && (
              <div
                className={`mt-4 rounded-lg p-3 text-xs border ${
                  testResult.success
                    ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                    : "bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      {testResult.success ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span>GCP Paid Vertex AI Responded: 200 OK ({testResult.duration_ms}ms)</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 text-rose-600" />
                          <span>
                            GCP Test Encountered Error ({testResult.http_status || 500} {testResult.error_code})
                          </span>
                        </>
                      )}
                    </div>
                    <div className="font-mono text-[11px] leading-relaxed break-all">
                      {testResult.message}
                    </div>
                    {testResult.success && (
                      <div className="text-[10px] opacity-80 pt-1">
                        Prompt Tokens: {testResult.input_tokens || 0} • Candidate Tokens:{" "}
                        {testResult.output_tokens || 0} • Billed to GCP project
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setTestResult(null)}
                    className="text-xs opacity-60 hover:opacity-100 p-1"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
          </FeatureCard>

          {/* Paid KPI Scorecards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Money Spent */}
            <FeatureCard className="p-5 space-y-3 border-amber-300/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted">Total Money Billed (USD)</span>
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20 text-amber-600 dark:text-amber-400 shadow-2xs">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-amber-600 dark:text-amber-400">
                  ${(gcp_paid?.total_spent_usd || 0).toFixed(6)}
                </span>
                <span className="text-xs text-ink-muted">USD</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-ink-muted border-t border-hairline pt-2">
                <span>Account Billing: <span className="font-semibold text-ink">Active</span></span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Real Incurred Cost</span>
              </div>
            </FeatureCard>

            {/* Total Paid Requests */}
            <FeatureCard className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted">Paid API Calls</span>
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 text-blue-600 dark:text-blue-400 shadow-2xs">
                  <Server className="h-4 w-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-ink">
                  {gcp_paid?.total_requests || 0}
                </span>
                <span className="text-xs text-ink-muted">
                  ({gcp_paid?.successful_requests || 0} ok / {gcp_paid?.failed_requests || 0} err)
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-ink-muted border-t border-hairline pt-2">
                <span>Success Rate: <span className="font-semibold text-ink">{gcp_paid?.success_rate_pct || 0}%</span></span>
                <span>Errors: <span className="font-semibold text-rose-500">{gcp_paid?.failed_requests || 0}</span></span>
              </div>
            </FeatureCard>

            {/* Tokens Billed */}
            <FeatureCard className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted">Total Tokens Incurred</span>
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 border border-purple-500/20 text-purple-600 dark:text-purple-400 shadow-2xs">
                  <Cpu className="h-4 w-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-ink">
                  {((gcp_paid?.total_input_tokens || 0) + (gcp_paid?.total_output_tokens || 0)).toLocaleString()}
                </span>
                <span className="text-xs text-ink-muted">tokens</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-ink-muted border-t border-hairline pt-2">
                <span>In: <span className="font-semibold text-ink font-mono">{(gcp_paid?.total_input_tokens || 0).toLocaleString()}</span></span>
                <span>Out: <span className="font-semibold text-ink font-mono">{(gcp_paid?.total_output_tokens || 0).toLocaleString()}</span></span>
              </div>
            </FeatureCard>

            {/* Average Latency */}
            <FeatureCard className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted">Average Latency</span>
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shadow-2xs">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-ink">
                  {gcp_paid?.avg_latency_ms || 0}
                </span>
                <span className="text-xs font-normal text-ink-muted">ms avg</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-ink-muted border-t border-hairline pt-2">
                <span>Cached: <span className="font-semibold text-ink font-mono">{(gcp_paid?.total_cached_tokens || 0).toLocaleString()}</span></span>
                <span>Thinking: <span className="font-semibold text-ink font-mono">{(gcp_paid?.total_thinking_tokens || 0).toLocaleString()}</span></span>
              </div>
            </FeatureCard>
          </div>

          {/* GCP Configuration & Error Diagnostic Alert */}
          <FeatureCard className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-hairline">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  Google Cloud Console Setup & Error Code Breakdown
                </h3>
                <p className="text-xs text-ink-muted">
                  Every response and error code returned from Google Cloud Vertex AI is tracked here.
                </p>
              </div>

              {gcpErrorEntries.length > 0 && (
                <BadgePill label={`${gcpErrorEntries.length} Unique Error Type(s)`} color="pink" />
              )}
            </div>

            {/* Error Breakdown Badges */}
            {gcpErrorEntries.length > 0 ? (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-ink-secondary block">Recorded Error Codes:</span>
                <div className="flex flex-wrap gap-2">
                  {gcpErrorEntries.map(([errKey, count]) => (
                    <div
                      key={errKey}
                      className="rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/30 px-3 py-1.5 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                      <span className="font-mono font-semibold">{errKey}</span>
                      <span className="rounded-full bg-rose-200 dark:bg-rose-900/60 text-rose-900 dark:text-rose-200 px-1.5 py-0.2 text-[10px] font-bold">
                        {count} call{count > 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 p-3 text-xs text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Zero error codes logged for this Google Cloud Paid Account.</span>
              </div>
            )}

            {/* 1-Click GCP Enablement Guide */}
            <div className="rounded-lg border border-hairline bg-canvas-soft p-4 space-y-3 text-xs">
              <span className="font-bold text-ink flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-primary" />
                If Vertex AI returns 404 NOT_FOUND or 403 PERMISSION_DENIED:
              </span>
              <p className="text-ink-muted leading-relaxed">
                In Google Cloud, models reside inside the Vertex AI platform. The Service Account must have Vertex AI enabled on project{" "}
                <span className="font-mono font-semibold text-ink">project-fe04c36f-bda1-4c99-86b</span>:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <a
                  href="https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=project-fe04c36f-bda1-4c99-86b"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-md border border-hairline bg-surface hover:border-primary transition-colors text-ink font-semibold group"
                >
                  <div className="space-y-0.5">
                    <span className="block text-xs">1. Enable Vertex AI API</span>
                    <span className="block text-[11px] text-ink-muted font-normal">
                      aiplatform.googleapis.com in GCP Console
                    </span>
                  </div>
                  <ExternalLink className="h-4 w-4 text-ink-muted group-hover:text-primary transition-colors shrink-0" />
                </a>

                <a
                  href="https://console.cloud.google.com/iam-admin/iam?project=project-fe04c36f-bda1-4c99-86b"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-md border border-hairline bg-surface hover:border-primary transition-colors text-ink font-semibold group"
                >
                  <div className="space-y-0.5">
                    <span className="block text-xs">2. Assign Vertex AI User Role</span>
                    <span className="block text-[11px] text-ink-muted font-normal">
                      Grant roles/aiplatform.user to Compute SA
                    </span>
                  </div>
                  <ExternalLink className="h-4 w-4 text-ink-muted group-hover:text-primary transition-colors shrink-0" />
                </a>
              </div>
            </div>
          </FeatureCard>

          {/* Dedicated End-to-End GCP Paid Request & Response Ledger */}
          <FeatureCard className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-hairline">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-amber-500" />
                Dedicated Google Cloud Paid Ledger ({gcpEvents.length} recorded events)
              </h3>
              <span className="text-xs text-ink-muted font-mono">
                Key: {gcp_paid?.project_id}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-hairline bg-canvas-soft text-[11px] uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-3 py-2">Timestamp</th>
                    <th className="px-3 py-2">Purpose</th>
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2 text-right">In Tokens</th>
                    <th className="px-3 py-2 text-right">Out Tokens</th>
                    <th className="px-3 py-2 text-right">Duration</th>
                    <th className="px-3 py-2 text-center">Status / Error Code</th>
                    <th className="px-3 py-2 text-right">Billed USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {gcpEvents.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-ink-muted">
                        No requests have been executed on your Google Cloud Paid account yet.
                        <br />
                        Click <span className="font-semibold text-ink">"Test Paid Connection"</span> above to send an initial diagnostic ping.
                      </td>
                    </tr>
                  ) : (
                    gcpEvents.map((ev) => (
                      <tr key={ev.id} className="hover:bg-canvas-soft transition-colors">
                        <td className="px-3 py-2 font-mono text-[11px] text-ink-muted whitespace-nowrap">
                          {new Date(ev.timestamp).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 font-medium text-ink">
                          <span className="rounded bg-canvas-soft border border-hairline px-1.5 py-0.5 text-[10px]">
                            {ev.request_purpose}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-primary">
                          <div>{ev.model_name}</div>
                          <div className="text-[10px] text-ink-muted font-sans font-normal">
                            Vertex AI ({gcp_paid?.location || "global"})
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-ink">
                          {ev.input_tokens ? ev.input_tokens.toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-ink">
                          {ev.output_tokens ? ev.output_tokens.toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-ink font-semibold">
                          {ev.duration_ms}ms
                        </td>
                        <td className="px-3 py-2 text-center">
                          <BadgePill
                            label={ev.success === 1 ? "200 OK" : ev.error_code ? ev.error_code.slice(0, 30) : "FAIL"}
                            color={ev.success === 1 ? "green" : "pink"}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-amber-600 dark:text-amber-400 font-semibold">
                          ${(ev.estimated_cost_usd || 0).toFixed(6)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </FeatureCard>
        </div>
      )}
    </div>
  );
}