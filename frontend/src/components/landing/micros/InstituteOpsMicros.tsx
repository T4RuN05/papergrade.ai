"use client";

import React, { useEffect, useState } from "react";
import { Building2, FileSpreadsheet, CheckCircle2, ChevronDown } from "lucide-react";

/**
 * Three compact operational microcomponents for the Coaching Institute Operations strip:
 * 1. Campus -> Branch -> Batch roll scoping
 * 2. Dense ranked standings & CSV export
 * 3. Longitudinal student trajectory curve
 */
export function BranchScopingMicro() {
  const [branchIdx, setBranchIdx] = useState(0);
  const branches = [
    { name: "Andheri West", batch: "Batch Alpha", rolls: ["AW-A-001", "AW-A-002", "AW-A-003"] },
    { name: "Borivali East", batch: "Target JEE-B", rolls: ["BVI-B-014", "BVI-B-015", "BVI-B-016"] },
  ];

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const timer = setInterval(() => {
      setBranchIdx((prev) => (prev + 1) % branches.length);
    }, 4800);
    return () => clearInterval(timer);
  }, [branches.length]);

  const current = branches[branchIdx];

  return (
    <div className="rounded-md border border-hairline bg-canvas-soft p-3 space-y-2.5 select-none">
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xs border border-hairline bg-surface text-xs">
        <span className="flex items-center gap-1.5 font-medium text-ink truncate">
          <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate">{current.name}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-muted shrink-0" />
      </div>

      <div className="space-y-1 text-[11px]">
        <div className="flex items-center justify-between text-ink-muted px-1">
          <span>{current.batch}</span>
          <span className="font-mono">48 Enrolled</span>
        </div>
        {current.rolls.map((roll, i) => (
          <div
            key={roll}
            className="flex items-center justify-between px-2 py-1 rounded-xs border border-hairline bg-surface font-mono text-[10.5px]"
          >
            <span className="text-ink font-medium">{roll}</span>
            <span className="text-ink-muted">
              {i === 0 ? "Claimed ✓" : i === 1 ? "Claimed ✓" : "Invited"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RankedExportMicro() {
  const [exported, setExported] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setExported(true);
      return;
    }
    const timer = setInterval(() => {
      setExported((prev) => !prev);
    }, 4400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="rounded-md border border-hairline bg-canvas-soft p-3 space-y-2 select-none">
      <div className="space-y-1">
        {[
          { rank: "#1", name: "Aarav S.", score: "94.0%" },
          { rank: "#2", name: "Ananya B.", score: "89.0%" },
          { rank: "#3", name: "Diya P.", score: "86.5%" },
        ].map((row) => (
          <div
            key={row.rank}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-xs border border-hairline bg-surface text-[11px]"
          >
            <span className="flex items-center gap-2">
              <span className="font-mono font-bold text-primary">{row.rank}</span>
              <span className="font-medium text-ink">{row.name}</span>
            </span>
            <span className="font-mono font-semibold text-ink tabular-nums">{row.score}</span>
          </div>
        ))}
      </div>

      <div
        className={`flex items-center justify-between px-2.5 py-1.5 rounded-xs border text-[11px] font-medium transition-colors duration-400 ${
          exported
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
            : "bg-surface border-hairline text-ink-secondary"
        }`}
      >
        <span className="flex items-center gap-1.5">
          {exported ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <FileSpreadsheet className="h-3.5 w-3.5 text-primary shrink-0" />
          )}
          <span>{exported ? "Standings CSV Ready" : "Batch Marks Matrix"}</span>
        </span>
        <span className="font-mono text-[10px]">.CSV</span>
      </div>
    </div>
  );
}

export function TrajectoryMicro() {
  const [subject, setSubject] = useState<"Physics" | "Chemistry">("Physics");

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const timer = setInterval(() => {
      setSubject((prev) => (prev === "Physics" ? "Chemistry" : "Physics"));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const isPhysics = subject === "Physics";

  return (
    <div className="rounded-md border border-hairline bg-canvas-soft p-3 space-y-2 select-none">
      <div className="flex items-center gap-1 text-[10.5px]">
        {(["Physics", "Chemistry"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setSubject(tab)}
            className={`px-2 py-0.5 rounded-xs font-medium border transition-colors cursor-pointer ${
              subject === tab
                ? "bg-primary text-white border-primary"
                : "bg-surface text-ink-muted border-hairline"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="rounded-xs border border-hairline bg-surface p-2">
        <svg viewBox="0 0 210 74" className="w-full h-16 overflow-visible">
          <line
            x1="4"
            y1="38"
            x2="206"
            y2="38"
            stroke="rgba(168,85,247,0.45)"
            strokeDasharray="3 3"
          />
          <path
            key={subject}
            d={
              isPhysics
                ? "M 10 56 C 42 54, 52 34, 78 36 C 110 38, 128 22, 155 24 C 176 26, 188 12, 200 10"
                : "M 10 46 C 40 48, 56 42, 82 32 C 112 22, 132 30, 158 20 C 180 14, 190 16, 200 14"
            }
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2.25"
            strokeLinecap="round"
            className="animate-landing-curve"
          />
          <circle
            cx="155"
            cy={isPhysics ? 24 : 20}
            r="3.5"
            fill="#1aae39"
            stroke="var(--surface)"
            strokeWidth="1.5"
          />
          <circle
            cx="200"
            cy={isPhysics ? 10 : 14}
            r="3.5"
            fill="var(--primary)"
            stroke="var(--surface)"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      <div className="flex items-center justify-between text-[10.5px] text-ink-muted px-0.5">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-green shrink-0" />
          <span>Appeal upgraded</span>
        </span>
        <span className="font-mono font-semibold text-ink tabular-nums">
          {isPhysics ? "Avg 81.4%" : "Avg 78.9%"}
        </span>
      </div>
    </div>
  );
}
