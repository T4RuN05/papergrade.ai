"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FileText,
  Check,
  ChevronRight,
  Layers,
  Users,
  Clock,
  Shield,
  Sliders,
  CheckCircle2,
  BookOpen,
  Search,
  Eye,
  Loader2,
  CornerDownRight,
} from "lucide-react";
import { api, getAuthToken, getStoredUser } from "@/lib/api";

export default function LandingPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isRedirectingStudent, setIsRedirectingStudent] = useState(false);
  const [activeMock, setActiveMock] = useState<"viewer" | "submissions" | "rubric">("viewer");

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
      <div className="flex flex-col items-center justify-center min-h-[75vh] space-y-4">
        <div className="h-10 w-10 rounded-md border border-hairline bg-surface flex items-center justify-center text-ink shadow-xs">
          <BookOpen className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Opening Student Portal...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {/* 
        ========================================================================
        MAIN PAGE CONTENT LAYER (Slides over the underlaying reveal footer)
        ========================================================================
      */}
      <div
        className="relative z-10 w-full bg-[#fcfbf9] border-b border-hairline shadow-[0_20px_45px_-10px_rgba(0,0,0,0.05)]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(0, 0, 0, 0.032) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 0, 0, 0.032) 1px, transparent 1px)
          `,
          backgroundSize: "28px 28px",
        }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-16 pb-24 sm:pb-32 space-y-16 sm:space-y-24">
          
          {/* 1. HERO SECTION */}
          <section className="text-center max-w-3xl mx-auto space-y-6 pt-2 sm:pt-6">
            {/* Top Minimal Brand Mark */}
            <div className="flex justify-center">
              <div className="h-12 w-12 rounded-lg border border-hairline bg-surface flex items-center justify-center p-2 shadow-xs">
                <Image
                  src="/logo-icon.png"
                  alt="PaperGrade"
                  width={32}
                  height={32}
                  className="object-contain"
                  priority
                />
              </div>
            </div>

            {/* Platform Identifier Tag */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-hairline bg-surface text-xs font-mono text-ink-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-ink" />
              <span>Academic Assessment Infrastructure</span>
            </div>

            {/* Primary Headline */}
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-ink leading-[1.15] sm:leading-[1.12]">
              Structured criteria evaluation for handwritten examinations.
            </h1>

            {/* Concise Mission Subhead */}
            <p className="text-sm sm:text-base md:text-lg text-ink-secondary leading-relaxed max-w-2xl mx-auto">
              PaperGrade automates the assessment of handwritten student answer sheets against instructor-approved rubrics. Every question receives discrete criteria scoring, annotated step feedback, and auditable revaluation records.
            </p>

            {/* Context-Aware Primary Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              {currentUser ? (
                currentUser.role === "ROOT_ADMIN" ? (
                  <Link
                    href="/overview"
                    className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-ink text-white text-xs font-medium hover:bg-neutral-800 transition-colors shadow-xs"
                  >
                    <span>Open Administrator Desk</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-2" />
                  </Link>
                ) : currentUser.role === "BRANCH_MANAGER" ? (
                  <Link
                    href="/branch/batches"
                    className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-ink text-white text-xs font-medium hover:bg-neutral-800 transition-colors shadow-xs"
                  >
                    <span>Open Branch Batches</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-2" />
                  </Link>
                ) : (
                  <Link
                    href="/student/portal"
                    className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-ink text-white text-xs font-medium hover:bg-neutral-800 transition-colors shadow-xs"
                  >
                    <span>Open Student Portal</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-2" />
                  </Link>
                )
              ) : (
                <>
                  <Link
                    href="/auth/login"
                    className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-ink text-white text-xs font-medium hover:bg-neutral-800 transition-colors shadow-xs w-full sm:w-auto"
                  >
                    <span>Sign In to Console</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-2" />
                  </Link>
                  <Link
                    href="/student/portal"
                    className="inline-flex items-center justify-center h-10 px-4 rounded-md border border-hairline bg-surface text-xs font-medium text-ink hover:bg-canvas-soft transition-colors w-full sm:w-auto"
                  >
                    <span>Student Portal</span>
                  </Link>
                  <Link
                    href="/auth/claim"
                    className="inline-flex items-center justify-center h-10 px-4 rounded-md border border-hairline bg-surface text-xs font-medium text-ink-secondary hover:text-ink hover:bg-canvas-soft transition-colors w-full sm:w-auto"
                  >
                    <span>Claim Student ID</span>
                  </Link>
                </>
              )}
            </div>

            {/* Architectural Pillars (Clean & Minimalist) */}
            <div className="pt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-ink-muted font-mono">
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-ink" />
                <span>Discrete Criteria Rubrics</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-ink" />
                <span>Single-Document Ingestion</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-ink" />
                <span>Human-Verified Appeals</span>
              </span>
            </div>
          </section>

          {/* 
            ========================================================================
            2. INTERACTIVE SKELETON MOCK SHOWCASE
            ========================================================================
          */}
          <section className="space-y-4">
            {/* Minimal Segmented Tab Switcher */}
            <div className="flex items-center justify-center">
              <div className="inline-flex items-center p-1 rounded-lg border border-hairline bg-surface shadow-xs gap-1">
                <button
                  type="button"
                  onClick={() => setActiveMock("viewer")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer ${
                    activeMock === "viewer"
                      ? "bg-canvas-soft text-ink font-semibold shadow-xs border border-hairline"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Document Evaluation Viewer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMock("submissions")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer ${
                    activeMock === "submissions"
                      ? "bg-canvas-soft text-ink font-semibold shadow-xs border border-hairline"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Batch Submissions Roster</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMock("rubric")}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer ${
                    activeMock === "rubric"
                      ? "bg-canvas-soft text-ink font-semibold shadow-xs border border-hairline"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <Sliders className="h-3.5 w-3.5" />
                  <span>Marking Rubric Architecture</span>
                </button>
              </div>
            </div>

            {/* MOCK COMPONENT CONTAINER (Non-Interactable Display Model) */}
            <div className="rounded-xl border border-hairline bg-surface shadow-notion-card overflow-hidden">
              
              {/* Window Header Bar */}
              <div className="px-4 py-3 border-b border-hairline bg-canvas-soft/60 flex items-center justify-between text-xs font-mono text-ink-muted">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-neutral-300" />
                  <span className="h-2 w-2 rounded-full bg-neutral-300" />
                  <span className="h-2 w-2 rounded-full bg-neutral-300" />
                  <span className="ml-2 text-ink text-[11px] font-medium truncate max-w-[200px] sm:max-w-none">
                    {activeMock === "viewer" && "evaluation_session_candidate_1042.pdf • Page 2 of 4"}
                    {activeMock === "submissions" && "academic_batch_roster • Autumn Term Session"}
                    {activeMock === "rubric" && "physics_paper_02_rubric • 100 Max Allocation"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="hidden sm:inline">Read-only Inspector</span>
                  <span className="px-1.5 py-0.5 rounded bg-surface border border-hairline text-[10px]">
                    Verified
                  </span>
                </div>
              </div>

              {/* MOCK 1: PDF DOCUMENT EVALUATION VIEWER */}
              {activeMock === "viewer" && (
                <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 select-none pointer-events-none">
                  {/* Left Column: Simulated Student Handwritten Page */}
                  <div className="lg:col-span-7 rounded-lg border border-hairline bg-canvas-soft/40 p-4 space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-hairline text-xs font-mono text-ink-muted">
                      <span>SHEET #02 • THERMODYNAMICS</span>
                      <span>PAGE BOUND: 100% CONFIDENCE</span>
                    </div>

                    {/* Question Header */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-mono text-ink-muted uppercase">Question 3. (5.0 Marks)</div>
                      <div className="text-xs text-ink font-medium leading-relaxed">
                        Calculate the maximum theoretical thermal efficiency of a Carnot engine operating between 600 K and 300 K. State the governing expression.
                      </div>
                    </div>

                    {/* Student Handwritten Derivation Box with Coordinate Stamp */}
                    <div className="p-3.5 rounded-md border border-neutral-300 bg-surface relative space-y-3 font-serif">
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-[10px] font-mono font-semibold text-ink">
                        +5.0 / 5.0 Marks
                      </div>

                      <div className="space-y-2 text-xs text-ink italic leading-relaxed pt-1">
                        <div className="flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-neutral-400" />
                          <span>η = 1 - (Q_c / Q_h) = 1 - (T_c / T_h)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-neutral-400" />
                          <span>Given: T_h = 600 K, T_c = 300 K</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-neutral-400" />
                          <span>η = 1 - (300 / 600) = 1 - 0.50 = 0.50 (50%)</span>
                        </div>
                      </div>

                      {/* Visual Skeleton Marker */}
                      <div className="pt-2 border-t border-dashed border-hairline flex items-center justify-between text-[10px] font-mono text-ink-muted">
                        <span>Derived in Box B-1</span>
                        <span>Criteria Matched: 3 of 3</span>
                      </div>
                    </div>

                    {/* Next Question Preview Skeleton */}
                    <div className="p-3 rounded border border-hairline bg-surface/70 space-y-1.5 opacity-60">
                      <div className="h-2 w-32 bg-neutral-200 rounded" />
                      <div className="h-2 w-48 bg-neutral-200 rounded" />
                    </div>
                  </div>

                  {/* Right Column: Question Criteria Breakdown & Feedback */}
                  <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-hairline">
                        <div>
                          <div className="text-xs font-semibold text-ink">Question 3 Evaluation</div>
                          <div className="text-[11px] text-ink-muted">Evaluated against Locked Rubric</div>
                        </div>
                        <span className="font-mono text-xs font-bold text-ink px-2 py-0.5 bg-neutral-100 border border-hairline rounded">
                          5.0 / 5.0
                        </span>
                      </div>

                      {/* Discrete Criteria List */}
                      <div className="space-y-2">
                        <div className="p-2.5 rounded border border-hairline bg-canvas-soft/50 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-ink">1. Carnot Formula Statement</span>
                            <span className="font-mono font-semibold text-ink">+2.0 / 2.0</span>
                          </div>
                          <div className="h-1.5 w-3/4 bg-neutral-200 rounded" />
                        </div>

                        <div className="p-2.5 rounded border border-hairline bg-canvas-soft/50 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-ink">2. Temperature Substitution</span>
                            <span className="font-mono font-semibold text-ink">+1.5 / 1.5</span>
                          </div>
                          <div className="h-1.5 w-4/5 bg-neutral-200 rounded" />
                        </div>

                        <div className="p-2.5 rounded border border-hairline bg-canvas-soft/50 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-ink">3. Efficiency Calculation</span>
                            <span className="font-mono font-semibold text-ink">+1.5 / 1.5</span>
                          </div>
                          <div className="h-1.5 w-2/3 bg-neutral-200 rounded" />
                        </div>
                      </div>
                    </div>

                    {/* Evaluator Notes Card */}
                    <div className="p-3 rounded-md border border-hairline bg-surface text-[11px] text-ink-secondary leading-relaxed space-y-1">
                      <div className="font-mono font-semibold text-ink uppercase text-[10px]">Feedback Assessment</div>
                      <p>
                        Formula statement and direct temperature substitutions follow approved conventions without mathematical deviation.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* MOCK 2: BATCH SUBMISSIONS ROSTER */}
              {activeMock === "submissions" && (
                <div className="p-4 sm:p-6 space-y-4 select-none pointer-events-none">
                  {/* Search and Filter Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
                    <div className="flex items-center gap-2 text-xs font-mono text-ink-muted">
                      <span className="font-medium text-ink">Batch Alpha</span>
                      <span>•</span>
                      <span>48 Candidate Submissions</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 px-2.5 py-1 rounded border border-hairline bg-canvas-soft text-[11px] text-ink-muted w-48">
                        <Search className="h-3 w-3" />
                        <span>Filter candidates...</span>
                      </div>
                      <span className="px-2 py-1 rounded bg-surface border border-hairline text-[11px] font-mono text-ink">
                        All (48)
                      </span>
                    </div>
                  </div>

                  {/* Notion-Style Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-hairline text-[11px] font-mono text-ink-muted uppercase">
                          <th className="pb-2 font-medium">Roll Number</th>
                          <th className="pb-2 font-medium">Student Name</th>
                          <th className="pb-2 font-medium">Submission</th>
                          <th className="pb-2 font-medium">Status</th>
                          <th className="pb-2 font-medium text-right">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        <tr className="hover:bg-canvas-soft/50">
                          <td className="py-2.5 font-mono text-ink">2026-PH-0104</td>
                          <td className="py-2.5 font-medium text-ink">Aarav Sharma</td>
                          <td className="py-2.5 text-ink-muted text-[11px]">Today, 14:22</td>
                          <td className="py-2.5">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-hairline bg-canvas-soft text-[10px] font-mono text-ink">
                              <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
                              <span>Evaluated</span>
                            </span>
                          </td>
                          <td className="py-2.5 font-mono font-semibold text-right text-ink">92.5 / 100</td>
                        </tr>

                        <tr className="hover:bg-canvas-soft/50">
                          <td className="py-2.5 font-mono text-ink">2026-PH-0112</td>
                          <td className="py-2.5 font-medium text-ink">Diya Patel</td>
                          <td className="py-2.5 text-ink-muted text-[11px]">Today, 14:25</td>
                          <td className="py-2.5">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-hairline bg-canvas-soft text-[10px] font-mono text-ink">
                              <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
                              <span>Evaluated</span>
                            </span>
                          </td>
                          <td className="py-2.5 font-mono font-semibold text-right text-ink">94.0 / 100</td>
                        </tr>

                        <tr className="hover:bg-canvas-soft/50">
                          <td className="py-2.5 font-mono text-ink">2026-PH-0119</td>
                          <td className="py-2.5 font-medium text-ink">Karan Verma</td>
                          <td className="py-2.5 text-ink-muted text-[11px]">Today, 14:28</td>
                          <td className="py-2.5">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-hairline bg-surface text-[10px] font-mono text-ink-secondary">
                              <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                              <span>Appeal Pending</span>
                            </span>
                          </td>
                          <td className="py-2.5 font-mono font-semibold text-right text-ink">78.5 / 100</td>
                        </tr>

                        {/* Skeleton Row Placeholder */}
                        <tr className="opacity-50">
                          <td className="py-2.5">
                            <div className="h-2 w-20 bg-neutral-200 rounded" />
                          </td>
                          <td className="py-2.5">
                            <div className="h-2 w-28 bg-neutral-200 rounded" />
                          </td>
                          <td className="py-2.5">
                            <div className="h-2 w-16 bg-neutral-200 rounded" />
                          </td>
                          <td className="py-2.5">
                            <div className="h-4 w-20 bg-neutral-200 rounded" />
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="h-2 w-12 bg-neutral-200 rounded ml-auto" />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* MOCK 3: MARKING RUBRIC ARCHITECTURE */}
              {activeMock === "rubric" && (
                <div className="p-4 sm:p-6 space-y-4 select-none pointer-events-none">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-hairline">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-ink">Mathematics Paper III • Vector Calculus</div>
                      <div className="text-[11px] text-ink-muted">Locked criteria distribution across 20 examination items</div>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs text-ink">
                      <span className="px-2 py-0.5 rounded bg-neutral-100 border border-hairline">
                        Total Allocation: 100.0 Marks
                      </span>
                    </div>
                  </div>

                  {/* Question Rubric Group */}
                  <div className="space-y-3">
                    <div className="rounded-lg border border-hairline bg-canvas-soft/30 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-ink">Q1</span>
                          <span className="text-xs font-medium text-ink">Gauss Divergence Theorem Application</span>
                        </div>
                        <span className="font-mono text-xs text-ink-secondary">6.0 Marks</span>
                      </div>

                      {/* Criteria Items */}
                      <div className="space-y-1.5 pl-3 border-l-2 border-hairline text-xs">
                        <div className="flex items-center justify-between text-ink-secondary py-0.5">
                          <span>Criteria 1.1: Correct divergence expression in spherical coordinates</span>
                          <span className="font-mono text-[11px]">2.0 Marks</span>
                        </div>
                        <div className="flex items-center justify-between text-ink-secondary py-0.5">
                          <span>Criteria 1.2: Boundary volume integral conversion and limits</span>
                          <span className="font-mono text-[11px]">2.5 Marks</span>
                        </div>
                        <div className="flex items-center justify-between text-ink-secondary py-0.5">
                          <span>Criteria 1.3: Dimensional analysis and final scalar computation</span>
                          <span className="font-mono text-[11px]">1.5 Marks</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-hairline bg-canvas-soft/30 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-ink">Q2</span>
                          <span className="text-xs font-medium text-ink">Stokes Theorem Over Closed Loop</span>
                        </div>
                        <span className="font-mono text-xs text-ink-secondary">4.0 Marks</span>
                      </div>
                      <div className="space-y-1 pl-3 border-l-2 border-hairline">
                        <div className="h-2 w-3/5 bg-neutral-200 rounded" />
                        <div className="h-2 w-2/5 bg-neutral-200 rounded" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer Indicator */}
              <div className="px-4 py-2.5 bg-canvas-soft border-t border-hairline flex items-center justify-between text-[11px] text-ink-muted">
                <span>Verified Academic Blueprint</span>
                <span className="font-mono">Audit Record: #EV-2026-OK</span>
              </div>
            </div>
          </section>

          {/* 
            ========================================================================
            3. WORKFLOW STEPS (Minimal & Clear)
            ========================================================================
          */}
          <section className="space-y-6">
            <div className="border-b border-hairline pb-3">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-ink">
                Evaluation Workflow
              </h2>
              <p className="text-xs text-ink-muted mt-1">
                From initial rubric formulation to transparent student score publication.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border border-hairline bg-surface space-y-2">
                <span className="font-mono text-xs font-semibold text-ink px-2 py-0.5 rounded bg-canvas-soft border border-hairline inline-block">
                  01
                </span>
                <h3 className="text-sm font-bold text-ink">Define Marking Criteria</h3>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Establish standardized point allocations for each question step. Rubrics are frozen before candidate papers are ingested.
                </p>
              </div>

              <div className="p-4 rounded-lg border border-hairline bg-surface space-y-2">
                <span className="font-mono text-xs font-semibold text-ink px-2 py-0.5 rounded bg-canvas-soft border border-hairline inline-block">
                  02
                </span>
                <h3 className="text-sm font-bold text-ink">Ingest & Verify Answers</h3>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Handwritten sheets are matched to candidate identifiers and graded step-by-step against approved rubric criteria.
                </p>
              </div>

              <div className="p-4 rounded-lg border border-hairline bg-surface space-y-2">
                <span className="font-mono text-xs font-semibold text-ink px-2 py-0.5 rounded bg-canvas-soft border border-hairline inline-block">
                  03
                </span>
                <h3 className="text-sm font-bold text-ink">Publish & Handle Appeals</h3>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Scores are released with itemized mark sheets. Legitimate student grievances are routed to human examiners with full audit trails.
                </p>
              </div>
            </div>
          </section>

          {/* 
            ========================================================================
            4. ROLE DIRECTORY (Minimal Card Links)
            ========================================================================
          */}
          <section className="space-y-4">
            <div className="border-b border-hairline pb-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-muted font-mono">
                Access Portals
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link
                href="/auth/login"
                className="group p-4 rounded-lg border border-hairline bg-surface hover:bg-canvas-soft transition-colors flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-ink flex items-center justify-between">
                    <span>Root Administrator</span>
                    <ChevronRight className="h-3.5 w-3.5 text-ink-muted group-hover:text-ink transition-colors" />
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    Institutional governance, exam definitions, and campus-wide parameters.
                  </p>
                </div>
                <span className="text-[11px] font-mono text-ink group-hover:underline">Sign In →</span>
              </Link>

              <Link
                href="/auth/login"
                className="group p-4 rounded-lg border border-hairline bg-surface hover:bg-canvas-soft transition-colors flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-ink flex items-center justify-between">
                    <span>Branch Manager</span>
                    <ChevronRight className="h-3.5 w-3.5 text-ink-muted group-hover:text-ink transition-colors" />
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    Batch enrollment, roster synchronization, and student inquiry handling.
                  </p>
                </div>
                <span className="text-[11px] font-mono text-ink group-hover:underline">Sign In →</span>
              </Link>

              <Link
                href="/student/portal"
                className="group p-4 rounded-lg border border-hairline bg-surface hover:bg-canvas-soft transition-colors flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-ink flex items-center justify-between">
                    <span>Student Portal</span>
                    <ChevronRight className="h-3.5 w-3.5 text-ink-muted group-hover:text-ink transition-colors" />
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    Paper submission, marks breakdown inspection, and score appeals.
                  </p>
                </div>
                <span className="text-[11px] font-mono text-ink group-hover:underline">Open Portal →</span>
              </Link>
            </div>
          </section>

        </div>
      </div>

      {/* 
        ========================================================================
        UNDERLAYING REVEAL FOOTER
        Sits pinned beneath the main document and reveals itself when scrolled down.
        ========================================================================
      */}
      <footer className="sticky bottom-0 z-0 w-full bg-[#141413] text-[#8e8d8a] min-h-[340px] flex flex-col justify-between p-6 sm:p-12 md:p-16 select-none">
        <div className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
          
          {/* Brand & Mission */}
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-neutral-800 border border-neutral-700 flex items-center justify-center p-1">
                <Image
                  src="/logo-icon.png"
                  alt="PaperGrade AI"
                  width={18}
                  height={18}
                  className="object-contain invert"
                />
              </div>
              <span className="text-sm font-bold text-white tracking-tight">PaperGrade AI</span>
            </div>
            <p className="text-xs text-[#9b9994] leading-relaxed max-w-sm">
              Infrastructure for handwritten academic evaluations, itemized marking rubrics, and institutional grading integrity.
            </p>
            <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-[#71706c]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Assessment Services Active</span>
            </div>
          </div>

          {/* Real Internal Links Only */}
          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-6 text-xs">
            <div className="space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-white font-medium">
                Student Access
              </div>
              <ul className="space-y-1.5">
                <li>
                  <Link href="/student/portal" className="hover:text-white transition-colors">
                    Examination Portal
                  </Link>
                </li>
                <li>
                  <Link href="/auth/claim" className="hover:text-white transition-colors">
                    Claim Student ID
                  </Link>
                </li>
                <li>
                  <Link href="/revaluation" className="hover:text-white transition-colors">
                    Revaluation Desk
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-white font-medium">
                Administration
              </div>
              <ul className="space-y-1.5">
                <li>
                  <Link href="/overview" className="hover:text-white transition-colors">
                    Operations Console
                  </Link>
                </li>
                <li>
                  <Link href="/branch/batches" className="hover:text-white transition-colors">
                    Batches & Roster
                  </Link>
                </li>
                <li>
                  <Link href="/admin/tenancy" className="hover:text-white transition-colors">
                    Institutes & Campuses
                  </Link>
                </li>
                <li>
                  <Link href="/marks" className="hover:text-white transition-colors">
                    Marks Inspection
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-white font-medium">
                Authentication
              </div>
              <ul className="space-y-1.5">
                <li>
                  <Link href="/auth/login" className="hover:text-white transition-colors">
                    Sign In
                  </Link>
                </li>
                <li>
                  <Link href="/auth/login" className="hover:text-white transition-colors">
                    Staff Login
                  </Link>
                </li>
              </ul>
            </div>
          </div>

        </div>

        {/* Bottom Legal / Copyright Row */}
        <div className="max-w-5xl mx-auto w-full pt-8 mt-8 border-t border-[#262624] flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#6d6c68] font-mono">
          <div>© {new Date().getFullYear()} PaperGrade AI • All rights reserved.</div>
          <div>High-Integrity Academic Evaluation Architecture</div>
        </div>
      </footer>
    </div>
  );
}
