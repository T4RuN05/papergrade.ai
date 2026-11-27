"use client";

import React, { useEffect, useState } from "react";
import { Lock, Check, Sparkles } from "lucide-react";

/**
 * Simulates PaperGrade's RubricSectionsCard + RubricQuestionCard:
 * Highlights step criteria and shows Best-of-N optional section evaluation.
 */
export function RubricLockMicro() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(2);
      return;
    }
    const timer = setInterval(() => {
      setStep((prev) => (prev + 1) % 3);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-2.5 select-none">
      {/* Section Header Pill */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-hairline bg-canvas-soft text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded-xs bg-surface border border-hairline text-ink">
            Sec B
          </span>
          <span className="font-medium text-ink truncate">Best 2 of 3 Questions</span>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
          <Lock className="h-3 w-3" />
          <span>Locked</span>
        </span>
      </div>

      {/* Question Card */}
      <div className="rounded-md border border-hairline bg-surface p-3 space-y-2">
        <div className="flex items-center justify-between pb-2 border-b border-hairline text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-ink">
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>Q4 · Gauss Divergence</span>
          </div>
          <span className="font-mono text-[11px] font-semibold text-ink tabular-nums">
            6.0 Marks
          </span>
        </div>

        <div className="space-y-1.5">
          {[
            { label: "1. Spherical divergence setup", val: "2.0m" },
            { label: "2. Volume integral bounds", val: "2.5m" },
            { label: "3. Final scalar reduction", val: "1.5m" },
          ].map((item, idx) => {
            const active = step === idx;
            return (
              <div
                key={item.label}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-xs border text-[11px] transition-all duration-400 ${
                  active
                    ? "border-primary/40 bg-primary/[0.06] text-ink font-medium"
                    : "border-hairline bg-canvas-soft/60 text-ink-muted"
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Check
                    className={`h-3 w-3 shrink-0 transition-colors ${
                      active ? "text-primary" : "text-ink-faint"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="font-mono tabular-nums font-semibold shrink-0 ml-2 text-ink">
                  {item.val}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Best-of-N Status Strip */}
      <div className="grid grid-cols-3 gap-1.5 text-[10.5px] font-mono">
        <div className="px-2 py-1 rounded-xs border border-hairline bg-canvas-soft text-ink flex items-center justify-between">
          <span>Q4</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">5.5</span>
        </div>
        <div className="px-2 py-1 rounded-xs border border-hairline bg-canvas-soft text-ink flex items-center justify-between">
          <span>Q5</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">6.0</span>
        </div>
        <div className="px-2 py-1 rounded-xs border border-dashed border-hairline bg-surface text-ink-faint flex items-center justify-between line-through">
          <span>Q6</span>
          <span>3.0</span>
        </div>
      </div>
    </div>
  );
}
