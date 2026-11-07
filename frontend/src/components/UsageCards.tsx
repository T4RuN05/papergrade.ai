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
} from "lucide-react";
import { UsageMetrics } from "@/lib/types";
import { api } from "@/lib/api";
import { ButtonPrimary, ButtonUtility, FeatureCard, BadgePill } from "./ui";
import { useToast } from "@/lib/ToastContext";

interface UsageCardsProps {
  metrics: UsageMetrics;
  onQuotaUpdated?: () => void;
}

export function UsageCards({ metrics, onQuotaUpdated }: UsageCardsProps) {
  const { toast } = useToast();
  const { summary, latency, per_paper_metrics, quota_settings, projections, recent_events } = metrics;

  const [rpm, setRpm] = useState(quota_settings?.rpm_limit || 15);
  const [tpm, setTpm] = useState(quota_settings?.tpm_limit || 1000000);
  const [rpd, setRpd] = useState(quota_settings?.rpd_limit || 1500);
  const [isSavingQuota, setIsSavingQuota] = useState(false);
  const [quotaSaved, setQuotaSaved] = useState(false);

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

  return (
    <div className="space-y-6">
      {/* 1. Real-time KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Calls */}
        <FeatureCard className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-muted">Total API Requests</span>
            <div className="rounded-md bg-[#edf5fd] p-1.5 text-primary">
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
            <span>Retry: <span className="font-semibold text-ink">{summary.retry_rate_pct}%</span></span>
            <span>Failure: <span className="font-semibold text-ink">{summary.failure_rate_pct}%</span></span>
          </div>
        </FeatureCard>

        {/* Latency Percentiles */}
        <FeatureCard className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-muted">Latency Duration</span>
            <div className="rounded-md bg-[#eaf7ed] p-1.5 text-[#1aae39]">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-ink">
              {latency.average_ms} <span className="text-xs font-normal text-ink-muted">ms avg</span>
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-ink-muted border-t border-hairline pt-2">
            <span>Median: <span className="font-semibold text-ink">{latency.median_ms}ms</span></span>
            <span>P95: <span className="font-semibold text-ink">{latency.p95_ms}ms</span></span>
          </div>
        </FeatureCard>

        {/* Tokens Per Paper */}
        <FeatureCard className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-muted">Avg Tokens / Paper</span>
            <div className="rounded-md bg-[#fef4ea] p-1.5 text-[#dd5b00]">
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
            <span>In: <span className="font-semibold text-ink">{Math.round(per_paper_metrics.avg_input_tokens).toLocaleString()}</span></span>
            <span>Out: <span className="font-semibold text-ink">{Math.round(per_paper_metrics.avg_output_tokens).toLocaleString()}</span></span>
          </div>
        </FeatureCard>

        {/* Cost Estimation */}
        <FeatureCard className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-muted">Estimated Cost</span>
            <div className="rounded-md bg-[#f5eefc] p-1.5 text-[#793caf]">
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
            <span>Total: <span className="font-semibold text-ink">${summary.total_estimated_cost_usd.toFixed(4)}</span></span>
            <span className="text-[10px] text-ink-muted">Flash 3.8</span>
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
              Confirm your project's active rate limits from Google AI Studio. Feasibility projections automatically adapt.
            </p>
          </div>
          <BadgePill label="Multi-Key Rotation" color="green" />
        </div>

        <form onSubmit={handleSaveQuotas} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-xs font-semibold text-ink-secondary block mb-1">
              Requests Per Minute (RPM)
            </label>
            <input
              type="number"
              min="1"
              value={rpm}
              onChange={(e) => setRpm(Number(e.target.value))}
              className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-xs font-mono font-bold text-ink focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-secondary block mb-1">
              Input Tokens Per Minute (TPM)
            </label>
            <input
              type="number"
              min="1000"
              value={tpm}
              onChange={(e) => setTpm(Number(e.target.value))}
              className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-xs font-mono font-bold text-ink focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-secondary block mb-1">
              Requests Per Day (RPD)
            </label>
            <input
              type="number"
              min="10"
              value={rpd}
              onChange={(e) => setRpd(Number(e.target.value))}
              className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-xs font-mono font-bold text-ink focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <ButtonPrimary
              type="submit"
              disabled={isSavingQuota}
              className="w-full py-2 text-xs font-semibold"
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
            Projections include exam-setup call, observed retry rate ({summary.retry_rate_pct}%), and compare against your configured {rpm} RPM / {rpd} RPD limits.
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
                <div className="text-[11px] text-[#1aae39] mt-0.5 font-mono">
                  ${projections.batch_40.average_case.cost_usd.toFixed(4)} USD
                </div>
              </div>

              <div className="rounded-md bg-canvas-soft p-2.5 border border-hairline">
                <span className="text-[11px] text-ink-muted block mb-0.5">Conservative (P90)</span>
                <div className="font-mono font-bold text-ink text-xs">
                  {Math.round(projections.batch_40.conservative_case.total_tokens).toLocaleString()} tokens
                </div>
                <div className="text-[11px] text-[#dd5b00] mt-0.5 font-mono">
                  ${projections.batch_40.conservative_case.cost_usd.toFixed(4)} USD
                </div>
              </div>
            </div>

            <div className="rounded-md bg-canvas-soft p-2.5 border border-hairline text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-ink-muted">Pacing Time:</span>
                <span className="font-semibold text-ink">
                  {projections.batch_40.feasibility.min_pacing_minutes} min (delay: {projections.batch_40.feasibility.recommended_delay_sec}s)
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
              <div key={i} className="flex items-center gap-2 text-[11px] text-[#dd5b00] bg-[#fef4ea] border border-[#fed8b8] rounded-md p-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
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
                <div className="text-[11px] text-[#1aae39] mt-0.5 font-mono">
                  ${projections.batch_50.average_case.cost_usd.toFixed(4)} USD
                </div>
              </div>

              <div className="rounded-md bg-canvas-soft p-2.5 border border-hairline">
                <span className="text-[11px] text-ink-muted block mb-0.5">Conservative (P90)</span>
                <div className="font-mono font-bold text-ink text-xs">
                  {Math.round(projections.batch_50.conservative_case.total_tokens).toLocaleString()} tokens
                </div>
                <div className="text-[11px] text-[#dd5b00] mt-0.5 font-mono">
                  ${projections.batch_50.conservative_case.cost_usd.toFixed(4)} USD
                </div>
              </div>
            </div>

            <div className="rounded-md bg-canvas-soft p-2.5 border border-hairline text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-ink-muted">Pacing Time:</span>
                <span className="font-semibold text-ink">
                  {projections.batch_50.feasibility.min_pacing_minutes} min (delay: {projections.batch_50.feasibility.recommended_delay_sec}s)
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
              <div key={i} className="flex items-center gap-2 text-[11px] text-[#dd5b00] bg-[#fef4ea] border border-[#fed8b8] rounded-md p-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </FeatureCard>

      {/* 4. Live API Experiment Log Table */}
      <FeatureCard className="p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-hairline">
          <h3 className="text-sm font-bold text-ink flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#1aae39]" />
            Captured Gemini API Experiment Log ({recent_events.length} attempts)
          </h3>
          <span className="text-xs text-ink-muted">Multi-Key Load Balancing</span>
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
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-right">Est Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {recent_events.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-ink-muted">
                    No API attempts logged yet. Process a student paper or extract a rubric to see live entries.
                  </td>
                </tr>
              ) : (
                recent_events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-canvas-soft transition-colors">
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-muted">
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-2 font-medium text-ink">
                      <span className="rounded bg-canvas-soft border border-hairline px-1.5 py-0.5 text-[10px]">
                        {ev.request_purpose}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-primary">
                      <div>{ev.model_name}</div>
                      {ev.api_key_masked && (
                        <div className="text-[10px] text-ink-muted font-sans font-normal">{ev.api_key_masked}</div>
                      )}
                      {ev.is_mock === 1 && (
                        <span className="ml-1 text-[9px] text-[#dd5b00]">(mock)</span>
                      )}
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
                    <td className="px-3 py-2 text-right font-mono text-[#1aae39] font-semibold">
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
  );
}
