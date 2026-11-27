"use client";

import React, { useEffect, useState } from "react";
import {
  Clock,
  CheckCircle2,
  Check,
  Flag,
  ShieldCheck,
  Play,
  Pause,
  Trophy,
  Lock,
  FileSpreadsheet,
  Sparkles,
} from "lucide-react";
import { SpotlightFrame } from "./SpotlightFrame";
import { WordRevealText } from "./ScrollReveal";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

interface ActConfig {
  id: string;
  code: string;
  label: string;
  caption: string;
  durationMs: number;
  mobileSyncLabel: string;
}

const ACTS: ActConfig[] = [
  {
    id: "collect",
    code: "01",
    label: "Collect",
    caption: "Timed windows collect sheets autonomously.",
    durationMs: 5400,
    mobileSyncLabel: "Batch Alpha · 47/48 scripts synced in live queue",
  },
  {
    id: "rubric",
    code: "02",
    label: "Rubric",
    caption: "One locked scheme governs every script.",
    durationMs: 5400,
    mobileSyncLabel: "48 queued scripts bound to locked step rubric",
  },
  {
    id: "annotate",
    code: "03",
    label: "Grade",
    caption: "Parallel grading maps answers onto paper.",
    durationMs: 6200,
    mobileSyncLabel: "Parallel queue grading batch scripts concurrently",
  },
  {
    id: "appeal",
    code: "04",
    label: "Appeal",
    caption: "Appeals route straight back to faculty.",
    durationMs: 5200,
    mobileSyncLabel: "Marks ledger & rank #2 updated live on revision",
  },
  {
    id: "publish",
    code: "05",
    label: "Publish",
    caption: "Verified marks flow to student portals.",
    durationMs: 5600,
    mobileSyncLabel: "Standings published · Student trajectory updated",
  },
];

/**
 * Connected 2-layer causal studio pipeline inside PaperGrade's Notion dark stage.
 * Uses diagonal non-linear layering over whitespace pockets so critical names/metrics
 * stay readable while the background unblurs first (0ms) and foreground lands at +140ms.
 */
