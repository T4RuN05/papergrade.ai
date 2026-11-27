"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * Simulates PaperGrade's DocumentViewer + AnnotationBoundingBox + PageScoreStamp.
 * Alternates spotlight cleanly between Q2 (Full Marks) and Q3 (Partial Deduction)
 * every ~3.4s while keeping the matching rubric rationale lit on the right.
 */
export function SheetMappingMicro() {
  const [focusedQ, setFocusedQ] = useState<"Q2" | "Q3">("Q2");

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const timer = setInterval(() => {
      setFocusedQ((prev) => (prev === "Q2" ? "Q3" : "Q2"));
    }, 4600);
    return () => clearInterval(timer);
  }, []);

  const isQ2 = focusedQ === "Q2";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 select-none">
      {/* Left: Warm Paper Handwritten Sheet */}
      <div className="sm:col-span-7 relative rounded-md border border-hairline bg-[#fbfaf7] dark:bg-[#191918] p-3.5 overflow-hidden">
        {/* Ruled Notebook Lines */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-45 dark:opacity-15"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent, transparent 23px, #e4dfd7 23px, #e4dfd7 24px)",
            backgroundPositionY: "14px",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-6 w-px bg-rose-300/60 dark:bg-rose-400/20"
        />

        {/* Real PageScoreStamp Corner Accent */}
        <div className="absolute top-2 right-2 z-20 rounded-md border border-dashed border-red-600/85 bg-white/95 dark:bg-[#1e1616]/95 px-2 py-1 shadow-2xs">
          <div className="text-[7px] font-semibold text-red-700 dark:text-red-400 leading-none">
            Total Marks
          </div>
          <div className="text-xs font-black font-mono text-red-600 dark:text-red-400 tabular-nums leading-tight">
            44.5 <span className="text-[9px] font-normal opacity-70">/ 50</span>
          </div>
        </div>

        <div className="relative z-10 pl-4 space-y-6 pt-3">
          {/* Q2 Annotation Box */}
          <div
            onClick={() => setFocusedQ("Q2")}
            className={`relative rounded-xs p-2 border-2 transition-all duration-500 cursor-pointer ${
              isQ2
                ? "border-emerald-600 dark:border-emerald-400 bg-emerald-600/[0.08] opacity-100 scale-[1.01]"
                : "border-emerald-600/35 dark:border-emerald-400/25 bg-transparent opacity-55"
            }`}
          >
            <div className="-top-4 left-0 absolute inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-[9px] font-bold bg-emerald-600 text-white shadow-2xs">
              <CheckCircle2 className="h-2.5 w-2.5" />
              <span>Q2 — 4.5 / 5</span>
            </div>
            <div className="font-mono text-[10px] sm:text-[11px] text-[#1f2c3d] dark:text-[#d5d4d0] space-y-0.5 leading-snug pt-0.5">
              <div>F = m·a = (2.5 kg)(4.0 m/s²)</div>
              <div>F = 10.0 N · Direction: +x</div>
            </div>
          </div>

          {/* Q3 Annotation Box */}
          <div
            onClick={() => setFocusedQ("Q3")}
            className={`relative rounded-xs p-2 border-2 transition-all duration-500 cursor-pointer ${
              !isQ2
                ? "border-amber-500 dark:border-amber-400 bg-amber-500/[0.09] opacity-100 scale-[1.01]"
                : "border-amber-500/35 dark:border-amber-400/25 bg-transparent opacity-55"
            }`}
          >
            <div className="-top-4 left-0 absolute inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-[9px] font-bold bg-amber-500 text-white shadow-2xs">
              <AlertTriangle className="h-2.5 w-2.5" />
              <span>Q3 — 2.0 / 4</span>
            </div>
            <div className="font-mono text-[10px] sm:text-[11px] text-[#1f2c3d] dark:text-[#d5d4d0] space-y-0.5 leading-snug pt-0.5">
              <div>K = ½ m v² = ½ (2.5)(16)</div>
              <div className="text-ink-muted">Final unit omitted after value</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Synced Step Criteria Rationale */}
      <div className="sm:col-span-5 rounded-md border border-hairline bg-canvas-soft p-3 flex flex-col justify-between space-y-2.5">
        <div className="space-y-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-hairline">
            <span className="text-[11px] font-semibold text-ink">
              {isQ2 ? "Q2 · Newton's Second Law" : "Q3 · Kinetic Energy"}
            </span>
            <span
              className={`font-mono text-[11px] font-bold tabular-nums ${
                isQ2 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {isQ2 ? "4.5 / 5.0" : "2.0 / 4.0"}
            </span>
          </div>

          {isQ2 ? (
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between text-ink-secondary">
                <span>Vector equation</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">+2.0</span>
              </div>
              <div className="flex items-center justify-between text-ink-secondary">
                <span>Substitution &amp; SI units</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">+2.5</span>
              </div>
              <div className="flex items-center justify-between text-ink-muted">
                <span>Sign convention note</span>
                <span className="font-mono font-semibold">0.0 / 0.5</span>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between text-ink-secondary">
                <span>Expression K = ½mv²</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">+1.5</span>
              </div>
              <div className="flex items-center justify-between text-ink-secondary">
                <span>Arithmetic setup</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">+0.5</span>
              </div>
              <div className="flex items-center justify-between text-ink-muted">
                <span>Joule unit &amp; final box</span>
                <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">0.0 / 2.0</span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xs border border-hairline bg-surface px-2.5 py-2 text-[10.5px] text-ink-muted leading-snug">
          {isQ2
            ? "Mapped to Page 2 · Box B-1. Formula and SI calculation match approved key."
            : "Mapped to Page 2 · Box B-2. Missing unit check deducted 2.0 marks per rubric."}
        </div>
      </div>
    </div>
  );
}
