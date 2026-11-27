"use client";

import React, { useEffect, useState } from "react";
import { Clock, Moon, CheckCircle2 } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

/**
 * Reflects PaperGrade's submission & batch cadence:
 * Live exam window captures uninterrupted student scans ->
 * Batch queue evaluates queued scripts for faculty publication.
 */
export function ScheduleQueueMicro() {
  const [phase, setPhase] = useState<"day" | "night">("day");

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const timer = setInterval(() => {
      setPhase((prev) => (prev === "day" ? "night" : "day"));
    }, 4800);
    return () => clearInterval(timer);
  }, []);

  const isDay = phase === "day";

  return (
    <div className="space-y-2.5 select-none">
      {/* Phase Toggle Strip */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-md border border-hairline bg-canvas-soft text-[11px] font-medium">
        <button
          type="button"
          onClick={() => setPhase("day")}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-xs transition-colors cursor-pointer ${
            isDay ? "bg-surface text-ink shadow-2xs border border-hairline" : "text-ink-muted"
          }`}
        >
          <Clock className="h-3 w-3 text-emerald-600" />
          <span>Class Hours</span>
        </button>
        <button
          type="button"
          onClick={() => setPhase("night")}
          className={`flex items-center justify-center gap-1.5 py-1.5 rounded-xs transition-colors cursor-pointer ${
            !isDay ? "bg-surface text-ink shadow-2xs border border-hairline" : "text-ink-muted"
          }`}
        >
          <Moon className="h-3 w-3 text-primary" />
          <span>Batch Queue</span>
        </button>
      </div>

      {/* Live Status Well */}
      <div className="rounded-md border border-hairline bg-canvas-soft p-3 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-ink">
            {isDay ? "Submission Window Open" : "Batch Evaluation Active"}
          </span>
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-xs bg-surface border border-hairline text-ink tabular-nums">
            {isDay ? "11:42 left" : "Queued Batch"}
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-ink-muted">
            <span>{isDay ? "Sheets collected" : "Scripts graded"}</span>
            <span className="font-mono font-semibold text-ink tabular-nums inline-flex items-baseline gap-1">
              <AnimatedNumber
                value={isDay ? 46 : 48}
                useContinuous
                animateOnMount={false}
                format={{ maximumFractionDigits: 0 }}
              />
              <span className="text-ink-muted font-normal">/ 48</span>
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface border border-hairline overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                isDay ? "w-[92%] bg-emerald-500" : "w-full bg-primary"
              }`}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 text-[11px] text-ink-muted border-t border-hairline">
          <span>
            {isDay ? "Accepting student uploads" : "Ready for faculty review"}
          </span>
          <CheckCircle2
            className={`h-3.5 w-3.5 shrink-0 ${
              isDay ? "text-emerald-600" : "text-primary"
            }`}
          />
        </div>
      </div>
    </div>
  );
}
