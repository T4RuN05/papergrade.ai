"use client";

import React, { useEffect, useState } from "react";
import { ShieldCheck, CheckCircle2, Flag } from "lucide-react";

/**
 * Simulates PaperGrade's human-only Revaluation Desk (AdminRevaluationModal).
 * Transitions calmly from student appeal pending to faculty mark revision with audit log.
 */
export function HumanAppealMicro() {
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setResolved(true);
      return;
    }
    const timer = setInterval(() => {
      setResolved((prev) => !prev);
    }, 4600);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 select-none">
      {/* Left: Cropped Student Handwritten Region + Grievance */}
      <div className="sm:col-span-6 rounded-md border border-hairline bg-canvas-soft p-3 space-y-2.5 flex flex-col justify-between">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-mono font-semibold text-ink">Q4 · Crop Region</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors duration-400 ${
                resolved
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                  : "bg-[#faf4ec] border-[#e8dac5] text-[#7a4e18] dark:bg-[#241a10] dark:border-[#422c17] dark:text-[#e5ad68]"
              }`}
            >
              {resolved ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Flag className="h-2.5 w-2.5" />}
              <span>{resolved ? "Marks Revised" : "Appeal Pending"}</span>
            </span>
          </div>

          <div className="rounded-xs border border-hairline bg-[#fbfaf7] dark:bg-[#191918] px-2.5 py-2 font-mono text-[10.5px] text-ink-secondary">
            <div>W = nRT ln(V₂/V₁) = 3.46 kJ</div>
            <div className="text-[10px] text-ink-muted mt-0.5">(Written in margin continuation)</div>
          </div>
        </div>

        <p className="text-[11px] italic text-ink-secondary leading-snug bg-surface p-2 rounded-xs border border-hairline">
          &ldquo;Unit conversion was completed in the top margin box.&rdquo;
        </p>
      </div>

      {/* Right: Faculty Resolution Control */}
      <div className="sm:col-span-6 rounded-md border border-hairline bg-surface p-3 flex flex-col justify-between space-y-2.5">
        <div className="flex items-center justify-between pb-1.5 border-b border-hairline">
          <span className="text-[11px] font-semibold text-ink flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span>Faculty Decision</span>
          </span>
          <span className="font-mono text-xs font-bold text-ink tabular-nums transition-all">
            {resolved ? "3.5 / 4.0" : "2.5 / 4.0"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => setResolved(true)}
            className={`p-2 rounded-xs border text-left transition-colors cursor-pointer ${
              resolved
                ? "bg-primary/[0.06] border-primary text-ink font-semibold"
                : "bg-canvas-soft border-hairline text-ink-muted"
            }`}
          >
            Revise (+1.0m)
          </button>
          <button
            type="button"
            onClick={() => setResolved(false)}
            className={`p-2 rounded-xs border text-left transition-colors cursor-pointer ${
              !resolved
                ? "bg-canvas-soft border-hairline text-ink font-medium"
                : "bg-surface border-hairline text-ink-faint"
            }`}
          >
            Uphold Score
          </button>
        </div>

        <div className="rounded-xs border border-hairline bg-canvas-soft px-2.5 py-2 text-[10.5px] text-ink-secondary">
          <span className="font-semibold text-ink">Audit Note: </span>
          {resolved
            ? "Verified margin unit calculation; revised +1.0 mark and republished."
            : "Awaiting faculty review of margin crop."}
        </div>
      </div>
    </div>
  );
}
