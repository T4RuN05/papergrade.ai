"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FileText,
  Check,
  ChevronRight,
  Users,
  Sliders,
  Search,
  BookOpen,
  Loader2,
  Volume2,
  VolumeX,
  ExternalLink,
} from "lucide-react";
import { api, getAuthToken, getStoredUser } from "@/lib/api";

export default function LandingPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isRedirectingStudent, setIsRedirectingStudent] = useState(false);
  const [activeMock, setActiveMock] = useState<"viewer" | "submissions" | "rubric">("viewer");

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);

  // Guarantee default sound is OFF across all browser engines
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.defaultMuted = true;
    }
  }, []);

  const toggleSound = () => {
    if (!videoRef.current) return;
    const nextMuted = !videoRef.current.muted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    }
  };

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
      <div className="flex flex-col items-center justify-center min-h-[75vh] space-y-4 bg-canvas-soft">
        <div className="h-10 w-10 rounded-md border border-hairline bg-surface flex items-center justify-center text-ink shadow-xs">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span>Opening Student Portal...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-x-hidden">
      {/* 
        ========================================================================
        MAIN PAGE CONTENT LAYER (Warm Paper-Soft Canvas #f6f5f4 per DESIGN-notion.md)
        Slides over the underlaying reveal footer
        ========================================================================
      */}
      <div
        className="relative z-10 w-full bg-canvas-soft border-b border-hairline shadow-[0_20px_45px_-10px_rgba(0,0,0,0.06)]"
        style={{
          backgroundColor: "#f6f5f4",
          backgroundImage: `
            linear-gradient(to right, rgba(0, 0, 0, 0.035) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 0, 0, 0.035) 1px, transparent 1px)
          `,
          backgroundSize: "28px 28px",
        }}
      >
        <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 pt-8 sm:pt-16 pb-20 sm:pb-32 space-y-12 sm:space-y-24">
          
          {/* 1. HERO SECTION */}
          <section className="text-center max-w-3xl mx-auto space-y-5 sm:space-y-6 pt-2 sm:pt-6">
            
            {/* Authentic Brand Badge (Preserving official golden logo & Notion Blue AI) */}
            <div className="flex justify-center px-2">
              <div className="inline-flex items-center gap-2 sm:gap-2.5 px-3 py-1.5 rounded-full border border-hairline bg-surface shadow-xs max-w-full">
                <Image
                  src="/logo-icon.png"
                  alt="PaperGrade AI"
                  width={22}
                  height={22}
                  className="h-5 w-5 object-contain shrink-0"
                  priority
                />
                <span className="text-xs font-bold tracking-tight text-ink shrink-0">
                  PaperGrade <span className="text-primary font-semibold">AI</span>
                </span>
                <span className="hidden min-[420px]:inline-block text-[10px] text-ink-muted font-mono pl-2 border-l border-hairline uppercase tracking-wider truncate">
                  Assessment Infrastructure
                </span>
              </div>
            </div>

            {/* Primary Headline (NotionInter display weight & tracking) */}
            <h1 className="text-2xl min-[400px]:text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-ink leading-[1.18] sm:leading-[1.1] px-1">
              Structured criteria evaluation for handwritten examinations.
            </h1>

            {/* Concise Mission Subhead */}
            <p className="text-xs sm:text-base md:text-lg text-ink-secondary leading-relaxed max-w-2xl mx-auto font-normal px-2">
              PaperGrade evaluates handwritten student answer sheets against itemized, instructor-approved rubrics. Every question receives discrete criteria scoring, annotated step feedback, and auditable revaluation records.
            </p>

            {/* Notion Pill-Shaped Action Buttons (button-primary & button-secondary from DESIGN-notion.md) */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 w-full max-w-xs sm:max-w-none mx-auto px-2">
              {currentUser ? (
                currentUser.role === "ROOT_ADMIN" ? (
                  <Link
                    href="/overview"
                    className="inline-flex items-center justify-center h-10 px-6 rounded-full bg-primary hover:bg-primary-active text-on-primary text-sm font-medium transition-colors shadow-xs w-full sm:w-auto text-center"
                  >
                    <span>Open Administrator Desk</span>
                    <ArrowRight className="h-4 w-4 ml-2 shrink-0" />
                  </Link>
                ) : currentUser.role === "BRANCH_MANAGER" ? (
                  <Link
                    href="/branch/batches"
                    className="inline-flex items-center justify-center h-10 px-6 rounded-full bg-primary hover:bg-primary-active text-on-primary text-sm font-medium transition-colors shadow-xs w-full sm:w-auto text-center"
                  >
                    <span>Open Branch Batches</span>
                    <ArrowRight className="h-4 w-4 ml-2 shrink-0" />
                  </Link>
                ) : (
                  <Link
                    href="/student/portal"
                    className="inline-flex items-center justify-center h-10 px-6 rounded-full bg-primary hover:bg-primary-active text-on-primary text-sm font-medium transition-colors shadow-xs w-full sm:w-auto text-center"
                  >
                    <span>Open Student Portal</span>
                    <ArrowRight className="h-4 w-4 ml-2 shrink-0" />
                  </Link>
                )
              ) : (
                <>
                  <Link
                    href="/auth/login?role=staff"
                    className="inline-flex items-center justify-center h-10 px-6 rounded-full bg-primary hover:bg-primary-active text-on-primary text-sm font-medium transition-colors shadow-xs w-full sm:w-auto text-center"
                  >
                    <span>Sign In to Console</span>
                    <ArrowRight className="h-4 w-4 ml-2 shrink-0" />
                  </Link>
                  <Link
                    href="/auth/login?role=student"
                    className="inline-flex items-center justify-center h-10 px-5 rounded-full border border-hairline bg-surface text-sm font-medium text-ink hover:bg-canvas-soft transition-colors shadow-xs w-full sm:w-auto text-center"
                  >
                    <span>Student Portal</span>
                  </Link>
                  <Link
                    href="/auth/login?role=claim"
                    className="inline-flex items-center justify-center h-10 px-5 rounded-full border border-hairline bg-surface text-sm font-medium text-ink-secondary hover:text-ink hover:bg-canvas-soft transition-colors w-full sm:w-auto text-center"
                  >
                    <span>Claim Student ID</span>
                  </Link>
                </>
              )}
            </div>

            {/* Subtle Notion Sticker Dots (Pills matching DESIGN-notion.md sticker palette) */}
            <div className="pt-3 sm:pt-4 flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-2 text-[11px] sm:text-xs text-ink-muted px-2">
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="h-2 w-2 rounded-full bg-accent-green shrink-0" />
                <span>Discrete Criteria Rubrics</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                <span>Single-Document Ingestion</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="h-2 w-2 rounded-full bg-accent-teal shrink-0" />
                <span>Human-Verified Appeals</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="h-2 w-2 rounded-full bg-accent-orange shrink-0" />
                <span>Campus RBAC Boundaries</span>
              </span>
            </div>
          </section>

          {/* 
            ========================================================================
            2. PRODUCT DEMO VIDEO WALKTHROUGH (Default Sound Off)
            ========================================================================
          */}
          <section className="space-y-4 sm:space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 px-1 border-b border-hairline pb-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 text-[11px] font-bold text-primary tracking-wider uppercase font-mono">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green" />
                  </span>
                  <span>Platform Demonstration</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
                  PaperGrade AI in Action
                </h2>
                <p className="text-xs text-ink-muted max-w-xl">
                  Watch handwritten candidate papers ingested, aligned to discrete criteria rubrics, evaluated step-by-step, and published with transparent score breakdowns.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="px-2.5 py-1 rounded-full border border-hairline bg-surface font-mono text-[11px] text-ink-muted">
                  1440p QHD • 5:48
                </span>
                <button
                  type="button"
                  onClick={toggleSound}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                    isMuted
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15"
                  }`}
                  title={isMuted ? "Click to unmute audio" : "Click to mute audio"}
                >
                  {isMuted ? (
                    <>
                      <VolumeX className="h-3.5 w-3.5" />
                      <span>Sound Off</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-3.5 w-3.5" />
                      <span>Sound On</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Video Player Card Frame (Notion Window Chrome) */}
            <div className="rounded-xl border border-hairline bg-surface shadow-notion-card overflow-hidden">
              {/* Window Chrome Header */}
              <div className="px-3 sm:px-4 py-2.5 border-b border-hairline bg-canvas-soft/80 flex items-center justify-between text-xs font-mono text-ink-muted gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400/80 border border-red-500/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80 border border-amber-500/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80 border border-emerald-500/20" />
                  </div>
                  <span className="truncate font-sans font-medium text-ink pl-1 sm:pl-2">
                    PaperGrade AI Demo • Product Walkthrough
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-[11px]">
                  <span className="hidden sm:inline font-mono text-ink-muted">demo.mp4</span>
                  <a
                    href="/demo.mp4"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    title="Open video in new tab"
                  >
                    <span>Full Tab</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              {/* Video Player Canvas */}
              <div className="relative aspect-video w-full bg-black/95 overflow-hidden group">
                <video
                  ref={videoRef}
                  className="w-full h-full object-contain"
                  poster="/demo-poster.jpg"
                  preload="metadata"
                  playsInline
                  autoPlay
                  loop
                  muted
                  controls
                  onVolumeChange={(e) => {
                    const v = e.currentTarget;
                    setIsMuted(v.muted || v.volume === 0);
                  }}
                >
                  <source src="/demo.mp4" type="video/mp4" />
                  Your browser does not support HTML5 video streaming.
                </video>

                {/* Floating Sound Toggle Badge Overlay */}
                <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 pointer-events-auto">
                  <button
                    type="button"
                    onClick={toggleSound}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-900/85 hover:bg-neutral-900 text-white text-xs font-medium backdrop-blur-md border border-white/20 shadow-lg transition-transform active:scale-95 cursor-pointer"
                  >
                    {isMuted ? (
                      <>
                        <VolumeX className="h-3.5 w-3.5 text-amber-400" />
                        <span>Sound Off • Click to Unmute</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Sound On</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Window Chrome Footer */}
              <div className="px-3 sm:px-4 py-2.5 bg-canvas-soft border-t border-hairline flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-ink-muted gap-1">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
                  <span>Real-time OCR Handwriting Ingestion & Criteria Scoring</span>
                </span>
                <span className="font-mono text-ink-secondary">Default Audio: Off • Unmute anytime</span>
              </div>
            </div>
          </section>

          {/* 
            ========================================================================
            3. INTERACTIVE SKELETON MOCK SHOWCASE (Notion Card & Hairlines)
            ========================================================================
          */}
          <section className="space-y-4">
            {/* Notion-Style Segmented Tab Switcher */}
            <div className="w-full flex items-center justify-center overflow-x-auto scrollbar-none py-1 px-1">
              <div className="inline-flex items-center p-1 rounded-lg border border-hairline bg-surface shadow-xs gap-1 max-w-full">
                <button
                  type="button"
                  onClick={() => setActiveMock("viewer")}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0 ${
                    activeMock === "viewer"
                      ? "bg-canvas-soft text-ink font-semibold shadow-xs border border-hairline"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="sm:hidden">Viewer</span>
                  <span className="hidden sm:inline">Document Evaluation Viewer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMock("submissions")}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0 ${
                    activeMock === "submissions"
                      ? "bg-canvas-soft text-ink font-semibold shadow-xs border border-hairline"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <Users className="h-3.5 w-3.5 text-accent-teal shrink-0" />
                  <span className="sm:hidden">Roster</span>
                  <span className="hidden sm:inline">Batch Submissions Roster</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMock("rubric")}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0 ${
                    activeMock === "rubric"
                      ? "bg-canvas-soft text-ink font-semibold shadow-xs border border-hairline"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <Sliders className="h-3.5 w-3.5 text-accent-purple-deep shrink-0" />
                  <span className="sm:hidden">Rubric</span>
                  <span className="hidden sm:inline">Marking Rubric Architecture</span>
                </button>
              </div>
            </div>

            {/* MOCK COMPONENT CONTAINER (Non-Interactable Display Model) */}
            <div className="rounded-xl border border-hairline bg-surface shadow-notion-card overflow-hidden">
              
              {/* Window Chrome Header */}
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-hairline bg-canvas-soft/80 flex items-center justify-between text-xs font-mono text-ink-muted gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full bg-neutral-300 shrink-0" />
                  <span className="h-2 w-2 rounded-full bg-neutral-300 shrink-0" />
                  <span className="h-2 w-2 rounded-full bg-neutral-300 shrink-0" />
                  <span className="ml-1 sm:ml-2 text-ink text-[11px] font-medium truncate max-w-[150px] min-[400px]:max-w-[220px] sm:max-w-none">
                    {activeMock === "viewer" && "candidate_physics_eval_1042.pdf • Page 2 of 4"}
                    {activeMock === "submissions" && "academic_batch_autumn_2026 • 48 Candidates"}
                    {activeMock === "rubric" && "physics_paper_02_rubric • 100.0 Allocation"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] shrink-0">
                  <span className="px-2 py-0.5 rounded-full bg-surface border border-hairline text-primary font-medium text-[10px] shrink-0">
                    Verified
                  </span>
                </div>
              </div>

              {/* MOCK 1: PDF DOCUMENT EVALUATION VIEWER */}
              {activeMock === "viewer" && (
                <div className="p-3.5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 select-none pointer-events-none">
                  {/* Left Column: Simulated Student Handwritten Page */}
                  <div className="lg:col-span-7 rounded-lg border border-hairline bg-canvas-soft/40 p-3 sm:p-4 space-y-3 sm:space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-hairline text-[11px] sm:text-xs font-mono text-ink-muted gap-2">
                      <span className="truncate">SHEET #02 • THERMODYNAMICS</span>
                      <span className="text-accent-green font-semibold shrink-0">COORDINATE MATCH 100%</span>
                    </div>

                    {/* Question Header */}
                    <div className="space-y-1">
                      <div className="text-[10px] sm:text-[11px] font-mono text-ink-muted uppercase">Question 3. (5.0 Marks)</div>
                      <div className="text-xs text-ink font-medium leading-relaxed">
                        Calculate the maximum theoretical thermal efficiency of a Carnot engine operating between 600 K and 300 K. State the governing expression.
                      </div>
                    </div>

                    {/* Student Handwritten Derivation Box with Coordinate Stamp */}
                    <div className="p-3 sm:p-3.5 rounded-md border border-neutral-300 bg-surface relative space-y-2.5 sm:space-y-3 font-serif">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[10px] font-mono text-ink-muted uppercase">Student Derivation (Box B-1)</div>
                        <div className="px-2 py-0.5 rounded-md bg-[#eaf7ed] border border-[#c2ecd0] text-[10px] font-mono font-semibold text-accent-green shrink-0">
                          +5.0 / 5.0 Marks
                        </div>
                      </div>

                      <div className="space-y-2 text-xs text-ink italic leading-relaxed pt-1 overflow-x-auto scrollbar-none">
                        <div className="flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-neutral-400 shrink-0" />
                          <span className="break-all sm:break-normal font-mono text-[11px] sm:text-xs">η = 1 - (Q_c / Q_h) = 1 - (T_c / T_h)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-neutral-400 shrink-0" />
                          <span className="break-all sm:break-normal font-mono text-[11px] sm:text-xs">Given: T_h = 600 K, T_c = 300 K</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-neutral-400 shrink-0" />
                          <span className="break-all sm:break-normal font-mono text-[11px] sm:text-xs">η = 1 - (300 / 600) = 1 - 0.50 = 0.50 (50%)</span>
                        </div>
                      </div>

                      {/* Visual Skeleton Marker */}
                      <div className="pt-2 border-t border-dashed border-hairline flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono text-ink-muted">
                        <span>Derived in Box B-1</span>
                        <span className="text-accent-green font-medium">Criteria Matched: 3 of 3</span>
                      </div>
                    </div>

                    {/* Next Question Preview Skeleton */}
                    <div className="p-2.5 sm:p-3 rounded border border-hairline bg-surface/70 space-y-1.5 opacity-60">
                      <div className="h-2 w-32 bg-neutral-200 rounded" />
                      <div className="h-2 w-48 bg-neutral-200 rounded" />
                    </div>
                  </div>

                  {/* Right Column: Question Criteria Breakdown & Feedback */}
                  <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-hairline gap-2">
                        <div>
                          <div className="text-xs font-semibold text-ink">Question 3 Evaluation</div>
                          <div className="text-[11px] text-ink-muted">Evaluated against Locked Rubric</div>
                        </div>
                        <span className="font-mono text-xs font-bold text-accent-green px-2 py-0.5 bg-[#eaf7ed] border border-[#c2ecd0] rounded shrink-0">
                          5.0 / 5.0
                        </span>
                      </div>

                      {/* Discrete Criteria List */}
                      <div className="space-y-2">
                        <div className="p-2.5 rounded border border-hairline bg-canvas-soft/60 space-y-1">
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="font-medium text-ink">1. Carnot Formula Statement</span>
                            <span className="font-mono font-semibold text-accent-green shrink-0">+2.0 / 2.0</span>
                          </div>
                          <div className="h-1.5 w-3/4 bg-neutral-200 rounded" />
                        </div>

                        <div className="p-2.5 rounded border border-hairline bg-canvas-soft/60 space-y-1">
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="font-medium text-ink">2. Temperature Substitution</span>
                            <span className="font-mono font-semibold text-accent-green shrink-0">+1.5 / 1.5</span>
                          </div>
                          <div className="h-1.5 w-4/5 bg-neutral-200 rounded" />
                        </div>

                        <div className="p-2.5 rounded border border-hairline bg-canvas-soft/60 space-y-1">
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="font-medium text-ink">3. Efficiency Calculation</span>
                            <span className="font-mono font-semibold text-accent-green shrink-0">+1.5 / 1.5</span>
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
                <div className="p-3.5 sm:p-6 space-y-4 select-none pointer-events-none">
                  {/* Search and Filter Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
                    <div className="flex items-center gap-2 text-xs font-mono text-ink-muted">
                      <span className="font-medium text-ink">Batch Alpha</span>
                      <span>•</span>
                      <span>48 Candidate Submissions</span>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="flex items-center gap-2 px-2.5 py-1 rounded border border-hairline bg-canvas-soft text-[11px] text-ink-muted flex-1 sm:w-48 sm:flex-initial">
                        <Search className="h-3 w-3 shrink-0" />
                        <span className="truncate">Filter candidates...</span>
                      </div>
                      <span className="px-2 py-1 rounded-full bg-surface border border-hairline text-[11px] font-mono text-ink shrink-0">
                        All (48)
                      </span>
                    </div>
                  </div>

                  {/* Notion-Style Table */}
                  <div className="overflow-x-auto -mx-1 sm:mx-0">
                    <table className="w-full min-w-[500px] text-left text-xs border-collapse">
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
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[#c2ecd0] bg-[#eaf7ed] text-[10px] font-mono text-accent-green">
                              <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
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
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[#c2ecd0] bg-[#eaf7ed] text-[10px] font-mono text-accent-green">
                              <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
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
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[#fed7aa] bg-[#fff7ed] text-[10px] font-mono text-accent-orange">
                              <span className="h-1.5 w-1.5 rounded-full bg-accent-orange" />
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
                            <div className="h-4 w-20 bg-neutral-200 rounded-full" />
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
                <div className="p-3.5 sm:p-6 space-y-4 select-none pointer-events-none">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-hairline">
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-xs font-semibold text-ink">Mathematics Paper III • Vector Calculus</div>
                      <div className="text-[11px] text-ink-muted">Locked criteria distribution across 20 examination items</div>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs text-ink shrink-0">
                      <span className="px-2.5 py-0.5 rounded-full bg-surface border border-hairline text-primary font-semibold text-[11px] sm:text-xs">
                        Total Allocation: 100.0 Marks
                      </span>
                    </div>
                  </div>

                  {/* Question Rubric Group */}
                  <div className="space-y-3">
                    <div className="rounded-lg border border-hairline bg-canvas-soft/40 p-3 sm:p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs font-bold text-primary shrink-0">Q1</span>
                          <span className="text-xs font-medium text-ink truncate">Gauss Divergence Theorem Application</span>
                        </div>
                        <span className="font-mono text-xs font-semibold text-ink shrink-0">6.0 Marks</span>
                      </div>

                      {/* Criteria Items */}
                      <div className="space-y-1.5 pl-3 border-l-2 border-primary/30 text-xs">
                        <div className="flex items-start justify-between text-ink-secondary py-0.5 gap-2">
                          <span className="leading-tight">Criteria 1.1: Correct divergence expression in spherical coordinates</span>
                          <span className="font-mono text-[11px] text-primary font-medium shrink-0">2.0 Marks</span>
                        </div>
                        <div className="flex items-start justify-between text-ink-secondary py-0.5 gap-2">
                          <span className="leading-tight">Criteria 1.2: Boundary volume integral conversion and limits</span>
                          <span className="font-mono text-[11px] text-primary font-medium shrink-0">2.5 Marks</span>
                        </div>
                        <div className="flex items-start justify-between text-ink-secondary py-0.5 gap-2">
                          <span className="leading-tight">Criteria 1.3: Dimensional analysis and final scalar computation</span>
                          <span className="font-mono text-[11px] text-primary font-medium shrink-0">1.5 Marks</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-hairline bg-canvas-soft/40 p-3 sm:p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs font-bold text-primary shrink-0">Q2</span>
                          <span className="text-xs font-medium text-ink truncate">Stokes Theorem Over Closed Loop</span>
                        </div>
                        <span className="font-mono text-xs font-semibold text-ink shrink-0">4.0 Marks</span>
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
              <div className="px-3 sm:px-4 py-2.5 bg-canvas-soft border-t border-hairline flex items-center justify-between text-[11px] text-ink-muted">
                <span>Verified Academic Blueprint</span>
                <span className="font-mono">Audit Record: #EV-2026-OK</span>
              </div>
            </div>
          </section>

          {/* 
            ========================================================================
            4. WORKFLOW STEPS (Minimal & Clear)
            ========================================================================
          */}
          <section className="space-y-4 sm:space-y-6">
            <div className="border-b border-hairline pb-3">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-ink">
                Evaluation Workflow
              </h2>
              <p className="text-xs text-ink-muted mt-1">
                From initial rubric formulation to transparent student score publication.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
              <div className="p-4 sm:p-5 rounded-lg border border-hairline bg-surface space-y-2 shadow-xs min-w-0">
                <span className="font-mono text-xs font-semibold text-primary px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 inline-block">
                  01
                </span>
                <h3 className="text-sm font-bold text-ink">Define Marking Criteria</h3>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Establish standardized point allocations for each question step. Rubrics are frozen before candidate papers are ingested.
                </p>
              </div>

              <div className="p-4 sm:p-5 rounded-lg border border-hairline bg-surface space-y-2 shadow-xs min-w-0">
                <span className="font-mono text-xs font-semibold text-primary px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 inline-block">
                  02
                </span>
                <h3 className="text-sm font-bold text-ink">Ingest & Verify Answers</h3>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Handwritten sheets are matched to candidate identifiers and graded step-by-step against approved rubric criteria.
                </p>
              </div>

              <div className="p-4 sm:p-5 rounded-lg border border-hairline bg-surface space-y-2 shadow-xs min-w-0">
                <span className="font-mono text-xs font-semibold text-primary px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 inline-block">
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
            5. ROLE DIRECTORY (Minimal Card Links)
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
                href={currentUser ? "/overview" : "/auth/login?role=staff&portal=admin"}
                className="group p-3.5 sm:p-4 rounded-lg border border-hairline bg-surface hover:bg-canvas-soft transition-colors flex flex-col justify-between space-y-3 shadow-xs min-w-0"
              >
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-ink flex items-center justify-between">
                    <span>Root Administrator</span>
                    <ChevronRight className="h-3.5 w-3.5 text-ink-muted group-hover:text-primary transition-colors shrink-0" />
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    Institutional governance, exam definitions, and campus-wide parameters.
                  </p>
                </div>
                <span className="text-[11px] font-mono text-primary font-medium group-hover:underline">Sign In →</span>
              </Link>

              <Link
                href={currentUser ? "/branch/batches" : "/auth/login?role=staff&portal=branch"}
                className="group p-3.5 sm:p-4 rounded-lg border border-hairline bg-surface hover:bg-canvas-soft transition-colors flex flex-col justify-between space-y-3 shadow-xs min-w-0"
              >
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-ink flex items-center justify-between">
                    <span>Branch Manager</span>
                    <ChevronRight className="h-3.5 w-3.5 text-ink-muted group-hover:text-primary transition-colors shrink-0" />
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    Batch enrollment, roster synchronization, and student inquiry handling.
                  </p>
                </div>
                <span className="text-[11px] font-mono text-primary font-medium group-hover:underline">Sign In →</span>
              </Link>

              <Link
                href={currentUser ? "/student/portal" : "/auth/login?role=student"}
                className="group p-3.5 sm:p-4 rounded-lg border border-hairline bg-surface hover:bg-canvas-soft transition-colors flex flex-col justify-between space-y-3 shadow-xs min-w-0"
              >
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-ink flex items-center justify-between">
                    <span>Student Portal</span>
                    <ChevronRight className="h-3.5 w-3.5 text-ink-muted group-hover:text-primary transition-colors shrink-0" />
                  </div>
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    Paper submission, marks breakdown inspection, and score appeals.
                  </p>
                </div>
                <span className="text-[11px] font-mono text-primary font-medium group-hover:underline">Open Portal →</span>
              </Link>
            </div>
          </section>

        </div>
      </div>

      {/* 
        ========================================================================
        UNDERLAYING REVEAL FOOTER
        Sits pinned beneath the main document and reveals itself when scrolled down.
        Includes the requested big faded typography of "PaperGrade AI".
        ========================================================================
      */}
      <footer className="sticky bottom-0 z-0 w-full bg-[#141413] text-[#8e8d8a] min-h-[360px] flex flex-col justify-between pt-8 sm:pt-14 pb-4 px-4 sm:px-12 md:px-16 select-none overflow-hidden">
        <div className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
          
          {/* Brand & Mission (Original Golden Logo + Notion Blue AI) */}
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <Image
                src="/logo-icon.png"
                alt="PaperGrade AI"
                width={26}
                height={26}
                className="h-6 w-6 object-contain shrink-0"
              />
              <span className="text-sm font-bold text-white tracking-tight">
                PaperGrade <span className="text-primary font-semibold">AI</span>
              </span>
            </div>
            <p className="text-xs text-[#9b9994] leading-relaxed max-w-sm">
              Infrastructure for handwritten academic evaluations, itemized marking rubrics, and institutional grading integrity.
            </p>
            <div className="pt-1 flex items-center gap-2 text-[11px] font-mono text-[#71706c]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-green shrink-0" />
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
                  <Link href="/auth/login?role=student" className="hover:text-white transition-colors">
                    Examination Portal
                  </Link>
                </li>
                <li>
                  <Link href="/auth/login?role=claim" className="hover:text-white transition-colors">
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
                  <Link href="/auth/login?role=student" className="hover:text-white transition-colors">
                    Student Login
                  </Link>
                </li>
                <li>
                  <Link href="/auth/login?role=staff" className="hover:text-white transition-colors">
                    Staff Login
                  </Link>
                </li>
                <li>
                  <Link href="/auth/login?role=claim" className="hover:text-white transition-colors">
                    Claim Account
                  </Link>
                </li>
              </ul>
            </div>
          </div>

        </div>

        {/* 
          ========================================================================
          FADED BIG TYPOGRAPHY OF "PaperGrade AI"
          Requested architectural element grounding the footer
          ========================================================================
        */}
        <div className="w-full overflow-hidden text-center select-none pointer-events-none pt-8 sm:pt-14 pb-2 px-2">
          <span className="text-3xl min-[400px]:text-4xl sm:text-6xl md:text-8xl lg:text-[112px] xl:text-[132px] font-black tracking-tighter text-white/[0.05] uppercase select-none block leading-none truncate sm:overflow-visible">
            PaperGrade AI
          </span>
        </div>

        {/* Bottom Legal / Copyright Row */}
        <div className="max-w-5xl mx-auto w-full pt-4 border-t border-[#242422] flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-[#6d6c68] font-mono">
          <div>© {new Date().getFullYear()} PaperGrade AI • All rights reserved.</div>
          <div>Academic Evaluation Architecture</div>
        </div>
      </footer>
    </div>
  );
}
