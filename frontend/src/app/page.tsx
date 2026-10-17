"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Clock,
  Building2,
  Users,
  GraduationCap,
  RotateCcw,
  Cpu,
  Layers,
  FileCheck2,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  BarChart3,
  FileText,
  Upload,
  Eye,
  AlertCircle,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { api, getAuthToken, getStoredUser } from "@/lib/api";
import {
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
} from "@/components/ui";

export default function LandingPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isRedirectingStudent, setIsRedirectingStudent] = useState(false);
  const [activeDemoTab, setActiveDemoTab] = useState<"ai_grading" | "window_timing" | "tenancy" | "revaluation">("ai_grading");

  useEffect(() => {
    const token = getAuthToken();
    const storedUser = getStoredUser();

    // Instant redirect if student is already logged in
    if (token && storedUser?.role === "STUDENT") {
      setIsRedirectingStudent(true);
      router.replace("/student/portal");
      return;
    }

    if (token) {
      api
        .getMe()
        .then((user) => {
          setCurrentUser(user);
          if (user?.role === "STUDENT") {
            setIsRedirectingStudent(true);
            router.replace("/student/portal");
          }
        })
        .catch(() => setCurrentUser(null));
    }
  }, [router]);

  if (isRedirectingStudent) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-5 animate-in fade-in duration-300">
        <div className="relative group">
          <div className="absolute -inset-3 rounded-3xl bg-gradient-to-r from-primary/20 via-indigo-500/15 to-purple-500/20 blur-2xl opacity-75 animate-pulse" />
          <Image
            src="/landing-logo.png"
            alt="PaperGrade AI"
            width={280}
            height={280}
            className="relative w-48 h-48 sm:w-60 sm:h-60 md:w-72 md:h-72 object-contain drop-shadow-md"
            priority
          />
        </div>
        <div className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-ink-secondary">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Opening Student Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 sm:space-y-16 max-w-6xl mx-auto pb-20 pt-2 sm:pt-4 px-3.5 sm:px-6 lg:px-8">
      {/* 1. HERO SECTION */}
      <section className="text-center space-y-4 sm:space-y-6 pt-4 sm:pt-8 max-w-4xl mx-auto">
        {/* Landing Page Official Logo Spotlight */}
        <div className="flex justify-center pb-1">
          <div className="relative group">
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-primary/20 via-indigo-500/15 to-purple-500/20 blur-xl opacity-70 group-hover:opacity-100 transition duration-500" />
            <Image
              src="/landing-logo.png"
              alt="PaperGrade AI"
              width={240}
              height={240}
              priority
              className="relative w-36 h-36 sm:w-48 sm:h-48 md:w-56 md:h-56 object-contain drop-shadow-sm hover:scale-[1.02] transition-transform duration-300"
            />
          </div>
        </div>

        {/* Release / Announcement Badge */}
        <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-primary/10 border border-primary/20 text-[11px] sm:text-xs font-semibold text-primary animate-in fade-in slide-in-from-top-2 duration-500 max-w-full">
          <Sparkles className="h-3.5 w-3.5 animate-pulse shrink-0" />
          <span className="truncate">PaperGrade AI Enterprise</span>
          <span className="hidden sm:inline text-ink-muted">•</span>
          <span className="hidden sm:inline text-ink-secondary font-normal">Cloudinary & Supabase Connected</span>
        </div>

        {/* Hero Headline */}
        <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-ink tracking-tight leading-[1.18] sm:leading-[1.12]">
          Grade Handwritten Answer Sheets in Seconds.{" "}
          <span className="bg-gradient-to-r from-primary via-indigo-600 to-purple-600 bg-clip-text text-transparent">
            With Zero AI Hallucination.
          </span>
        </h1>

        {/* Hero Subtitle */}
        <p className="text-xs sm:text-base md:text-lg text-ink-secondary max-w-2xl mx-auto leading-relaxed px-1">
          The high-integrity evaluation engine for competitive coaching institutes and universities. Built with Gemini 3.8 Flash multimodal reasoning, server-enforced 30-minute exam windows, and 100% human-verified manual revaluation.
        </p>

        {/* Interactive Dynamic Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-4 w-full sm:w-auto max-w-sm sm:max-w-none mx-auto">
          {currentUser ? (
            currentUser.role === "ROOT_ADMIN" ? (
              <>
                <ButtonPrimary href="/overview" size="lg" className="shadow-md w-full sm:w-auto justify-center text-center">
                  <Layers className="h-4 w-4 mr-2 shrink-0" />
                  <span>Open Root Admin Console →</span>
                </ButtonPrimary>
                <ButtonUtility href="/admin/tenancy" className="py-2.5 sm:py-3 px-4 sm:px-5 text-xs sm:text-sm font-semibold w-full sm:w-auto justify-center text-center">
                  <Building2 className="h-4 w-4 mr-2 text-primary shrink-0" />
                  <span>Institutes & Branches</span>
                </ButtonUtility>
              </>
            ) : currentUser.role === "BRANCH_MANAGER" ? (
              <ButtonPrimary href="/branch/batches" size="lg" className="w-full sm:w-auto justify-center text-center">
                <Users className="h-4 w-4 mr-2 shrink-0" />
                <span>Manage Branch Batches & Windows →</span>
              </ButtonPrimary>
            ) : (
              <ButtonPrimary href="/student/portal" size="lg" className="w-full sm:w-auto justify-center text-center">
                <Clock className="h-4 w-4 mr-2 shrink-0" />
                <span>Open Student Exam Portal PWA →</span>
              </ButtonPrimary>
            )
          ) : (
            <>
              <ButtonPrimary href="/auth/login" size="lg" className="shadow-md w-full sm:w-auto justify-center text-center">
                <ShieldCheck className="h-4 w-4 mr-2 shrink-0" />
                <span>Launch Admin Console</span>
              </ButtonPrimary>
              <ButtonUtility href="/student/portal" className="py-2.5 sm:py-3 px-4 sm:px-5 text-xs sm:text-sm font-semibold w-full sm:w-auto justify-center text-center">
                <Clock className="h-4 w-4 mr-2 text-primary shrink-0" />
                <span>Student Exam Portal →</span>
              </ButtonUtility>
              <ButtonUtility href="/auth/claim" className="py-2.5 sm:py-3 px-4 sm:px-5 text-xs sm:text-sm font-semibold w-full sm:w-auto justify-center text-center">
                <span>Claim Student ID →</span>
              </ButtonUtility>
            </>
          )}
        </div>

        {/* Trust & Spec Micro-Tags */}
        <div className="pt-2 sm:pt-4 flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 gap-y-1.5 text-[11px] sm:text-xs text-ink-muted">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#1aae39] shrink-0" />
            <span>4-Key Gemini Load Balancer</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#1aae39] shrink-0" />
            <span>30-Min Anti-Tamper Window</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#1aae39] shrink-0" />
            <span>Multi-Tenant Campus Isolation</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#1aae39] shrink-0" />
            <span>Cloudinary Zero-Egress Storage</span>
          </div>
        </div>
      </section>

      {/* 2. INTERACTIVE PRODUCT WORKBENCH SIMULATION */}
      <section className="space-y-3.5 sm:space-y-4">
        <div className="text-center space-y-1">
          <BadgePill label="Interactive Experience" color="teal" />
          <h2 className="text-xl sm:text-2xl font-bold text-ink">How PaperGrade AI Operates</h2>
          <p className="text-xs sm:text-sm text-ink-muted">
            Tap through the workflow tabs below to inspect how answers are evaluated, timed, and protected.
          </p>
        </div>

        {/* Workbench Card */}
        <div className="rounded-xl border border-hairline bg-surface shadow-notion-card overflow-hidden">
          {/* Tabs bar */}
          <div className="flex items-center gap-1 border-b border-hairline bg-canvas-soft/80 p-1.5 sm:p-2 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveDemoTab("ai_grading")}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap cursor-pointer ${
                activeDemoTab === "ai_grading"
                  ? "bg-surface text-primary shadow-xs border border-hairline"
                  : "text-ink-muted hover:text-ink hover:bg-surface/50"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>1. AI Grading</span>
            </button>

            <button
              onClick={() => setActiveDemoTab("window_timing")}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap cursor-pointer ${
                activeDemoTab === "window_timing"
                  ? "bg-surface text-primary shadow-xs border border-hairline"
                  : "text-ink-muted hover:text-ink hover:bg-surface/50"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>2. 30-Min Window</span>
            </button>

            <button
              onClick={() => setActiveDemoTab("tenancy")}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap cursor-pointer ${
                activeDemoTab === "tenancy"
                  ? "bg-surface text-primary shadow-xs border border-hairline"
                  : "text-ink-muted hover:text-ink hover:bg-surface/50"
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>3. Campuses</span>
            </button>

            <button
              onClick={() => setActiveDemoTab("revaluation")}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap cursor-pointer ${
                activeDemoTab === "revaluation"
                  ? "bg-surface text-primary shadow-xs border border-hairline"
                  : "text-ink-muted hover:text-ink hover:bg-surface/50"
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>4. Revaluation</span>
            </button>
          </div>

          {/* Workbench Body Content */}
          <div className="p-3.5 sm:p-6 md:p-8">
            {activeDemoTab === "ai_grading" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-center">
                {/* Simulated Student Paper Box */}
                <div className="lg:col-span-5 rounded-lg border border-hairline bg-canvas-soft p-3 sm:p-4 space-y-2.5 sm:space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-hairline text-[10.5px] sm:text-[11px] text-ink-muted">
                    <span>Student: Karan Mehra</span>
                    <span className="text-[#1aae39] font-bold">Box #01</span>
                  </div>
                  <div className="p-2.5 sm:p-3 bg-surface rounded border border-dashed border-primary/40 space-y-1.5 sm:space-y-2">
                    <div className="text-[10px] text-primary uppercase font-bold tracking-wider">
                      Target Question: Q3 (Carnot Efficiency)
                    </div>
                    <div className="text-xs text-ink italic leading-relaxed font-serif">
                      &quot;η = 1 - (Q_c / Q_h) = 1 - (T_c / T_h)<br />
                      Given: T_h = 600 K, T_c = 300 K<br />
                      η = 1 - (300 / 600) = 0.50 (50% efficiency)&quot;
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10.5px] sm:text-[11px] text-ink-muted pt-1">
                    <span>Transcribed: 100% Match</span>
                    <BadgePill label="Confidence: 99.4%" color="green" />
                  </div>
                </div>

                {/* Simulated AI Decision Panel */}
                <div className="lg:col-span-7 space-y-3 sm:space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <BadgePill label="Q3 Evaluation Complete" color="purple" />
                      <span className="text-xs font-mono font-bold text-ink">5.0 / 5.0 Marks</span>
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-ink">Granular Criterion Breakdown</h3>
                    <p className="text-[11px] sm:text-xs text-ink-muted">
                      Evaluated against Instructor&apos;s Approved Rubric Version 1.
                    </p>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2 text-xs">
                    <div className="p-2 sm:p-2.5 rounded bg-surface border border-hairline flex items-center justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <span className="font-bold text-ink text-[11px] sm:text-xs block truncate">Criterion 1: Formula Statement</span>
                        <p className="text-[10px] sm:text-[11px] text-ink-muted">Student stated η = 1 - (T_c / T_h)</p>
                      </div>
                      <span className="font-bold text-[#1aae39] shrink-0 font-mono text-[11px] sm:text-xs">+2.0 / 2.0</span>
                    </div>

                    <div className="p-2 sm:p-2.5 rounded bg-surface border border-hairline flex items-center justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <span className="font-bold text-ink text-[11px] sm:text-xs block truncate">Criterion 2: Value Substitution</span>
                        <p className="text-[10px] sm:text-[11px] text-ink-muted">T_h = 600K and T_c = 300K substituted</p>
                      </div>
                      <span className="font-bold text-[#1aae39] shrink-0 font-mono text-[11px] sm:text-xs">+1.5 / 1.5</span>
                    </div>

                    <div className="p-2 sm:p-2.5 rounded bg-surface border border-hairline flex items-center justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <span className="font-bold text-ink text-[11px] sm:text-xs block truncate">Criterion 3: Efficiency Calculation</span>
                        <p className="text-[10px] sm:text-[11px] text-ink-muted">Calculated 50% efficiency with units</p>
                      </div>
                      <span className="font-bold text-[#1aae39] shrink-0 font-mono text-[11px] sm:text-xs">+1.5 / 1.5</span>
                    </div>
                  </div>

                  <div className="p-2.5 sm:p-3 rounded-md bg-[#f5eefc] border border-[#dfcbf6] text-[11px] sm:text-xs text-[#793caf] leading-relaxed">
                    <span className="font-bold">AI Rationale:</span> Full derivation followed standard thermodynamic conventions. Zero ambiguities detected. Box coordinates pinned to Page 1.
                  </div>
                </div>
              </div>
            )}

            {activeDemoTab === "window_timing" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-center">
                <div className="lg:col-span-5 rounded-lg border border-hairline bg-canvas-soft p-4 sm:p-5 text-center space-y-2 sm:space-y-3">
                  <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-[#fef4ea] text-[#dd5b00] flex items-center justify-center mx-auto">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div className="text-xl sm:text-2xl font-mono font-bold text-ink tracking-tight">
                    28:42 REMAINING
                  </div>
                  <BadgePill label="Live Submission Window" color="orange" />
                  <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
                    Server-enforced ticker with 2-minute latency grace period. Ingestion cuts off automatically.
                  </p>
                </div>

                <div className="lg:col-span-7 space-y-2.5 sm:space-y-3">
                  <h3 className="text-sm sm:text-base font-bold text-ink">Single-PDF Atomic Replacement</h3>
                  <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
                    Students upload their entire exam as one consolidated multi-page PDF. If a student resubmits before the window expires, the previous submission is atomically superseded and hashed via SHA-256 in Cloudinary.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pt-1 text-xs">
                    <div className="p-2.5 sm:p-3 rounded border border-hairline bg-surface space-y-1">
                      <div className="font-bold text-ink text-xs">Atomic Replacement</div>
                      <p className="text-[10.5px] sm:text-[11px] text-ink-muted">Zero partial-page drift or misplaced sheets.</p>
                    </div>
                    <div className="p-2.5 sm:p-3 rounded border border-hairline bg-surface space-y-1">
                      <div className="font-bold text-ink text-xs">Tamper-Proof Timestamps</div>
                      <p className="text-[10.5px] sm:text-[11px] text-ink-muted">Server UTC timestamps override client clock drift.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeDemoTab === "tenancy" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-center">
                <div className="lg:col-span-5 rounded-lg border border-hairline bg-canvas-soft p-3.5 sm:p-5 space-y-2.5 sm:space-y-3 text-xs">
                  <div className="font-bold text-ink flex items-center gap-1.5 pb-2 border-b border-hairline">
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <span>Campus Roster</span>
                  </div>
                  <div className="space-y-2 pl-2 sm:pl-3 border-l-2 border-primary">
                    <div className="bg-surface p-2 rounded border border-hairline">
                      <span className="font-bold text-ink block">Apex Engineering — Main Campus</span>
                      <span className="block text-[10.5px] sm:text-[11px] text-ink-muted">Mumbai Centre • Active Batches</span>
                    </div>
                    <div className="bg-surface p-2 rounded border border-hairline">
                      <span className="font-bold text-ink block">CATCH 25 — Borivali Branch</span>
                      <span className="block text-[10.5px] sm:text-[11px] text-ink-muted">Mumbai Centre • Active Batches</span>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-7 space-y-2.5 sm:space-y-3">
                  <h3 className="text-sm sm:text-base font-bold text-ink">Multi-Tenant Campus Isolation</h3>
                  <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
                    Root Admins provision coaching chains and independent physical branches. Branch Managers receive scoped RBAC access to manage rosters, batches, and live window triggers without crossing campus data boundaries.
                  </p>
                  <div className="pt-1 flex flex-wrap gap-2">
                    <ButtonUtility href="/admin/tenancy" size="sm">Open Tenancy Desk →</ButtonUtility>
                    <ButtonUtility href="/branch/batches" size="sm">View Batch Roster →</ButtonUtility>
                  </div>
                </div>
              </div>
            )}

            {activeDemoTab === "revaluation" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-center">
                <div className="lg:col-span-5 rounded-lg border border-hairline bg-canvas-soft p-3.5 sm:p-5 space-y-2.5 sm:space-y-3 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-hairline">
                    <span className="font-bold text-ink">Student Appeal #REV-402</span>
                    <BadgePill label="Manual Review" color="purple" />
                  </div>
                  <div className="bg-surface p-2.5 rounded border border-hairline space-y-1">
                    <span className="font-bold text-ink text-[11px]">Student Reason:</span>
                    <p className="text-[10.5px] sm:text-[11px] text-ink-muted italic">
                      &quot;I used an alternative formula for Carnot work output in Step 2.&quot;
                    </p>
                  </div>
                  <div className="bg-[#eaf7ed] p-2.5 rounded border border-[#c2ecd0] text-[10.5px] sm:text-[11px] text-[#1aae39] font-medium leading-relaxed">
                    Evaluator Adjusted: +1.5 Marks • Reason: Verified alternative thermodynamic identity
                  </div>
                </div>

                <div className="lg:col-span-7 space-y-2.5 sm:space-y-3">
                  <h3 className="text-sm sm:text-base font-bold text-ink">100% Human Verification Guarantee</h3>
                  <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
                    We strictly forbid AI re-evaluating itself on student grievances. Revaluation appeals are submitted within 7 calendar days of result publication and resolved exclusively by human examiners with immutable audit logs.
                  </p>
                  <div className="pt-1">
                    <ButtonUtility href="/revaluation" size="sm">Open Revaluation Desk →</ButtonUtility>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. SIX CORE ARCHITECTURAL PILLARS */}
      <section className="space-y-4 sm:space-y-6">
        <div className="text-center space-y-1">
          <BadgePill label="Enterprise Pillars" color="purple" />
          <h2 className="text-xl sm:text-2xl font-bold text-ink">Built for Examination Integrity</h2>
          <p className="text-xs sm:text-sm text-ink-muted max-w-xl mx-auto px-1">
            Every layer of the platform is designed to eliminate human grading bottlenecks while preserving absolute academic transparency.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
          <FeatureCard className="space-y-2.5 sm:space-y-3 p-4 sm:p-6">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-md bg-[#edf5fd] text-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-ink">Gemini 3.8 Flash Multimodal</h3>
            <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
              Understands cursive handwriting, diagrams, mathematical formulas, and student strikeouts with high OCR confidence.
            </p>
          </FeatureCard>

          <FeatureCard className="space-y-2.5 sm:space-y-3 p-4 sm:p-6">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-md bg-[#fef4ea] text-[#dd5b00] flex items-center justify-center">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-ink">30-Min Anti-Tamper Window</h3>
            <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
              Server-enforced countdown stops delayed uploads. Supports atomic replacement so students only ever have one valid canonical PDF.
            </p>
          </FeatureCard>

          <FeatureCard className="space-y-2.5 sm:space-y-3 p-4 sm:p-6">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-md bg-[#f5eefc] text-[#793caf] flex items-center justify-center">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-ink">Multi-Tenant Campus RBAC</h3>
            <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
              Institute-wide management. Assign branch managers to physical centres with localized batches, rosters, and schedules.
            </p>
          </FeatureCard>

          <FeatureCard className="space-y-2.5 sm:space-y-3 p-4 sm:p-6">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-md bg-[#e6f6f6] text-[#2a9d99] flex items-center justify-center">
              <FileCheck2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-ink">Locked Rubric Approval</h3>
            <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
              Instructors draft and lock official grading rubrics. AI cannot evaluate papers until rubrics are approved and frozen.
            </p>
          </FeatureCard>

          <FeatureCard className="space-y-2.5 sm:space-y-3 p-4 sm:p-6">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-md bg-[#eaf7ed] text-[#1aae39] flex items-center justify-center">
              <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-ink">Strict Human Revaluation</h3>
            <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
              Grievances are human-verified within a 7-day window. Eliminates recursive model hallucination during student disputes.
            </p>
          </FeatureCard>

          <FeatureCard className="space-y-2.5 sm:space-y-3 p-4 sm:p-6">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-md bg-[#f1f1ef] text-[#615d59] flex items-center justify-center">
              <Cpu className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-ink">Tiered Quota Balancing</h3>
            <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
              Round-robin rotation across 4 API keys with 500 RPD fallback protection ensures zero downtime during high-volume batch evaluations.
            </p>
          </FeatureCard>
        </div>
      </section>

      {/* 4. END-TO-END PIPELINE WALKTHROUGH */}
      <section className="rounded-xl border border-hairline bg-surface p-4 sm:p-8 space-y-4 sm:space-y-6 shadow-notion-card">
        <div className="text-center space-y-1">
          <BadgePill label="Workflow Pipeline" color="sky" />
          <h2 className="text-lg sm:text-xl font-bold text-ink">5-Step Automated Grading Lifecycle</h2>
          <p className="text-xs text-ink-muted">
            From exam creation to official result publication.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 sm:gap-3 pt-2">
          <div className="p-3 sm:p-4 rounded-lg bg-canvas-soft border border-hairline space-y-1.5 sm:space-y-2">
            <span className="h-6 w-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">1</span>
            <div className="text-xs font-bold text-ink">Question Paper & Key</div>
            <p className="text-[11px] text-ink-muted">Instructor uploads question paper and answer key PDF.</p>
          </div>

          <div className="p-3 sm:p-4 rounded-lg bg-canvas-soft border border-hairline space-y-1.5 sm:space-y-2">
            <span className="h-6 w-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">2</span>
            <div className="text-xs font-bold text-ink">Rubric Approval</div>
            <p className="text-[11px] text-ink-muted">AI generates draft criteria; instructor reviews and locks rubric.</p>
          </div>

          <div className="p-3 sm:p-4 rounded-lg bg-canvas-soft border border-hairline space-y-1.5 sm:space-y-2">
            <span className="h-6 w-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">3</span>
            <div className="text-xs font-bold text-ink">30-Min Window</div>
            <p className="text-[11px] text-ink-muted">Students submit single combined PDF before countdown zero.</p>
          </div>

          <div className="p-3 sm:p-4 rounded-lg bg-canvas-soft border border-hairline space-y-1.5 sm:space-y-2">
            <span className="h-6 w-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">4</span>
            <div className="text-xs font-bold text-ink">AI Evaluation</div>
            <p className="text-[11px] text-ink-muted">Multimodal grading, bounding box annotations, uncertainty flags.</p>
          </div>

          <div className="p-3 sm:p-4 rounded-lg bg-canvas-soft border border-hairline space-y-1.5 sm:space-y-2">
            <span className="h-6 w-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">5</span>
            <div className="text-xs font-bold text-ink">Official Release</div>
            <p className="text-[11px] text-ink-muted">Admin clicks Publish; students see verified mark breakdown.</p>
          </div>
        </div>
      </section>

      {/* 5. ROLE-BASED QUICK PORTALS */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-5">
        <FeatureCard className="p-4 sm:p-6 space-y-3 sm:space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <BadgePill label="Root Admin" color="purple" />
            <h3 className="text-sm sm:text-base font-bold text-ink">Institutional Headquarters</h3>
            <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
              Create coaching institutes, monitor API quotas, approve rubrics, and inspect all examinations.
            </p>
          </div>
          <div className="pt-3 border-t border-hairline">
            <ButtonUtility href="/overview" className="w-full font-semibold justify-center text-center">
              Admin Overview Console →
            </ButtonUtility>
          </div>
        </FeatureCard>

        <FeatureCard className="p-4 sm:p-6 space-y-3 sm:space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <BadgePill label="Branch Manager" color="teal" />
            <h3 className="text-sm sm:text-base font-bold text-ink">Campus Centre Desk</h3>
            <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
              Manage local branch batches, register students via CSV, and trigger 30-minute exam windows.
            </p>
          </div>
          <div className="pt-3 border-t border-hairline">
            <ButtonUtility href="/branch/batches" className="w-full font-semibold justify-center text-center">
              Branch Batches & Windows →
            </ButtonUtility>
          </div>
        </FeatureCard>

        <FeatureCard className="p-4 sm:p-6 space-y-3 sm:space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <BadgePill label="Student" color="sky" />
            <h3 className="text-sm sm:text-base font-bold text-ink">Student Exam Portal</h3>
            <p className="text-[11px] sm:text-xs text-ink-muted leading-relaxed">
              Claim numeric Student ID, upload single PDF during live exam countdown, and track scores.
            </p>
          </div>
          <div className="pt-3 border-t border-hairline">
            <ButtonUtility href="/student/portal" className="w-full font-semibold justify-center text-center">
              Student Portal PWA →
            </ButtonUtility>
          </div>
        </FeatureCard>
      </section>

      {/* 6. CALL TO ACTION FOOTER BANNER */}
      <section className="rounded-xl border border-primary/20 bg-gradient-to-r from-[#edf5fd] via-[#f5eefc] to-[#e6f6f6] p-5 sm:p-8 md:p-12 text-center space-y-3.5 sm:space-y-5">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
          Ready to Modernize Examination Grading?
        </h2>
        <p className="text-xs sm:text-sm text-ink-secondary max-w-xl mx-auto leading-relaxed px-1">
          Sign in with your Root Admin credentials to start registering coaching institutes, creating examinations, and evaluating handwritten answer sheets.
        </p>
        <div className="pt-1 flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3 w-full sm:w-auto max-w-xs sm:max-w-none mx-auto">
          <ButtonPrimary href="/auth/login" size="md" className="w-full sm:w-auto justify-center text-center">
            Sign In to Console
          </ButtonPrimary>
          <ButtonUtility href="/auth/claim" className="py-2.5 px-4 font-semibold text-xs w-full sm:w-auto justify-center text-center">
            Claim Student Account
          </ButtonUtility>
        </div>
      </section>
    </div>
  );
}