export function HeroMotionStage() {
  const [actIndex, setActIndex] = useState(0);
  const [subBeat, setSubBeat] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setReducedMotion(true);
      setIsPlaying(false);
      setActIndex(2);
      setSubBeat(2);
    }
    const onChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
      if (e.matches) {
        setIsPlaying(false);
        setSubBeat(2);
      }
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      setSubBeat(2);
      return;
    }
    setSubBeat(0);
    const current = ACTS[actIndex];
    const t1 = setTimeout(() => setSubBeat(1), Math.round(current.durationMs * 0.34));
    const t2 = setTimeout(() => setSubBeat(2), Math.round(current.durationMs * 0.66));
    const tNext = setTimeout(() => {
      setActIndex((prev) => (prev + 1) % ACTS.length);
    }, current.durationMs);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(tNext);
    };
  }, [actIndex, isPlaying]);

  const activeAct = ACTS[actIndex];

  const handleSelectAct = (idx: number) => {
    setActIndex(idx);
    setSubBeat(isPlaying ? 0 : 2);
  };

  return (
    <SpotlightFrame variant="studio" className="w-full">
      <div className="px-4 sm:px-7 pt-6 sm:pt-8 pb-5 sm:pb-7">
        {/* Top Word-by-Word Kinetic Caption */}
        <div className="flex flex-col items-center text-center mb-5 sm:mb-7 min-h-[54px] justify-center">
          <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-[#8f96a3] mb-1">
            <span className="text-[#56a8f5] font-semibold">{activeAct.code}</span>
            <span>/</span>
            <span>{activeAct.label}</span>
          </div>
          <p
            key={activeAct.id}
            className="text-lg sm:text-2xl font-semibold tracking-tight text-white"
          >
            <WordRevealText text={activeAct.caption} baseDelayMs={30} stepMs={48} />
          </p>
        </div>

        {/* Connected Diagonal 2-Layer Causal Stage */}
        <div
          key={activeAct.id}
          className="relative mx-auto max-w-4xl md:min-h-[372px] flex flex-col justify-center"
        >
          {/* ==============================================================
              ACT 01: COLLECT (Diagonal Top-Left Fg over Bottom-Right Roster)
              ============================================================== */}
          {activeAct.id === "collect" && (
            <div className="relative flex flex-col md:block md:min-h-[364px]">
              {/* Backplane (Bottom-Right diagonal zone; essential rows sit clear right/bottom) */}
              <div className="hidden md:block absolute top-14 bottom-0 right-0 w-[68%] z-10 landing-mask-right pointer-events-none select-none animate-landing-backplane-in">
                <div className="h-full rounded-lg border border-white/10 bg-[#181817] p-4 flex flex-col justify-between space-y-2.5">
                  <div className="flex items-center justify-end gap-4 border-b border-white/10 pb-2 text-[11px]">
                    <span className="font-semibold text-white/85">Batch Alpha · Live Queue</span>
                    <span className="font-mono text-emerald-400 tabular-nums">
                      <AnimatedNumber
                        value={45 + Math.min(subBeat, 2)}
                        useContinuous
                        animateOnMount={false}
                        format={{ maximumFractionDigits: 0 }}
                      />{" "}
                      / 48 Uploaded
                    </span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    {[
                      { meta: "14:52 IST", name: "Aarav Sharma", state: "Synced ✓", tone: "emerald" },
                      { meta: "14:54 IST", name: "Diya Patel", state: "Synced ✓", tone: "emerald" },
                      {
                        meta: "14:56 IST",
                        name: "Karan Verma",
                        state: subBeat >= 1 ? "Synced ✓" : "Compiling PDF...",
                        tone: subBeat >= 1 ? "emerald" : "blue",
                      },
                      {
                        meta: "BVI-C2-004",
                        name: "Ananya Bhattacharya",
                        state:
                          subBeat === 0
                            ? "Capturing 3 pgs..."
                            : subBeat === 1
                            ? "Uploading PDF..."
                            : "Recorded ✓",
                        tone: subBeat >= 2 ? "emerald" : "blue",
                        highlight: true,
                      },
                      { meta: "BVI-C2-005", name: "Rohan Mehta", state: "Scanning...", tone: "muted" },
                    ].map((row) => (
                      <div
                        key={row.name}
                        className={`flex items-center justify-between pl-28 pr-3 py-2 rounded-md border transition-all duration-400 ${
                          row.highlight
                            ? "border-[#2383e2]/45 bg-[#2383e2]/[0.09]"
                            : "border-white/5 bg-[#131312]"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-[10px] text-white/35 hidden lg:inline shrink-0">
                            {row.meta}
                          </span>
                          <span className="text-white/90 font-medium truncate">{row.name}</span>
                        </div>
                        <span
                          className={`font-mono text-[10px] shrink-0 ml-3 ${
                            row.tone === "emerald"
                              ? "text-emerald-400"
                              : row.tone === "blue"
                              ? "text-[#6cb6ff]"
                              : "text-white/35"
                          }`}
                        >
                          {row.state}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Foreground (Top-Left diagonal float overlapping quiet left spacer) */}
              <div className="relative z-20 w-full md:w-[46%] md:mr-auto rounded-lg border border-white/15 bg-[#1d1d1c] p-4 sm:p-5 space-y-3.5 shadow-[28px_28px_72px_-8px_rgba(0,0,0,0.96),0_10px_28px_rgba(0,0,0,0.78)] animate-landing-overlay-in">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-md bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400 relative shrink-0">
                      <Clock className="h-4 w-4" />
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 border border-[#1d1d1c]" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">Submission Window</div>
                      <div className="text-[11px] text-white/55">Physics Mock Test 02</div>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#121211] border border-white/10 font-mono text-xs font-semibold text-white tabular-nums">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span>
                      14:
                      <AnimatedNumber
                        value={58 - Math.min(subBeat, 2)}
                        useContinuous
                        animateOnMount={false}
                        format={{ minimumIntegerDigits: 2, maximumFractionDigits: 0 }}
                      />
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { page: "Pg 1", topic: "Q1 – Q2" },
                    { page: "Pg 2", topic: "Q3 Carnot" },
                    { page: "Pg 3", topic: "Q4 Cycle" },
                  ].map((sheet, idx) => {
                    const active = subBeat >= idx || reducedMotion;
                    return (
                      <div
                        key={sheet.page}
                        className={`rounded-md border p-2 transition-all duration-400 ${
                          active
                            ? "border-[#2383e2]/50 bg-[#2383e2]/[0.09] opacity-100 translate-y-0"
                            : "border-white/10 bg-[#141413] opacity-40 translate-y-1.5"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-white/60 mb-1.5">
                          <span>{sheet.page}</span>
                          {active && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                        </div>
                        <div className="font-mono text-[9.5px] text-white/80 leading-tight truncate">
                          {sheet.topic}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div
                  className={`flex items-center justify-between px-3 py-2 rounded-md border text-xs transition-all duration-400 ${
                    subBeat >= 2
                      ? "bg-emerald-500/12 border-emerald-400/30 text-emerald-300"
                      : "bg-[#141413] border-white/10 text-white/65"
                  }`}
                >
                  <span className="font-mono text-[11px]">BVI-C2-004 · 3 pages</span>
                  <span className="font-medium flex items-center gap-1">
                    {subBeat >= 2 ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Synced</span>
                      </>
                    ) : (
                      <span>Compiling...</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              ACT 02: RUBRIC (Diagonal Bottom-Right Fg over Top-Left Queue)
              ============================================================== */}
          {activeAct.id === "rubric" && (
            <div className="relative flex flex-col md:block md:min-h-[364px]">
              {/* Backplane (Top-Left diagonal zone; essential rows packed inside exposed left 62%) */}
              <div className="hidden md:block absolute top-0 bottom-14 left-0 w-[68%] z-10 landing-mask-left pointer-events-none select-none animate-landing-backplane-in">
                <div className="h-full rounded-lg border border-white/10 bg-[#181817] p-4 space-y-2.5">
                  <div className="flex items-center justify-between pr-36 border-b border-white/10 pb-2 text-[11px]">
                    <span className="font-semibold text-white/85">Batch Evaluation Queue</span>
                    <span
                      className={`font-mono transition-colors ${
                        subBeat >= 2 ? "text-[#6cb6ff]" : "text-white/45"
                      }`}
                    >
                      {subBeat >= 2 ? "48 Bound" : "Awaiting Lock"}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    {[
                      { roll: "Script #101 · Aarav S.", pgs: "6 pgs" },
                      { roll: "Script #102 · Diya P.", pgs: "5 pgs" },
                      { roll: "Script #103 · Karan V.", pgs: "6 pgs" },
                      { roll: "Script #104 · Ananya B.", pgs: "6 pgs" },
                    ].map((item, idx) => {
                      const ready = subBeat >= 2 || (subBeat === 1 && idx < 2);
                      return (
                        <div
                          key={item.roll}
                          className={`flex items-center justify-between pl-3 pr-36 py-2 rounded-md border transition-all duration-400 ${
                            ready
                              ? "border-[#2383e2]/35 bg-[#2383e2]/[0.07]"
                              : "border-white/5 bg-[#131312]"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-white/85 font-medium truncate">{item.roll}</span>
                            <span className="font-mono text-[10px] text-white/35 shrink-0">
                              {item.pgs}
                            </span>
                          </div>
                          <span
                            className={`font-mono text-[10px] shrink-0 ${
                              ready ? "text-emerald-400" : "text-white/35"
                            }`}
                          >
                            {ready ? "Bound ✓" : "Waiting"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Foreground (Bottom-Right diagonal overlap over quiet bottom-right tail) */}
              <div className="relative z-20 w-full md:w-[50%] md:ml-auto md:mt-20 rounded-lg border border-white/15 bg-[#1d1d1c] p-4 sm:p-5 space-y-3 shadow-[-28px_-14px_72px_-8px_rgba(0,0,0,0.96),0_12px_30px_rgba(0,0,0,0.78)] animate-landing-overlay-in">
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/10">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded-xs bg-[#121211] border border-white/15 font-mono text-xs font-semibold text-white">
                      Q3
                    </span>
                    <span className="text-xs font-semibold text-white truncate">
                      Carnot Engine Efficiency
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${
                      subBeat >= 2
                        ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-300"
                        : "bg-white/5 border-white/15 text-white/65"
                    }`}
                  >
                    <Lock className="h-2.5 w-2.5" />
                    <span>{subBeat >= 2 ? "Locked ✓" : "Configuring"}</span>
                  </span>
                </div>

                <div className="rounded-md border border-white/10 bg-[#141413] px-3 py-2 flex items-center justify-between text-[11px] gap-2">
                  <span className="text-white/50 shrink-0">Model Key</span>
                  <span className="font-mono text-white/90 truncate">
                    η = 1 − (T_c / T_h) = 50%
                  </span>
                </div>

                <div className="space-y-1.5">
                  {[
                    { desc: "Carnot formula statement", marks: "+2.0m" },
                    { desc: "Kelvin temperature substitution", marks: "+1.5m" },
                    { desc: "Scalar computation & percentage", marks: "+1.5m" },
                  ].map((crit, idx) => {
                    const lit = subBeat >= idx || reducedMotion;
                    return (
                      <div
                        key={crit.desc}
                        className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-md border transition-all duration-400 ${
                          lit
                            ? "border-[#2383e2]/45 bg-[#2383e2]/[0.1]"
                            : "border-white/8 bg-[#161615] opacity-50"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 ${
                              lit ? "bg-[#2383e2] text-white" : "border border-white/20 text-transparent"
                            }`}
                          >
                            <Check className="h-2.5 w-2.5" />
                          </span>
                          <span className="text-xs text-white/90 truncate">{crit.desc}</span>
                        </div>
                        <span className="font-mono text-xs font-semibold text-[#6cb6ff] tabular-nums shrink-0">
                          {crit.marks}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              ACT 03: GRADE (Top-Left Sweeping Parallel Lane + Bottom-Right Inspection)
              ============================================================== */}
          {activeAct.id === "annotate" && (
            <div className="relative flex flex-col md:block md:min-h-[372px]">
              {/* Backplane Top: Gliding Horizontal Conveyor Lane — cards grade as they cross center */}
              <div className="hidden md:block relative landing-mask-lane z-10 pointer-events-none select-none overflow-hidden animate-landing-backplane-in pt-3">
                {/* Subtle Center Evaluation Gate Hairline */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-0 bottom-4 -translate-x-1/2 z-20 flex flex-col items-center"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#56a8f5] shadow-[0_0_8px_rgba(86,168,245,0.85)]" />
                  <div className="w-px flex-1 bg-gradient-to-b from-[#56a8f5]/60 via-[#56a8f5]/25 to-transparent" />
                </div>

                {/* Horizontally Gliding Student Script Conveyor Track */}
                <div
                  className={`flex gap-3 w-[142%] ${
                    isPlaying && !reducedMotion ? "animate-landing-conveyor" : ""
                  }`}
                >
                  {[
                    {
                      id: "Script #101 · Aarav S.",
                      status: "Graded 47.0/50 ✓",
                      elapsed: "00:08s",
                      state: "graded" as const,
                    },
                    {
                      id: "Script #102 · Diya P.",
                      status: subBeat >= 1 ? "Graded 43.0/50 ✓" : "Scoring Q4...",
                      elapsed: subBeat >= 1 ? "00:11s" : "00:09s",
                      state: subBeat >= 1 ? ("graded" as const) : ("active" as const),
                    },
                    {
                      id: "Script #103 · Karan V.",
                      status:
                        subBeat >= 2
                          ? "Graded 41.5/50 ✓"
                          : subBeat === 1
                          ? "Mapping Q3..."
                          : "Queued · 6 pgs",
                      elapsed: subBeat >= 2 ? "00:14s" : subBeat === 1 ? "00:05s" : "Waiting",
                      state:
                        subBeat >= 2
                          ? ("graded" as const)
                          : subBeat === 1
                          ? ("active" as const)
                          : ("queued" as const),
                    },
                    {
                      id: "Script #104 · Ananya B.",
                      status: subBeat >= 2 ? "Mapping Sheet..." : "Queued · 6 pgs",
                      elapsed: subBeat >= 2 ? "00:03s" : "Waiting",
                      state: subBeat >= 2 ? ("active" as const) : ("queued" as const),
                    },
                    {
                      id: "Script #105 · Rohan M.",
                      status: "Queued · 5 pgs",
                      elapsed: "Waiting",
                      state: "queued" as const,
                    },
                  ].map((worker) => (
                    <div
                      key={worker.id}
                      className={`flex-1 min-w-[215px] rounded-lg border px-3.5 pt-3 pb-10 space-y-1 transition-colors duration-700 ${
                        worker.state === "active"
                          ? "border-[#2383e2]/45 bg-[#1b222c]"
                          : worker.state === "graded"
                          ? "border-emerald-500/25 bg-[#171d19]"
                          : "border-white/10 bg-[#181817]"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-white/90 truncate flex items-center gap-1.5">
                          <Sparkles
                            className={`h-3 w-3 shrink-0 transition-colors duration-500 ${
                              worker.state === "graded"
                                ? "text-emerald-400"
                                : worker.state === "active"
                                ? "text-[#56a8f5]"
                                : "text-white/30"
                            }`}
                          />
                          <span className="truncate">{worker.id}</span>
                        </span>
                        <span className="font-mono text-[10px] text-white/40 shrink-0">
                          {worker.elapsed}
                        </span>
                      </div>
                      <div
                        className={`text-[11px] font-mono transition-colors duration-500 ${
                          worker.state === "graded"
                            ? "text-emerald-400"
                            : worker.state === "active"
                            ? "text-[#6cb6ff]"
                            : "text-white/40"
                        }`}
                      >
                        {worker.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Foreground Diagonal Bottom-Right Sheet Inspection overlapping lower padding cleanly */}
              <div className="relative z-20 md:-mt-8 md:ml-auto md:w-[82%] grid grid-cols-1 sm:grid-cols-12 gap-3 rounded-xl border border-white/15 bg-[#1b1b1a]/95 p-3.5 sm:p-4 shadow-[0_28px_80px_rgba(0,0,0,0.96),0_10px_28px_rgba(0,0,0,0.78)] animate-landing-overlay-in">
                <div className="sm:col-span-7 relative rounded-lg border border-white/15 bg-[#fbfaf7] text-[#1a1a19] p-3.5 overflow-hidden min-h-[218px]">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-45"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(to bottom, transparent, transparent 23px, #e7e3dc 23px, #e7e3dc 24px)",
                      backgroundPositionY: "14px",
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-6 w-px bg-rose-300/60"
                  />

                  <div
                    className={`absolute top-2.5 right-2.5 z-20 rounded-md border-2 border-dashed border-red-600/90 bg-white/95 px-2.5 py-1 shadow-xs transition-all duration-500 ${
                      subBeat >= 2
                        ? "opacity-100 scale-100 rotate-0"
                        : "opacity-0 scale-110 -rotate-2"
                    }`}
                  >
                    <div className="text-[7.5px] font-semibold text-red-700 leading-none">
                      Total Marks
                    </div>
                    <div className="text-sm font-black text-red-600 font-mono leading-tight tabular-nums">
                      <AnimatedNumber
                        value={subBeat >= 2 ? 44.5 : 40.0}
                        format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                        animateOnMount={false}
                      />{" "}
                      <span className="text-[9.5px] font-normal text-red-600/70">/ 50</span>
                    </div>
                  </div>

                  {subBeat === 0 && !reducedMotion && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-0 h-14 z-30 animate-landing-beam"
                      style={{
                        background:
                          "linear-gradient(180deg, transparent 0%, rgba(0,117,222,0.18) 50%, rgba(0,117,222,0.55) 100%)",
                        borderBottom: "1.5px solid #0075de",
                      }}
                    />
                  )}

                  <div className="relative z-10 pl-4 space-y-5 pt-2.5">
                    <div
                      className={`relative rounded-xs p-2 transition-all duration-500 ${
                        subBeat >= 1
                          ? "border-2 border-emerald-600 bg-emerald-600/[0.07]"
                          : "border-2 border-transparent"
                      }`}
                    >
                      <div
                        className={`-top-4 left-0 absolute inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-[9px] font-bold bg-emerald-600 text-white transition-opacity duration-300 ${
                          subBeat >= 1 ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        <span>Q3 — 5/5</span>
                      </div>
                      <div className="font-mono text-[10.5px] text-[#1d2d44] space-y-0.5 leading-snug pt-0.5">
                        <div className="font-semibold">Ans 3. η = 1 - (T_c / T_h)</div>
                        <div>= 1 - 300/600 = 0.50 (50%)</div>
                      </div>
                    </div>

                    <div
                      className={`relative rounded-xs p-2 transition-all duration-500 ${
                        subBeat >= 2
                          ? "border-2 border-amber-500 bg-amber-500/[0.08]"
                          : "border-2 border-transparent"
                      }`}
                    >
                      <div
                        className={`-top-4 left-0 absolute inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-[9px] font-bold bg-amber-500 text-white transition-opacity duration-300 ${
                          subBeat >= 2 ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        <span>Q4 — 2.5/4</span>
                      </div>
                      <div className="font-mono text-[10.5px] text-[#1d2d44] space-y-0.5 leading-snug pt-0.5">
                        <div className="font-semibold">Ans 4. W = nRT ln(V2/V1)</div>
                        <div className="text-[#5a564f]">Missing unit conversion step</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-5 rounded-lg border border-white/10 bg-[#141413] p-3 flex flex-col justify-between space-y-2.5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                      <span className="text-xs font-semibold text-white">BVI-C2-004 · Q3</span>
                      <span className="font-mono text-xs font-bold text-emerald-400">5.0 / 5.0</span>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center justify-between text-white/80">
                        <span>Formula</span>
                        <span className="font-mono text-emerald-400">+2.0</span>
                      </div>
                      <div className="flex items-center justify-between text-white/80">
                        <span>Substitution</span>
                        <span className="font-mono text-emerald-400">+1.5</span>
                      </div>
                      <div className="flex items-center justify-between text-white/80">
                        <span>Scalar Value</span>
                        <span className="font-mono text-emerald-400">+1.5</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-[#1b1b1a] p-2 text-[10.5px] text-white/70 leading-snug">
                    <span className="text-white/95 font-medium block mb-0.5">Q4 Deduction (-1.5m)</span>
                    Work integral setup verified; Joule conversion omitted in box.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              ACT 04: APPEAL (Diagonal Bottom-Left Fg over Top-Right Ledger)
              ============================================================== */}
          {activeAct.id === "appeal" && (
            <div className="relative flex flex-col md:block md:min-h-[364px]">
              {/* Backplane (Top-Right diagonal zone; essential Rank/Name/Marks packed right) */}
              <div className="hidden md:block absolute top-0 bottom-14 right-0 w-[68%] z-10 landing-mask-right pointer-events-none select-none animate-landing-backplane-in">
                <div className="h-full rounded-lg border border-white/10 bg-[#181817] p-4 space-y-2.5">
                  <div className="flex items-center justify-end gap-4 border-b border-white/10 pb-2 text-[11px]">
                    <span className="font-semibold text-white/85">Batch Alpha · Marks &amp; Appeals</span>
                    <span className="font-mono text-emerald-400">Live Sync</span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    {[
                      { rank: "#1", name: "Aarav Sharma", score: "47.0 / 50", status: "Published", ok: true },
                      {
                        rank: subBeat >= 2 ? "#2" : "#3",
                        name: "Ananya B.",
                        score: subBeat >= 2 ? "45.5 / 50" : "44.5 / 50",
                        status: subBeat >= 2 ? "Revised ✓" : "Appeal Open",
                        ok: subBeat >= 2,
                        highlight: true,
                      },
                      {
                        rank: subBeat >= 2 ? "#3" : "#2",
                        name: "Diya Patel",
                        score: "45.0 / 50",
                        status: "Published",
                        ok: true,
                      },
                      { rank: "#4", name: "Karan Verma", score: "41.5 / 50", status: "Published", ok: true },
                    ].map((row) => (
                      <div
                        key={row.name}
                        className={`flex items-center justify-between pl-28 pr-3 py-2 rounded-md border transition-all duration-500 ${
                          row.highlight
                            ? subBeat >= 2
                              ? "border-emerald-400/40 bg-emerald-500/[0.09]"
                              : "border-[#dd5b00]/40 bg-[#dd5b00]/[0.08]"
                            : "border-white/5 bg-[#131312]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[10px] font-bold text-[#6cb6ff] shrink-0">
                            {row.rank}
                          </span>
                          <span className="text-white/90 font-medium truncate">{row.name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 font-mono text-[10.5px]">
                          <span className="text-white/80 tabular-nums">{row.score}</span>
                          <span className={row.ok ? "text-emerald-400" : "text-[#ff9f5a]"}>
                            {row.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Foreground (Bottom-Left diagonal overlap over quiet left-bottom spacer) */}
              <div className="relative z-20 w-full md:w-[48%] md:mr-auto md:mt-20 rounded-lg border border-white/15 bg-[#1d1d1c] p-4 sm:p-5 space-y-3 shadow-[28px_-14px_72px_-8px_rgba(0,0,0,0.96),0_12px_30px_rgba(0,0,0,0.78)] animate-landing-overlay-in">
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#56a8f5]" />
                    <span className="text-xs font-semibold text-white">Revaluation Desk · Q4</span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all duration-300 ${
                      subBeat >= 2
                        ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-300"
                        : "bg-[#dd5b00]/15 border-[#dd5b00]/40 text-[#ff9f5a]"
                    }`}
                  >
                    {subBeat >= 2 ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Marks Revised</span>
                      </>
                    ) : (
                      <>
                        <Flag className="h-3 w-3" />
                        <span>Appeal Pending</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="rounded-md border border-white/10 bg-[#141413] p-2.5 space-y-1">
                  <div className="text-[10px] font-mono text-white/45 uppercase">
                    Ananya B. · Margin Crop Q4
                  </div>
                  <p className="text-xs italic text-white/85 leading-snug">
                    &ldquo;Final value in kJ was written in the top margin of page 3.&rdquo;
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div
                    className={`rounded-md border p-2.5 transition-all duration-300 ${
                      subBeat >= 1
                        ? "border-[#2383e2] bg-[#2383e2]/15"
                        : "border-white/10 bg-[#141413] opacity-65"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">Revise</span>
                      <span className="font-mono text-xs font-bold text-emerald-400 tabular-nums">
                        <AnimatedNumber
                          value={subBeat >= 1 ? 3.5 : 2.5}
                          format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                          animateOnMount={false}
                        />{" "}
                        / 4
                      </span>
                    </div>
                    <div className="text-[10px] text-white/55 mt-0.5">+1.0m &amp; audit logged</div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-[#141413] p-2.5 opacity-50">
                    <div className="text-xs font-medium text-white/75">Uphold</div>
                    <div className="text-[10px] text-white/45 mt-0.5">Faculty-only rule</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              ACT 05: PUBLISH (Diagonal Bottom-Right Trajectory over Top-Left Standings)
              ============================================================== */}
          {activeAct.id === "publish" && (
            <div className="relative flex flex-col md:block md:min-h-[364px]">
              {/* Backplane (Top-Left diagonal zone; Standings metrics packed inside left 60%) */}
              <div className="hidden md:block absolute top-0 bottom-14 left-0 w-[68%] z-10 landing-mask-left pointer-events-none select-none animate-landing-backplane-in">
                <div className="h-full rounded-lg border border-white/10 bg-[#181817] p-4 space-y-2.5">
                  <div className="flex items-center justify-between pr-40 border-b border-white/10 pb-2 text-[11px]">
                    <span className="font-semibold text-white/85 flex items-center gap-1.5">
                      <Trophy className="h-3.5 w-3.5 text-amber-400" />
                      <span>Published Standings</span>
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-emerald-400">
                      <FileSpreadsheet className="h-3 w-3" />
                      <span>CSV ✓</span>
                    </span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    {[
                      { rank: "#1", name: "Aarav Sharma", pct: "94.0%" },
                      { rank: "#2", name: "Ananya B.", pct: "91.0%" },
                      { rank: "#3", name: "Diya Patel", pct: "90.0%" },
                      { rank: "#4", name: "Karan Verma", pct: "83.0%" },
                    ].map((row) => (
                      <div
                        key={row.rank}
                        className="flex items-center justify-between pl-3 pr-40 py-2 rounded-md border border-white/5 bg-[#131312]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono text-[10px] font-bold text-[#6cb6ff]">
                            {row.rank}
                          </span>
                          <span className="text-white/90 font-medium truncate">{row.name}</span>
                        </div>
                        <span className="font-mono text-[10.5px] text-white/85 font-semibold shrink-0">
                          {row.pct}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Foreground (Bottom-Right diagonal trajectory card over right whitespace) */}
              <div className="relative z-20 w-full md:w-[51%] md:ml-auto md:mt-16 rounded-lg border border-white/15 bg-[#1d1d1c] p-4 sm:p-5 space-y-3 shadow-[-28px_-14px_72px_-8px_rgba(0,0,0,0.96),0_12px_30px_rgba(0,0,0,0.78)] animate-landing-overlay-in">
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div>
                    <div className="text-xs font-semibold text-white">Student Marks Trajectory</div>
                    <div className="text-[11px] text-white/55">Physics · 4 Published Tests</div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[10px] font-mono text-emerald-300">
                    <AnimatedNumber
                      value={91.0}
                      suffix="%"
                      format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                    />{" "}
                    Latest
                  </span>
                </div>

                <svg viewBox="0 0 230 100" className="w-full h-24 overflow-visible">
                  <line
                    x1="8"
                    y1="24"
                    x2="222"
                    y2="24"
                    stroke="rgba(255,255,255,0.08)"
                    strokeDasharray="3 3"
                  />
                  <line
                    x1="8"
                    y1="50"
                    x2="222"
                    y2="50"
                    stroke="rgba(168,85,247,0.4)"
                    strokeDasharray="4 4"
                  />
                  <line x1="8" y1="84" x2="222" y2="84" stroke="rgba(255,255,255,0.1)" />
                  <path
                    d="M 14 70 C 48 64, 58 44, 86 48 C 118 52, 132 30, 160 32 C 184 34, 198 16, 214 12"
                    fill="none"
                    stroke="#2383e2"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="animate-landing-curve"
                  />
                  {[
                    { x: 14, y: 70, fill: "#2383e2" },
                    { x: 86, y: 48, fill: "#2383e2" },
                    { x: 160, y: 32, fill: "#10b981" },
                    { x: 214, y: 12, fill: "#10b981" },
                  ].map((pt, i) => (
                    <circle
                      key={i}
                      cx={pt.x}
                      cy={pt.y}
                      r="3.75"
                      fill={pt.fill}
                      stroke="#1d1d1c"
                      strokeWidth="1.5"
                    />
                  ))}
                </svg>

                <div className="flex items-center justify-between text-[11px] font-mono text-white/60 pt-2 border-t border-white/10">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span>Appeal Upgraded Node</span>
                  </span>
                  <span className="text-white font-semibold tabular-nums">
                    Avg{" "}
                    <AnimatedNumber
                      value={81.4}
                      suffix="%"
                      format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                    />
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Mobile Synchronized Background Context Pill */}
          <div className="mt-3 md:hidden flex items-center justify-between px-3 py-2 rounded-md border border-white/10 bg-[#10100f] text-[11px] text-white/70">
            <span className="flex items-center gap-2 truncate">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="truncate">{activeAct.mobileSyncLabel}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Interactive Timeline Controls */}
      <div className="border-t border-white/10 bg-[#10100f] px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {ACTS.map((act, idx) => {
            const isActive = idx === actIndex;
            return (
              <button
                key={act.id}
                type="button"
                onClick={() => handleSelectAct(idx)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  isActive
                    ? "bg-white/12 text-white border border-white/15"
                    : "text-white/50 hover:text-white/85 border border-transparent"
                }`}
              >
                <span
                  className={`font-mono text-[10px] ${
                    isActive ? "text-[#56a8f5]" : "text-white/35"
                  }`}
                >
                  {act.code}
                </span>
                <span>{act.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setIsPlaying((p) => !p)}
          aria-label={isPlaying ? "Pause workflow preview" : "Play workflow preview"}
          className="h-7 w-7 rounded-md border border-white/12 bg-white/[0.04] hover:bg-white/[0.1] text-white/75 hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
          title={isPlaying ? "Pause sequence" : "Play sequence"}
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
        </button>
      </div>
    </SpotlightFrame>
  );
}
