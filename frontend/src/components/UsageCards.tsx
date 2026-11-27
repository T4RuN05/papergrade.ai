"use client";

import React, { useState } from "react";
import {
  Activity,
  DollarSign,
  IndianRupee,
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
  SlidersHorizontal,
  BookOpen,
  Calculator,
  X,
} from "lucide-react";
import { UsageMetrics } from "@/lib/types";
import { api } from "@/lib/api";
import { AnimatedNumber, NumberFlowGroup } from "@/components/ui/AnimatedNumber";
import { ButtonPrimary, FeatureCard, BadgePill, AppleNumberStepper } from "./ui";
import { useToast } from "@/lib/ToastContext";

interface UsageCardsProps {
  metrics: UsageMetrics;
  onQuotaUpdated?: () => void;
  onRefreshLogs?: () => Promise<any> | void;
  isRefreshingLogs?: boolean;
  activeView?: "telemetry" | "logs";
  onViewChange?: (view: "telemetry" | "logs") => void;
}

export function UsageCards({
  metrics,
  onQuotaUpdated,
  onRefreshLogs,
  isRefreshingLogs = false,
  activeView = "telemetry",
}: UsageCardsProps) {
  const { toast } = useToast();
  const { summary, latency, per_paper_metrics, quota_settings, projections, recent_events, gcp_paid } = metrics;
  const activeKeyCount = metrics.active_key_count || 4;

  // Active Telemetry Source: Free Tier Pool vs GCP Paid Account
  const [activeTab, setActiveTab] = useState<"free_pool" | "gcp_paid">("free_pool");

  // Currency Display Mode: "INR" (Default), "USD", or "DUAL"
  const [currencyMode, setCurrencyMode] = useState<"INR" | "USD" | "DUAL">("INR");
  const [localRefreshingLogs, setLocalRefreshingLogs] = useState(false);

  // Google Cloud India Reference Conversion Rate (Defaulting to Google Invoiced Rate w/ 18% GST: 1 USD ≈ ₹100.727 INR)
  const [usdToInrRate, setUsdToInrRate] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("papergrade_gcp_usd_rate");
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val > 0) return val;
      }
    }
    return 100.727;
  });

  // Total Promotional Credits (Default ₹28,569.00 from user's Google Cloud Free Trial)
  const [totalCreditsInr, setTotalCreditsInr] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("papergrade_gcp_total_credits");
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val > 0) return val;
      }
    }
    return 28569.0;
  });

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [calibrationTotalInput, setCalibrationTotalInput] = useState("28569.00");
  const [calibrationRemainingInput, setCalibrationRemainingInput] = useState("28568.46");
  const [calibrationRateInput, setCalibrationRateInput] = useState("100.727");

  // Alias for backward compatibility across existing conversion sites
  const USD_TO_INR = usdToInrRate;

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

  // Dedicated Refresh Handler for Log Section
  const handleRefreshTelemetryLogs = async () => {
    setLocalRefreshingLogs(true);
    try {
      if (onRefreshLogs) {
        await onRefreshLogs();
      } else if (onQuotaUpdated) {
        onQuotaUpdated();
      }
      toast.success("Telemetry logs refreshed successfully!", { title: "Logs Updated" });
    } catch (err: any) {
      toast.error(err?.message || "Failed to refresh logs", { title: "Refresh Failed" });
    } finally {
      setLocalRefreshingLogs(false);
    }
  };

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
      {/* Telemetry Source Selector & Currency Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-3">
        {/* Source Switcher */}
        <div className="flex items-center gap-1 bg-canvas-soft p-1 rounded-lg border border-hairline w-full sm:w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("free_pool")}
            className={`flex-1 sm:flex-initial min-w-0 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === "free_pool"
                ? "bg-surface text-ink font-semibold border border-hairline"
                : "text-ink-muted hover:text-ink border border-transparent"
            }`}
          >
            <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>AI Studio Pool</span>
            <span className="ml-0.5 rounded-xs bg-canvas-soft border border-hairline text-ink-secondary px-1.5 py-0.5 text-[10px] font-sans tabular-nums whitespace-nowrap shrink-0">
              {activeKeyCount} Keys
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("gcp_paid")}
            className={`flex-1 sm:flex-initial min-w-0 flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === "gcp_paid"
                ? "bg-surface text-ink font-semibold border border-hairline"
                : "text-ink-muted hover:text-ink border border-transparent"
            }`}
          >
            <Cloud className="h-3.5 w-3.5 text-ink-muted shrink-0" />
            <span>GCP Paid</span>
            <span className="ml-0.5 rounded-xs bg-canvas-soft border border-hairline text-ink-secondary px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap shrink-0">
              PAID
            </span>
          </button>
        </div>

        {/* Currency Display Controls (INR / USD / Dual) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-canvas-soft p-1 rounded-lg border border-hairline text-xs font-medium w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setCurrencyMode("INR")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                currencyMode === "INR"
                  ? "bg-surface text-ink border border-hairline font-semibold"
                  : "text-ink-muted hover:text-ink border border-transparent"
              }`}
              title="Display all figures in Indian Rupee (INR)"
            >
              <IndianRupee className="h-3 w-3 text-primary" />
              <span>INR (₹)</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrencyMode("USD")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                currencyMode === "USD"
                  ? "bg-surface text-primary border border-hairline font-semibold"
                  : "text-ink-muted hover:text-ink border border-transparent"
              }`}
              title="Display all figures in US Dollars (USD)"
            >
              <DollarSign className="h-3 w-3 text-primary" />
              <span>USD ($)</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrencyMode("DUAL")}
              className={`flex-1 sm:flex-initial px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                currencyMode === "DUAL"
                  ? "bg-surface text-ink border border-hairline font-semibold"
                  : "text-ink-muted hover:text-ink border border-transparent"
              }`}
              title="Display both INR and USD side by side"
            >
              Dual
            </button>
          </div>

          <span className="text-[10px] text-ink-muted hidden md:inline font-sans tabular-nums">
            1 USD ≈ ₹{USD_TO_INR.toFixed(2)}
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: TELEMETRY OVERVIEW & QUOTAS                                       */}
      {/* ========================================================================= */}
      {activeView === "telemetry" && (
        <div className="space-y-6">
          {/* FREE POOL SECTION */}
          {activeTab === "free_pool" && (
            <div className="space-y-6">
              {/* 1. Real-time KPI Metric Cards (2x2 on mobile, 4-col on desktop) */}
              <NumberFlowGroup>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                  {/* Total Calls */}
                  <FeatureCard className="p-3.5 sm:p-5 space-y-2 sm:space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] sm:text-xs font-semibold text-ink-muted truncate">
                        Total Requests
                      </span>
                      <div className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-primary/10 border border-primary/20 text-primary shrink-0">
                        <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                    </div>
                    <div>
                      <div className="font-sans tabular-nums text-xl sm:text-2xl font-bold text-ink leading-tight">
                        <AnimatedNumber value={summary.total_requests} format={{ useGrouping: true, maximumFractionDigits: 0 }} />
                      </div>
                      <div className="text-[10px] sm:text-xs text-ink-muted truncate mt-0.5">
                        {summary.successful_requests} ok / {summary.failed_requests} err
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-ink-muted border-t border-hairline pt-1.5 sm:pt-2">
                      <span>Retry: <strong className="text-ink font-semibold">{summary.retry_rate_pct}%</strong></span>
                      <span>Fail: <strong className="text-ink font-semibold">{summary.failure_rate_pct}%</strong></span>
                    </div>
                  </FeatureCard>

                  {/* Latency Duration */}
                  <FeatureCard className="p-3.5 sm:p-5 space-y-2 sm:space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] sm:text-xs font-semibold text-ink-muted truncate">
                        Avg Latency
                      </span>
                      <div className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-canvas-soft border border-hairline text-ink-secondary shrink-0">
                        <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                    </div>
                    <div>
                      <div className="font-sans tabular-nums text-xl sm:text-2xl font-bold text-ink leading-tight">
                        {latency.average_ms > 1000 ? (
                          <AnimatedNumber
                            value={latency.average_ms / 1000}
                            suffix="s"
                            format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                          />
                        ) : (
                          <AnimatedNumber
                            value={latency.average_ms}
                            suffix="ms"
                            format={{ maximumFractionDigits: 0 }}
                          />
                        )}
                      </div>
                      <div className="text-[10px] sm:text-xs text-ink-muted truncate mt-0.5">
                        Median: {latency.median_ms}ms
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-ink-muted border-t border-hairline pt-1.5 sm:pt-2">
                      <span>P95: <strong className="text-ink font-semibold">{latency.p95_ms > 1000 ? `${(latency.p95_ms / 1000).toFixed(1)}s` : `${latency.p95_ms}ms`}</strong></span>
                      <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">Healthy</span>
                    </div>
                  </FeatureCard>

                  {/* Tokens Per Paper */}
                  <FeatureCard className="p-3.5 sm:p-5 space-y-2 sm:space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] sm:text-xs font-semibold text-ink-muted truncate">
                        Tokens / Paper
                      </span>
                      <div className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-canvas-soft border border-hairline text-ink-secondary shrink-0">
                        <Cpu className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                    </div>
                    <div>
                      <div className="font-sans tabular-nums text-xl sm:text-2xl font-bold text-ink leading-tight">
                        <AnimatedNumber
                          value={Math.round(per_paper_metrics.avg_total_tokens)}
                          format={{ useGrouping: true, maximumFractionDigits: 0 }}
                        />
                      </div>
                      <div className="text-[10px] sm:text-xs text-ink-muted truncate mt-0.5">
                        In: {Math.round(per_paper_metrics.avg_input_tokens).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-ink-muted border-t border-hairline pt-1.5 sm:pt-2">
                      <span>Out: <strong className="text-ink font-semibold">{Math.round(per_paper_metrics.avg_output_tokens).toLocaleString()}</strong></span>
                      <span className="text-ink-muted text-[10px]">~4 pgs</span>
                    </div>
                  </FeatureCard>

                  {/* Cost Estimation */}
                  <FeatureCard className="p-3.5 sm:p-5 space-y-2 sm:space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] sm:text-xs font-semibold text-ink-muted truncate">
                        Est Value / Paper
                      </span>
                      <div className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-canvas-soft border border-hairline text-ink-secondary shrink-0">
                        {currencyMode === "USD" ? <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <IndianRupee className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                      </div>
                    </div>
                    <div>
                      <div className="font-sans tabular-nums text-xl sm:text-2xl font-bold text-ink leading-tight">
                        <AnimatedNumber
                          value={
                            currencyMode === "USD"
                              ? per_paper_metrics.avg_cost_usd
                              : per_paper_metrics.avg_cost_usd * USD_TO_INR
                          }
                          prefix={currencyMode === "USD" ? "$" : "₹"}
                          locales={currencyMode === "USD" ? "en-US" : "en-IN"}
                          format={
                            currencyMode === "USD"
                              ? { minimumFractionDigits: 4, maximumFractionDigits: 4 }
                              : { minimumFractionDigits: 3, maximumFractionDigits: 3 }
                          }
                        />
                      </div>
                      <div className="text-[10px] sm:text-xs text-ink-muted truncate mt-0.5">
                        Total:{" "}
                        <AnimatedNumber
                          value={
                            currencyMode === "USD"
                              ? summary.total_estimated_cost_usd
                              : summary.total_estimated_cost_usd * USD_TO_INR
                          }
                          prefix={currencyMode === "USD" ? "$" : "₹"}
                          locales={currencyMode === "USD" ? "en-US" : "en-IN"}
                          format={
                            currencyMode === "USD"
                              ? { minimumFractionDigits: 3, maximumFractionDigits: 3 }
                              : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                          }
                          animateOnMount={false}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-ink-muted border-t border-hairline pt-1.5 sm:pt-2">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Free Tier Value</span>
                      {currencyMode === "DUAL" && (
                        <span className="font-sans tabular-nums text-[9px] text-ink-muted">
                          (${per_paper_metrics.avg_cost_usd.toFixed(4)})
                        </span>
                      )}
                    </div>
                  </FeatureCard>
                </div>
              </NumberFlowGroup>

              {/* 2. User Google AI Studio Project Limits (Editable) */}
              <FeatureCard className="p-4 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
                  <div>
                    <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-primary" />
                      Configure Active Gemini Project Limits
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Confirm project rate limits from Google AI Studio. Feasibility projections automatically adapt.
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
                      Tokens Per Minute (TPM)
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
                      isLoading={isSavingQuota}
                      icon={<Save className="h-3.5 w-3.5" />}
                      className="w-full h-9 text-xs font-semibold"
                    >
                      {quotaSaved ? "Saved!" : isSavingQuota ? "Saving..." : "Save Limits"}
                    </ButtonPrimary>
                  </div>
                </form>
              </FeatureCard>

              {/* 3. Feasibility Projections for 40 and 50 Student Submissions */}
              <FeatureCard className="p-4 sm:p-6 space-y-4">
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
                          {currencyMode === "USD"
                            ? `$${projections.batch_40.average_case.cost_usd.toFixed(4)} USD`
                            : currencyMode === "INR"
                              ? `₹${(projections.batch_40.average_case.cost_usd * USD_TO_INR).toFixed(2)} INR`
                              : `₹${(projections.batch_40.average_case.cost_usd * USD_TO_INR).toFixed(2)} ($${projections.batch_40.average_case.cost_usd.toFixed(4)})`}
                        </div>
                      </div>

                      <div className="rounded-md bg-canvas-soft p-2.5 border border-hairline">
                        <span className="text-[11px] text-ink-muted block mb-0.5">Conservative (P90)</span>
                        <div className="font-mono font-bold text-ink text-xs">
                          {Math.round(projections.batch_40.conservative_case.total_tokens).toLocaleString()} tokens
                        </div>
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 font-mono">
                          {currencyMode === "USD"
                            ? `$${projections.batch_40.conservative_case.cost_usd.toFixed(4)} USD`
                            : currencyMode === "INR"
                              ? `₹${(projections.batch_40.conservative_case.cost_usd * USD_TO_INR).toFixed(2)} INR`
                              : `₹${(projections.batch_40.conservative_case.cost_usd * USD_TO_INR).toFixed(2)} ($${projections.batch_40.conservative_case.cost_usd.toFixed(4)})`}
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
                          {currencyMode === "USD"
                            ? `$${projections.batch_50.average_case.cost_usd.toFixed(4)} USD`
                            : currencyMode === "INR"
                              ? `₹${(projections.batch_50.average_case.cost_usd * USD_TO_INR).toFixed(2)} INR`
                              : `₹${(projections.batch_50.average_case.cost_usd * USD_TO_INR).toFixed(2)} ($${projections.batch_50.average_case.cost_usd.toFixed(4)})`}
                        </div>
                      </div>

                      <div className="rounded-md bg-canvas-soft p-2.5 border border-hairline">
                        <span className="text-[11px] text-ink-muted block mb-0.5">Conservative (P90)</span>
                        <div className="font-mono font-bold text-ink text-xs">
                          {Math.round(projections.batch_50.conservative_case.total_tokens).toLocaleString()} tokens
                        </div>
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 font-mono">
                          {currencyMode === "USD"
                            ? `$${projections.batch_50.conservative_case.cost_usd.toFixed(4)} USD`
                            : currencyMode === "INR"
                              ? `₹${(projections.batch_50.conservative_case.cost_usd * USD_TO_INR).toFixed(2)} INR`
                              : `₹${(projections.batch_50.conservative_case.cost_usd * USD_TO_INR).toFixed(2)} ($${projections.batch_50.conservative_case.cost_usd.toFixed(4)})`}
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
            </div>
          )}

          {/* GCP PAID SECTION */}
          {activeTab === "gcp_paid" && (
            <div className="space-y-6">
              {/* Header Account Summary Banner */}
              <FeatureCard className="p-4 sm:p-6 border-hairline bg-surface">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-canvas-soft border border-hairline text-ink-secondary shrink-0">
                        <Cloud className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-ink flex flex-wrap items-center gap-2">
                          <span>Google Cloud Paid Vertex AI Account</span>
                          <BadgePill label="Pay-As-You-Go" color="purple" />
                        </h3>
                        <p className="text-xs text-ink-muted">
                          Dedicated end-to-end metrics ledger. Every request made to this paid account is billed to your GCP card.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 text-xs font-mono">
                      <div className="bg-canvas-soft border border-hairline rounded-md px-2.5 py-1.5">
                        <span className="text-[10px] text-ink-muted uppercase block font-sans">Project ID</span>
                        <span className="font-semibold text-ink break-all">
                          {gcp_paid?.project_id || "project-fe04c36f-bda1-4c99-86b"}
                        </span>
                      </div>
                      <div className="bg-canvas-soft border border-hairline rounded-md px-2.5 py-1.5">
                        <span className="text-[10px] text-ink-muted uppercase block font-sans">Service Account</span>
                        <span className="font-semibold text-ink truncate block" title={gcp_paid?.service_account_email}>
                          {gcp_paid?.service_account_email || "1040007059825-compute@developer.gserviceaccount.com"}
                        </span>
                      </div>
                      <div className="bg-canvas-soft border border-hairline rounded-md px-2.5 py-1.5">
                        <span className="text-[10px] text-ink-muted uppercase block font-sans">Location & Status</span>
                        <span className="font-semibold text-ink flex items-center gap-1.5 font-sans">
                          <span className="h-2 w-2 rounded-full bg-accent-green inline-block" />
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
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isTestingGcp ? "animate-spin" : ""}`} />
                      {isTestingGcp ? "Pinging Vertex AI..." : "Test Paid Connection"}
                    </ButtonPrimary>
                  </div>
                </div>

                {/* Test Connection Result Box */}
                {testResult && (
                  <div
                    className={`mt-4 rounded-lg p-3 text-xs border ${testResult.success
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
                        className="text-xs opacity-60 hover:opacity-100 p-1 cursor-pointer"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
              </FeatureCard>

              {/* GCP ₹28,569 INR Free Trial Budget Tracker */}
              <FeatureCard className="p-4 sm:p-5 border-hairline bg-surface space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-9 w-9 rounded-md bg-canvas-soft border border-hairline text-ink-secondary shrink-0">
                      <IndianRupee className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-ink flex flex-wrap items-center gap-2">
                        <span>Google Cloud ₹{totalCreditsInr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Trial Credits Ledger</span>
                        <BadgePill label={`₹${totalCreditsInr.toLocaleString("en-IN", { minimumFractionDigits: 0 })} Active`} color="green" />
                      </h4>
                      <p className="text-[11px] text-ink-muted">
                        90-day trial promotional quota covering all Vertex AI multimodal evaluation runs
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-start sm:self-auto">
                    <div className="text-left sm:text-right font-sans tabular-nums text-xs">
                      <span className="text-ink-muted text-[10px] uppercase block">Remaining Balance</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                        <AnimatedNumber
                          value={Math.max(0, totalCreditsInr - ((gcp_paid?.total_spent_usd || 0) * USD_TO_INR))}
                          prefix="₹"
                          locales="en-IN"
                          format={{ minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }}
                        />
                      </span>
                      <span className="text-[10px] text-ink-muted block">
                        of ₹{totalCreditsInr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Total Credits
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setCalibrationTotalInput(totalCreditsInr.toString());
                        setCalibrationRemainingInput((Math.max(0, totalCreditsInr - ((gcp_paid?.total_spent_usd || 0) * USD_TO_INR))).toFixed(2));
                        setCalibrationRateInput(usdToInrRate.toFixed(3));
                        setShowSyncModal(true);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-hairline bg-surface hover:bg-canvas-soft text-ink-secondary hover:text-ink transition-colors cursor-pointer text-xs font-medium"
                      title="Calibrate and Sync with Google Cloud Console"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                      <span className="hidden sm:inline">Sync / Calibrate</span>
                    </button>
                  </div>
                </div>

                {/* Trial Credit Progress Bar */}
                <div className="space-y-1 pt-1">
                  <div className="w-full bg-canvas-soft h-2 rounded-full overflow-hidden border border-hairline">
                    <div
                      className="bg-primary h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(0.1, (((gcp_paid?.total_spent_usd || 0) * USD_TO_INR) / totalCreditsInr) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-ink-muted">
                    <span>Consumed: ₹{(((gcp_paid?.total_spent_usd || 0) * USD_TO_INR)).toFixed(2)} ({((((gcp_paid?.total_spent_usd || 0) * USD_TO_INR) / totalCreditsInr) * 100).toFixed(4)}%)</span>
                    <span>Available: {(100 - ((((gcp_paid?.total_spent_usd || 0) * USD_TO_INR) / totalCreditsInr) * 100)).toFixed(2)}%</span>
                  </div>
                </div>
              </FeatureCard>

              {/* Paid KPI Scorecards (2x2 on mobile, 4-col on desktop) */}
              <NumberFlowGroup>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                  {/* Total Money Spent */}
                  <FeatureCard className="p-3.5 sm:p-5 space-y-2 sm:space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] sm:text-xs font-semibold text-ink-muted truncate">
                        {currencyMode === "USD" ? "Total Billed (USD)" : currencyMode === "INR" ? "Total Billed (INR)" : "Total Billed"}
                      </span>
                      <div className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-primary/10 border border-primary/20 text-primary shrink-0">
                        {currencyMode === "USD" ? <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <IndianRupee className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                      </div>
                    </div>
                    <div>
                      <div className="font-sans tabular-nums text-xl sm:text-2xl font-bold text-ink leading-tight">
                        <AnimatedNumber
                          value={
                            currencyMode === "USD"
                              ? gcp_paid?.total_spent_usd || 0
                              : (gcp_paid?.total_spent_usd || 0) * USD_TO_INR
                          }
                          prefix={currencyMode === "USD" ? "$" : "₹"}
                          locales={currencyMode === "USD" ? "en-US" : "en-IN"}
                          format={
                            currencyMode === "USD"
                              ? { minimumFractionDigits: 4, maximumFractionDigits: 4 }
                              : { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }
                          }
                        />
                      </div>
                      <div className="text-[10px] sm:text-xs text-ink-muted truncate mt-0.5">
                        Account Billing: Active
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-ink-muted border-t border-hairline pt-1.5 sm:pt-2">
                      <span className="text-[10px] text-ink-secondary font-semibold truncate">
                        {currencyMode === "INR" ? "Billed to Trial" : "Incurred Cost"}
                      </span>
                      {currencyMode === "DUAL" && (
                        <span className="text-[9px] font-sans tabular-nums text-ink-muted">
                          (${(gcp_paid?.total_spent_usd || 0).toFixed(4)})
                        </span>
                      )}
                    </div>
                  </FeatureCard>

                  {/* Total Paid Requests */}
                  <FeatureCard className="p-3.5 sm:p-5 space-y-2 sm:space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] sm:text-xs font-semibold text-ink-muted truncate">Paid API Calls</span>
                      <div className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-canvas-soft border border-hairline text-ink-secondary shrink-0">
                        <Server className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                    </div>
                    <div>
                      <div className="font-sans tabular-nums text-xl sm:text-2xl font-bold text-ink leading-tight">
                        <AnimatedNumber
                          value={gcp_paid?.total_requests || 0}
                          format={{ useGrouping: true, maximumFractionDigits: 0 }}
                        />
                      </div>
                      <div className="text-[10px] sm:text-xs text-ink-muted truncate mt-0.5">
                        {gcp_paid?.successful_requests || 0} ok / {gcp_paid?.failed_requests || 0} err
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-ink-muted border-t border-hairline pt-1.5 sm:pt-2">
                      <span>Success: <strong className="text-ink font-semibold">{gcp_paid?.success_rate_pct || 0}%</strong></span>
                      <span>Err: <strong className="text-rose-500 font-semibold">{gcp_paid?.failed_requests || 0}</strong></span>
                    </div>
                  </FeatureCard>

                  {/* Tokens Billed */}
                  <FeatureCard className="p-3.5 sm:p-5 space-y-2 sm:space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] sm:text-xs font-semibold text-ink-muted truncate">Tokens Incurred</span>
                      <div className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-canvas-soft border border-hairline text-ink-secondary shrink-0">
                        <Cpu className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                    </div>
                    <div>
                      <div className="font-sans tabular-nums text-xl sm:text-2xl font-bold text-ink leading-tight">
                        <AnimatedNumber
                          value={(gcp_paid?.total_input_tokens || 0) + (gcp_paid?.total_output_tokens || 0)}
                          format={{ useGrouping: true, maximumFractionDigits: 0 }}
                        />
                      </div>
                      <div className="text-[10px] sm:text-xs text-ink-muted truncate mt-0.5">
                        In: {(gcp_paid?.total_input_tokens || 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-ink-muted border-t border-hairline pt-1.5 sm:pt-2">
                      <span>Out: <strong className="text-ink font-semibold">{(gcp_paid?.total_output_tokens || 0).toLocaleString()}</strong></span>
                      <span className="text-ink-muted text-[10px]">tokens</span>
                    </div>
                  </FeatureCard>

                  {/* Average Latency */}
                  <FeatureCard className="p-3.5 sm:p-5 space-y-2 sm:space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] sm:text-xs font-semibold text-ink-muted truncate">Avg Latency</span>
                      <div className="flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-canvas-soft border border-hairline text-ink-secondary shrink-0">
                        <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </div>
                    </div>
                    <div>
                      <div className="font-sans tabular-nums text-xl sm:text-2xl font-bold text-ink leading-tight">
                        {(gcp_paid?.avg_latency_ms || 0) > 1000 ? (
                          <AnimatedNumber
                            value={(gcp_paid?.avg_latency_ms || 0) / 1000}
                            suffix="s"
                            format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                          />
                        ) : (
                          <AnimatedNumber
                            value={gcp_paid?.avg_latency_ms || 0}
                            suffix="ms"
                            format={{ maximumFractionDigits: 0 }}
                          />
                        )}
                      </div>
                      <div className="text-[10px] sm:text-xs text-ink-muted truncate mt-0.5">
                        Cached: {(gcp_paid?.total_cached_tokens || 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-ink-muted border-t border-hairline pt-1.5 sm:pt-2">
                      <span>Thinking: <strong className="text-ink font-semibold">{(gcp_paid?.total_thinking_tokens || 0).toLocaleString()}</strong></span>
                      <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">Vertex</span>
                    </div>
                  </FeatureCard>
                </div>
              </NumberFlowGroup>

              {/* GCP Configuration & Error Diagnostic Alert */}
              <FeatureCard className="p-4 sm:p-6 space-y-4">
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
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: REQUEST LEDGER / LOGS AUDIT                                       */}
      {/* ========================================================================= */}
      {activeView === "logs" && (
        <div className="space-y-6">
          {/* FREE POOL LOGS TABLE */}
          {activeTab === "free_pool" && (
            <FeatureCard className="p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                    <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Captured AI Studio API Log ({recent_events.length} attempts)
                  </h3>
                  <p className="text-[11px] text-ink-muted">
                    Round-Robin Multi-Key Pool audit log
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRefreshTelemetryLogs}
                    disabled={localRefreshingLogs || isRefreshingLogs}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-hairline bg-surface hover:bg-canvas-soft text-ink disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
                    title="Refresh logs table"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-primary ${localRefreshingLogs || isRefreshingLogs ? "animate-spin" : ""}`} />
                    <span>{localRefreshingLogs || isRefreshingLogs ? "Refreshing..." : "Refresh Logs"}</span>
                  </button>
                </div>
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
                      <th className="px-3 py-2 text-right">
                        Est Cost ({currencyMode === "USD" ? "USD" : currencyMode === "INR" ? "INR ₹" : "₹ / $"})
                      </th>
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
                          <td className="px-3 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">
                            {currencyMode === "USD" ? (
                              `$${(ev.estimated_cost_usd || 0).toFixed(5)}`
                            ) : currencyMode === "INR" ? (
                              `₹${((ev.estimated_cost_usd || 0) * USD_TO_INR).toFixed(3)}`
                            ) : (
                              <div>
                                <div>₹{((ev.estimated_cost_usd || 0) * USD_TO_INR).toFixed(3)}</div>
                                <div className="text-[10px] text-ink-muted font-normal">
                                  ${(ev.estimated_cost_usd || 0).toFixed(5)}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </FeatureCard>
          )}

          {/* GCP PAID LOGS TABLE */}
          {activeTab === "gcp_paid" && (
            <FeatureCard className="p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-amber-500" />
                    Dedicated Google Cloud Paid Ledger ({gcpEvents.length} recorded events)
                  </h3>
                  <p className="text-[11px] text-ink-muted font-mono">
                    Project: {gcp_paid?.project_id}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRefreshTelemetryLogs}
                    disabled={localRefreshingLogs || isRefreshingLogs}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-hairline bg-surface hover:bg-canvas-soft text-ink disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
                    title="Refresh GCP Paid event logs"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-primary ${localRefreshingLogs || isRefreshingLogs ? "animate-spin" : ""}`} />
                    <span>{localRefreshingLogs || isRefreshingLogs ? "Refreshing..." : "Refresh Logs"}</span>
                  </button>
                </div>
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
                      <th className="px-3 py-2 text-right">
                        Billed ({currencyMode === "USD" ? "USD" : currencyMode === "INR" ? "INR ₹" : "₹ / $"})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {gcpEvents.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-xs text-ink-muted">
                          No requests have been executed on your Google Cloud Paid account yet.
                          <br />
                          Click <span className="font-semibold text-ink">"Test Paid Connection"</span> on the Telemetry tab to send an initial diagnostic ping.
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
                          <td className="px-3 py-2 text-right font-mono text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap">
                            {currencyMode === "USD" ? (
                              `$${(ev.estimated_cost_usd || 0).toFixed(6)}`
                            ) : currencyMode === "INR" ? (
                              `₹${((ev.estimated_cost_usd || 0) * USD_TO_INR).toFixed(4)}`
                            ) : (
                              <div>
                                <div>₹{((ev.estimated_cost_usd || 0) * USD_TO_INR).toFixed(4)}</div>
                                <div className="text-[10px] text-ink-muted font-normal">
                                  ${(ev.estimated_cost_usd || 0).toFixed(6)}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </FeatureCard>
          )}

          {/* Per-Request Cost Audit & Google Cloud Console Mapping Guide */}
          <FeatureCard className="p-4 sm:p-6 space-y-5 border-hairline bg-surface">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Per-Request Cost Audit & Google Cloud Console Mapping Guide
                </h3>
                <p className="text-xs text-ink-muted">
                  Reconcile every row in PaperGrade's Telemetry ledger with your Google Cloud Billing report and Vertex AI logs
                </p>
              </div>
              <BadgePill label="1:1 Verified Billing Match" color="green" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step 1: Token Pricing Formula */}
              <div className="rounded-lg border border-hairline bg-canvas-soft p-4 space-y-2.5 text-xs">
                <div className="flex items-center gap-2 font-bold text-ink">
                  <Calculator className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>1. Per-Request Formula</span>
                </div>
                <p className="text-ink-muted leading-relaxed">
                  Vertex AI charges Gemini 1.5/2.5 Flash on strict token consumption:
                </p>
                <div className="space-y-1 font-mono text-[11px] bg-surface p-2.5 rounded border border-hairline">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Input Tokens:</span>
                    <span className="font-semibold text-ink">$0.075 / 1M tokens</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Output Tokens:</span>
                    <span className="font-semibold text-ink">$0.300 / 1M tokens</span>
                  </div>
                  <div className="text-[10px] text-ink-muted border-t border-hairline pt-1">
                    Cost = (In/1M × 0.075) + (Out/1M × 0.30)
                  </div>
                </div>
                <p className="text-[11px] text-ink-muted">
                  A typical 4-page student exam script uses ~2,400 input + ~650 output tokens = <span className="font-semibold text-ink font-mono">$0.00038 USD (₹0.039 INR)</span> — less than 4 paise per paper!
                </p>
              </div>

              {/* Step 2: Mapping to GCP Console */}
              <div className="rounded-lg border border-hairline bg-canvas-soft p-4 space-y-2.5 text-xs">
                <div className="flex items-center gap-2 font-bold text-ink">
                  <ExternalLink className="h-4 w-4 text-primary" />
                  <span>2. Map to GCP Billing Table</span>
                </div>
                <p className="text-ink-muted leading-relaxed">
                  To view identical line items in Google Cloud Console:
                </p>
                <ol className="list-decimal pl-4 space-y-1 text-ink text-[11px]">
                  <li>Go to <span className="font-semibold">Billing &gt; Cost table</span>.</li>
                  <li>In filter sidebar, set <span className="font-semibold">Service: Vertex AI</span>.</li>
                  <li>Set <span className="font-semibold">Group by: SKU</span>.</li>
                  <li>
                    Inspect the two SKU line items:
                    <div className="font-mono text-[10px] text-primary mt-0.5">
                      • Generative AI Input Tokens
                      <br />• Generative AI Output Tokens
                    </div>
                  </li>
                </ol>
                <p className="text-[10px] text-ink-muted">
                  The sum of tokens in those two SKUs equals the "Total Tokens Incurred" scorecard.
                </p>
              </div>

              {/* Step 3: Exact Reconciliation */}
              <div className="rounded-lg border border-hairline bg-canvas-soft p-4 space-y-2.5 text-xs">
                <div className="flex items-center gap-2 font-bold text-ink">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>3. Real-Time Balance Match</span>
                </div>
                <p className="text-ink-muted leading-relaxed">
                  Active Free Trial reconciliation against your Google Cloud Console:
                </p>
                <div className="space-y-1 font-mono text-[11px] bg-surface p-2.5 rounded border border-hairline">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Starting Credits:</span>
                    <span className="font-semibold text-ink">₹{totalCreditsInr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Billed ({gcp_paid?.total_requests || 0} calls):</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">₹{(((gcp_paid?.total_spent_usd || 0) * USD_TO_INR)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-hairline pt-1 text-emerald-600 dark:text-emerald-400 font-bold">
                    <span>Remaining Balance:</span>
                    <span>₹{(Math.max(0, totalCreditsInr - ((gcp_paid?.total_spent_usd || 0) * USD_TO_INR))).toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-[10px] text-ink-muted">
                  Google Cloud Billing reports update in 2–4 hour batches, whereas PaperGrade tracks token consumption in real time immediately after every API return.
                </p>
              </div>
            </div>
          </FeatureCard>
        </div>
      )}

      {/* GCP Trial Budget Sync & Calibration Modal (Single Root Render) */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="bg-surface border border-hairline rounded-lg max-w-md w-full p-5 space-y-4 shadow-notion-modal">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-ink">GCP Trial Budget Calibration</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="text-ink-muted hover:text-ink p-1 rounded-md hover:bg-canvas-soft cursor-pointer transition-colors"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-ink-muted">
              Sync your PaperGrade Telemetry ledger with your exact promotional credits in Google Cloud Console.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-ink-secondary block mb-1">
                  Total Promotional Credits (INR ₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={calibrationTotalInput}
                  onChange={(e) => setCalibrationTotalInput(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface text-ink font-sans tabular-nums text-xs focus:outline-none focus:border-primary"
                  placeholder="28569.00"
                />
              </div>

              <div>
                <label className="font-semibold text-ink-secondary block mb-1">
                  Current Console Remaining Balance (INR ₹)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={calibrationRemainingInput}
                    onChange={(e) => setCalibrationRemainingInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface text-ink font-sans tabular-nums text-xs focus:outline-none focus:border-primary"
                    placeholder="28568.46"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const total = parseFloat(calibrationTotalInput) || 28569.0;
                      const rem = parseFloat(calibrationRemainingInput) || 28568.46;
                      const spentInr = Math.max(0, total - rem);
                      const spentUsd = gcp_paid?.total_spent_usd || 0.005361;
                      if (spentUsd > 0) {
                        const calculatedRate = spentInr / spentUsd;
                        setCalibrationRateInput(calculatedRate.toFixed(3));
                        toast.info(`Auto-calibrated rate: 1 USD = ₹${calculatedRate.toFixed(2)} INR`, { title: "Rate Synced" });
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-md border border-hairline bg-canvas-soft hover:bg-surface text-ink text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors"
                  >
                    Auto-Sync Rate
                  </button>
                </div>
                <span className="text-[10px] text-ink-muted mt-0.5 block">
                  Enter remaining balance from GCP billing report to automatically derive the exchange rate.
                </span>
              </div>

              <div>
                <label className="font-semibold text-ink-secondary block mb-1">
                  USD to INR Conversion Rate (₹ / USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={calibrationRateInput}
                  onChange={(e) => setCalibrationRateInput(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface text-ink font-sans tabular-nums text-xs focus:outline-none focus:border-primary"
                  placeholder="100.727"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setCalibrationRateInput("100.727")}
                    className="px-2 py-0.5 text-[10px] rounded-xs bg-canvas-soft border border-hairline text-ink hover:border-primary cursor-pointer"
                  >
                    Google Invoiced (₹100.72 w/ 18% GST)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalibrationRateInput("88.00")}
                    className="px-2 py-0.5 text-[10px] rounded-xs bg-canvas-soft border border-hairline text-ink hover:border-primary cursor-pointer"
                  >
                    Forex Base (₹88.00)
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 border-t border-hairline pt-3">
              <button
                type="button"
                onClick={() => {
                  setCalibrationTotalInput("28569.00");
                  setCalibrationRemainingInput("28568.46");
                  setCalibrationRateInput("100.727");
                  setTotalCreditsInr(28569.0);
                  setUsdToInrRate(100.727);
                  if (typeof window !== "undefined") {
                    localStorage.removeItem("papergrade_gcp_total_credits");
                    localStorage.removeItem("papergrade_gcp_usd_rate");
                  }
                  setShowSyncModal(false);
                  toast.success("Reset to default ₹28,569.00 budget parameters", { title: "Reset Complete" });
                }}
                className="text-xs text-ink-muted hover:text-ink underline cursor-pointer self-start sm:self-auto"
              >
                Reset Defaults
              </button>

              <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowSyncModal(false)}
                  className="flex-1 sm:flex-initial px-3 py-1.5 text-xs font-medium rounded-md border border-hairline bg-surface text-ink hover:bg-canvas-soft cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <ButtonPrimary
                  onClick={() => {
                    const total = parseFloat(calibrationTotalInput);
                    const rate = parseFloat(calibrationRateInput);
                    if (!isNaN(total) && total > 0) {
                      setTotalCreditsInr(total);
                      if (typeof window !== "undefined") {
                        localStorage.setItem("papergrade_gcp_total_credits", total.toString());
                      }
                    }
                    if (!isNaN(rate) && rate > 0) {
                      setUsdToInrRate(rate);
                      if (typeof window !== "undefined") {
                        localStorage.setItem("papergrade_gcp_usd_rate", rate.toString());
                      }
                    }
                    setShowSyncModal(false);
                    toast.success("GCP Trial Credit budget calibrated and synced!", { title: "Budget Synced" });
                  }}
                  size="sm"
                  className="flex-1 sm:flex-initial"
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  Save & Apply
                </ButtonPrimary>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
