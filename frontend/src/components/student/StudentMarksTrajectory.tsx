"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Sparkles, BookOpen } from "lucide-react";
import { FeatureCard } from "@/components/ui";

export interface TrajectoryPoint {
  index: number;
  id: string;
  title: string;
  subject: string;
  dateStr: string;
  fullDateStr: string;
  timeMs: number;
  marks: number;
  maxMarks: number;
  percentage: number;
  cumulativeMarks: number;
  cumulativeMax: number;
  isMarksRevised: boolean;
  isRevalPending: boolean;
}

export interface StudentMarksTrajectoryProps {
  submissions: any[];
}

export function StudentMarksTrajectory({ submissions }: StudentMarksTrajectoryProps) {
  // Extract published submissions
  const publishedSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      return (
        s.publication_status === "PUBLISHED" ||
        (s.publication_status !== "UNPUBLISHED" && Boolean(s.exam_is_published || s.is_published))
      );
    });
  }, [submissions]);

  // Canonical branch subjects + any other subjects in submissions
  const standardSubjects = useMemo(() => ["Physics", "Chemistry", "Maths", "Biology"], []);
  const allSubjects = useMemo(() => {
    const set = new Set<string>(standardSubjects);
    publishedSubmissions.forEach((s) => {
      if (s.exam_subject && s.exam_subject.trim()) {
        const trimmed = s.exam_subject.trim();
        const existing = Array.from(set).find((item) => item.toLowerCase() === trimmed.toLowerCase());
        if (!existing) {
          set.add(trimmed);
        }
      }
    });
    return Array.from(set);
  }, [publishedSubmissions, standardSubjects]);

  // Default to ALL subjects by default
  const [selectedSubject, setSelectedSubject] = useState<string>("ALL");

  // Paper count per subject
  const subjectCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sub of allSubjects) {
      map[sub.toLowerCase()] = 0;
    }
    publishedSubmissions.forEach((s) => {
      const sub = (s.exam_subject || "").trim().toLowerCase();
      if (sub) {
        map[sub] = (map[sub] || 0) + 1;
      }
    });
    return map;
  }, [allSubjects, publishedSubmissions]);

  // Filter and sort chronologically for selected subject or ALL
  const points: TrajectoryPoint[] = useMemo(() => {
    const filtered =
      selectedSubject === "ALL"
        ? publishedSubmissions
        : publishedSubmissions.filter(
            (s) => (s.exam_subject || "").trim().toLowerCase() === selectedSubject.toLowerCase()
          );

    const sorted = filtered
      .slice()
      .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

    const multiYear =
      new Set(sorted.map((s) => new Date(s.created_at || 0).getFullYear())).size > 1;

    let runningMarks = 0;
    let runningMax = 0;

    return sorted.map((sub, idx) => {
      const marksNum = Number(sub.total_awarded_marks ?? 0);
      const rawMarks = Number.isFinite(marksNum) ? marksNum : 0;
      const maxNum = Number(sub.max_marks ?? 100);
      const maxMarks = Number.isFinite(maxNum) && maxNum > 0 ? maxNum : 100;
      const pctRaw =
        sub.percentage !== null && sub.percentage !== undefined
          ? Number(sub.percentage)
          : maxMarks > 0
          ? Number(((rawMarks / maxMarks) * 100).toFixed(1))
          : 0;
      const pct = Number.isFinite(pctRaw) ? pctRaw : 0;

      const reval = sub.revaluation;
      const isRevalResolved = Boolean(reval && reval.status === "RESOLVED");
      const isMarksRevised = Boolean(
        isRevalResolved && (reval.decision === "MARKS_REVISED" || sub.is_manual_override === 1)
      );
      const isRevalPending = Boolean(
        reval && (reval.status === "SUBMITTED" || reval.status === "UNDER_REVIEW")
      );

      const createdAt = sub.created_at ? new Date(sub.created_at) : null;
      const hasValidDate = Boolean(createdAt && !Number.isNaN(createdAt.getTime()));

      runningMarks += rawMarks;
      runningMax += maxMarks;

      return {
        index: idx,
        id: sub.id,
        title: sub.exam_title || `Exam #${idx + 1}`,
        subject: sub.exam_subject || "General",
        dateStr: hasValidDate
          ? (createdAt as Date).toLocaleDateString(
              undefined,
              multiYear
                ? { month: "short", day: "numeric", year: "2-digit" }
                : { month: "short", day: "numeric" }
            )
          : `Paper ${idx + 1}`,
        fullDateStr: hasValidDate
          ? (createdAt as Date).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : `Paper ${idx + 1}`,
        timeMs: hasValidDate ? (createdAt as Date).getTime() : Number.NaN,
        marks: rawMarks,
        maxMarks,
        percentage: pct,
        cumulativeMarks: runningMarks,
        cumulativeMax: runningMax,
        isMarksRevised,
        isRevalPending,
      };
    });
  }, [publishedSubmissions, selectedSubject]);

  // Metrics
  const count = points.length;
  const avgPct =
    count > 0
      ? (points.reduce((acc, p) => acc + p.percentage, 0) / count).toFixed(1)
      : null;
  const revalUpgradesCount = points.filter((p) => p.isMarksRevised).length;
  const totalAwarded = count > 0 ? points[count - 1].cumulativeMarks : 0;
  const totalMax = count > 0 ? points[count - 1].cumulativeMax : 0;

  // Scale toggle: per-paper percentage (default) vs running cumulative marks
  const [viewMode, setViewMode] = useState<"percentage" | "cumulative">("percentage");
  const isCumulative = viewMode === "cumulative";

  const [lineAnimated, setLineAnimated] = useState(false);

  const EASING_SLOW_FAST_SLOW = "cubic-bezier(0.75, 0.02, 0.18, 0.98)";
  const DURATION_SECS = 1.4;

  useEffect(() => {
    setLineAnimated(false);
    const frame = requestAnimationFrame(() => {
      const t = setTimeout(() => setLineAnimated(true), 50);
      return () => clearTimeout(t);
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedSubject, points.length, viewMode]);

  // SVG Coordinates calculation (optimized 520x165 dynamic viewBox)
  const svgWidth = 520;
  const svgHeight = 165;
  const padTop = 16;
  const padBottom = 24;
  const padLeft = 32;
  const padRight = isCumulative ? 26 : 16;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const maxY = isCumulative ? Math.max(1, totalMax) : 100;

  const getY = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(maxY, value));
      return padTop + (1 - clamped / maxY) * plotH;
    },
    [maxY, plotH, padTop]
  );

  const timeDomain = useMemo(() => {
    if (count < 2) return null;
    const times = points.map((p) => p.timeMs).filter((t) => Number.isFinite(t));
    if (times.length < 2) return null;
    const min = Math.min(...times);
    const max = Math.max(...times);
    if (max - min < 6 * 60 * 60 * 1000) return null;
    return { min, max };
  }, [points, count]);

  const getX = useCallback(
    (idx: number) => {
      if (count <= 1) return padLeft + plotW / 2;
      if (timeDomain) {
        const t = points[idx]?.timeMs ?? Number.NaN;
        if (Number.isFinite(t)) {
          const frac = (t - timeDomain.min) / (timeDomain.max - timeDomain.min);
          return padLeft + Math.max(0, Math.min(1, frac)) * plotW;
        }
      }
      return padLeft + (idx / (count - 1)) * plotW;
    },
    [count, timeDomain, points, plotW, padLeft]
  );

  const getPointDelay = useCallback(
    (idx: number, total: number) => {
      if (total <= 1) return 0.2;
      const p = Math.max(0, Math.min(1, (getX(idx) - padLeft) / plotW));
      const s = p * p * (3 - 2 * p);
      return Number((0.15 + s * 1.15).toFixed(2));
    },
    [getX, padLeft, plotW]
  );

  const pickLabelIndexes = useCallback(
    (minGap: number) => {
      const shown = new Set<number>();
      if (count === 0) return shown;
      const lastIdx = count - 1;
      shown.add(0);
      if (count === 1) return shown;

      const firstX = getX(0);
      const lastX = getX(lastIdx);
      if (lastX - firstX < minGap) {
        shown.clear();
        shown.add(lastIdx);
        return shown;
      }
      shown.add(lastIdx);
      let prevX = firstX;
      for (let i = 1; i < lastIdx; i++) {
        const x = getX(i);
        if (x - prevX >= minGap && lastX - x >= minGap) {
          shown.add(i);
          prevX = x;
        }
      }
      return shown;
    },
    [count, getX]
  );

  const labeledPoints = useMemo(() => pickLabelIndexes(38), [pickLabelIndexes]);
  const valueLabeledPoints = useMemo(() => pickLabelIndexes(24), [pickLabelIndexes]);

  const buildSmoothPath = useCallback(
    (values: number[]) => {
      if (values.length === 0) return "";
      if (values.length === 1) {
        const cx = getX(0);
        const cy = getY(values[0]);
        return `M ${cx - 20} ${cy} L ${cx + 20} ${cy}`;
      }
      return values.reduce((acc, value, i) => {
        const x = getX(i);
        const y = getY(value);
        if (i === 0) return `M ${x} ${y}`;
        const prevX = getX(i - 1);
        const prevY = getY(values[i - 1]);
        const cpX1 = prevX + (x - prevX) / 2;
        const cpX2 = prevX + (x - prevX) / 2;
        return `${acc} C ${cpX1} ${prevY}, ${cpX2} ${y}, ${x} ${y}`;
      }, "");
    },
    [getX, getY]
  );

  const scoredValues = useMemo(
    () => points.map((p) => (isCumulative ? p.cumulativeMarks : p.percentage)),
    [points, isCumulative]
  );
  const availableValues = useMemo(() => points.map((p) => p.cumulativeMax), [points]);

  const pathD = useMemo(() => buildSmoothPath(scoredValues), [buildSmoothPath, scoredValues]);
  const availablePathD = useMemo(
    () => (isCumulative ? buildSmoothPath(availableValues) : ""),
    [isCumulative, buildSmoothPath, availableValues]
  );

  const areaD = useMemo(() => {
    if (count < 2) return "";
    const firstX = getX(0);
    const lastX = getX(count - 1);
    const bottomY = padTop + plotH;
    return `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [pathD, count, getX, padTop, plotH]);

  const formatAxisValue = (v: number) => {
    if (!isCumulative) return `${v}%`;
    if (v >= 10000) return `${Math.round(v / 1000)}k`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    if (v >= 100) return `${Math.round(v)}`;
    return Number.isInteger(v) ? `${v}` : v.toFixed(1);
  };
  const formatMarks = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));

  const gridTicks = useMemo(
    () => (isCumulative ? [1, 0.75, 0.5, 0.25, 0].map((f) => f * maxY) : [100, 75, 50, 25, 0]),
    [isCumulative, maxY]
  );

  if (publishedSubmissions.length === 0) {
    return null;
  }

  return (
    <FeatureCard className="p-3.5 sm:p-4 space-y-3">
      {/* Top Header: Title + Scale Toggle */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm sm:text-base font-bold text-ink">Marks Trajectory</h2>
          {revalUpgradesCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
              <Sparkles className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              {revalUpgradesCount} Upgraded
            </span>
          )}
        </div>

        <div
          role="group"
          aria-label="Trajectory scale"
          className="inline-flex items-center rounded-full border border-hairline bg-canvas-soft p-0.5 text-[10.5px] font-semibold shrink-0"
        >
          <button
            type="button"
            onClick={() => setViewMode("percentage")}
            aria-pressed={!isCumulative}
            title="Each paper plotted as a percentage of its own maximum"
            className={`px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
              !isCumulative
                ? "bg-ink text-surface dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Percent
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cumulative")}
            aria-pressed={isCumulative}
            title="Running total of marks accumulated across papers"
            className={`px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
              isCumulative
                ? "bg-ink text-surface dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Cumulative
          </button>
        </div>
      </div>

      {/* Subject Tabs Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-xs border-b border-hairline/60">
        <button
          type="button"
          onClick={() => setSelectedSubject("ALL")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all cursor-pointer shrink-0 text-[11px] ${
            selectedSubject === "ALL"
              ? "bg-ink text-surface dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs font-semibold"
              : "bg-canvas-soft hover:bg-surface border border-hairline text-ink-secondary hover:text-ink"
          }`}
        >
          <span>All Subjects</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              selectedSubject === "ALL"
                ? "bg-surface/25 text-surface dark:bg-zinc-900/20 dark:text-zinc-900 font-bold"
                : publishedSubmissions.length > 0
                ? "bg-primary/10 text-primary font-bold"
                : "bg-surface text-ink-muted"
            }`}
          >
            {publishedSubmissions.length}
          </span>
        </button>
        {allSubjects.map((subj) => {
          const isSelected = selectedSubject.toLowerCase() === subj.toLowerCase();
          const pCount = subjectCounts[subj.toLowerCase()] || 0;
          return (
            <button
              key={subj}
              type="button"
              onClick={() => setSelectedSubject(subj)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium transition-all cursor-pointer shrink-0 text-[11px] ${
                isSelected
                  ? "bg-ink text-surface dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs font-semibold"
                  : "bg-canvas-soft hover:bg-surface border border-hairline text-ink-secondary hover:text-ink"
              }`}
            >
              <span>{subj}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  isSelected
                    ? "bg-surface/25 text-surface dark:bg-zinc-900/20 dark:text-zinc-900 font-bold"
                    : pCount > 0
                    ? "bg-primary/10 text-primary font-bold"
                    : "bg-surface text-ink-muted"
                }`}
              >
                {pCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* Chart Canvas or Subject-Specific Empty State */}
      {count === 0 ? (
        <div className="py-7 px-4 text-center rounded-lg border border-dashed border-hairline bg-canvas-soft/40 space-y-1.5">
          <div className="h-8 w-8 rounded-full bg-surface border border-hairline flex items-center justify-center mx-auto text-ink-muted">
            <BookOpen className="h-4 w-4" />
          </div>
          <p className="text-xs font-semibold text-ink">
            No published results in {selectedSubject} yet
          </p>
          <p className="text-[11px] text-ink-muted max-w-sm mx-auto">
            Evaluated test papers and score progression for {selectedSubject} will automatically appear here once results are published.
          </p>
        </div>
      ) : (
        <div className="relative w-full overflow-hidden pt-1">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto select-none overflow-visible block"
          >
            <defs>
              <linearGradient id="pgMarksTrajectoryGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.32" />
                <stop offset="55%" stopColor="#6366f1" stopOpacity="0.10" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
              </linearGradient>

              <linearGradient id="pgLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="45%" stopColor="#4f46e5" />
                <stop offset="100%" stopColor="#7c3aed" />
              </linearGradient>

              <filter id="pgPointGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="#2563eb" floodOpacity="0.35" />
              </filter>

              <filter id="pgLineGlow" x="-5%" y="-20%" width="110%" height="150%">
                <feDropShadow dx="0" dy="2" stdDeviation="3.5" floodColor="#4f46e5" floodOpacity="0.28" />
              </filter>
            </defs>

            {isCumulative && (
              <text
                x={4}
                y={11}
                className="fill-slate-400 dark:fill-zinc-500 font-mono text-[8px] uppercase tracking-wider select-none"
              >
                Marks
              </text>
            )}

            {gridTicks.map((tick, tickIdx) => {
              const y = getY(tick);
              const isBaseline = tickIdx === gridTicks.length - 1;
              return (
                <g key={`tick-${tickIdx}`}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={svgWidth - padRight}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                    strokeDasharray={isBaseline ? "none" : "3 3"}
                    className="stroke-slate-200 dark:stroke-zinc-800 transition-colors"
                  />
                  <text
                    x={padLeft - 6}
                    y={y + 3.5}
                    textAnchor="end"
                    className="fill-slate-400 dark:fill-zinc-500 font-mono text-[8.5px] select-none"
                  >
                    {formatAxisValue(tick)}
                  </text>
                </g>
              );
            })}

            {!isCumulative && avgPct !== null && count >= 2 && (
              <g
                style={{
                  opacity: lineAnimated ? 1 : 0,
                  transition: "opacity 0.8s ease 0.4s",
                }}
              >
                <line
                  x1={padLeft}
                  y1={getY(Number(avgPct))}
                  x2={svgWidth - padRight}
                  y2={getY(Number(avgPct))}
                  stroke="#a855f7"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  strokeOpacity="0.75"
                  className="dark:stroke-purple-400"
                />
                <text
                  x={svgWidth - padRight + 4}
                  y={getY(Number(avgPct)) + 3}
                  className="fill-purple-600 dark:fill-purple-400 font-mono text-[8.5px] font-bold"
                >
                  Avg {avgPct}%
                </text>
              </g>
            )}

            {isCumulative && availablePathD && (
              <path
                d={availablePathD}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.25"
                strokeDasharray="3 3"
                strokeOpacity="0.85"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="dark:stroke-zinc-500"
                style={{
                  opacity: lineAnimated ? 1 : 0,
                  transition: "opacity 0.6s ease 0.2s",
                }}
              />
            )}

            {areaD && (
              <path
                d={areaD}
                fill="url(#pgMarksTrajectoryGrad)"
                style={{
                  clipPath: lineAnimated ? "inset(0% 0% 0% 0%)" : "inset(0% 100% 0% 0%)",
                  opacity: lineAnimated ? 1 : 0,
                  transition: `clip-path ${DURATION_SECS}s ${EASING_SLOW_FAST_SLOW}, opacity 0.5s ease`,
                }}
              />
            )}

            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke="url(#pgLineGrad)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={lineAnimated ? 0.3 : 0}
                style={{
                  strokeDasharray: 1400,
                  strokeDashoffset: lineAnimated ? 0 : 1400,
                  filter: "blur(4px)",
                  transition: `stroke-dashoffset ${DURATION_SECS}s ${EASING_SLOW_FAST_SLOW}, opacity 0.4s ease`,
                }}
              />
            )}

            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke="url(#pgLineGrad)"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#pgLineGlow)"
                style={{
                  strokeDasharray: 1400,
                  strokeDashoffset: lineAnimated ? 0 : 1400,
                  transition: `stroke-dashoffset ${DURATION_SECS}s ${EASING_SLOW_FAST_SLOW}`,
                }}
              />
            )}

            {points.map((p, idx) => {
              const cx = getX(idx);
              const pointValue = isCumulative ? p.cumulativeMarks : p.percentage;
              const cy = getY(pointValue);
              const delay = getPointDelay(idx, count);

              return (
                <g
                  key={p.id}
                  className="group transition-all"
                  style={{
                    opacity: lineAnimated ? 1 : 0,
                    transform: lineAnimated ? "scale(1)" : "scale(0)",
                    transformOrigin: `${cx}px ${cy}px`,
                    transition: `opacity 0.25s ease ${delay}s, transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s`,
                  }}
                >
                  <title>
                    {isCumulative
                      ? `${p.title} (${p.subject}) — ${p.fullDateStr}: ${formatMarks(p.marks)}/${formatMarks(p.maxMarks)} · running ${formatMarks(p.cumulativeMarks)}/${formatMarks(p.cumulativeMax)}`
                      : `${p.title} (${p.subject}) — ${p.fullDateStr}: ${formatMarks(p.marks)}/${formatMarks(p.maxMarks)} (${p.percentage}%)`}
                  </title>

                  {idx === count - 1 && lineAnimated && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="8"
                      fill="none"
                      stroke="#7c3aed"
                      strokeWidth="1.5"
                      className="animate-ping opacity-60"
                      style={{
                        animationDuration: "2.4s",
                        animationIterationCount: "infinite",
                        animationDelay: "1.4s",
                      }}
                    />
                  )}

                  {p.isMarksRevised && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="10"
                      fill="#10b981"
                      fillOpacity="0.22"
                      className="animate-pulse"
                    />
                  )}

                  <circle
                    cx={cx}
                    cy={cy}
                    r="5"
                    fill={
                      p.isMarksRevised
                        ? "#10b981"
                        : p.isRevalPending
                        ? "#f59e0b"
                        : idx === count - 1
                        ? "#7c3aed"
                        : "#2563eb"
                    }
                    stroke="#ffffff"
                    strokeWidth="2"
                    filter="url(#pgPointGlow)"
                    className="transition-all duration-150 group-hover:r-[6.5px] dark:stroke-zinc-900"
                  />

                  {valueLabeledPoints.has(idx) && (
                    <text
                      x={cx}
                      y={cy - 9}
                      textAnchor="middle"
                      className={`font-mono text-[9px] font-bold select-none ${
                        p.isMarksRevised
                          ? "fill-emerald-700 dark:fill-emerald-400"
                          : idx === count - 1
                          ? "fill-purple-700 dark:fill-purple-300 font-black"
                          : "fill-slate-700 dark:fill-zinc-300"
                      }`}
                    >
                      {isCumulative ? formatMarks(p.cumulativeMarks) : `${p.percentage}%`}
                    </text>
                  )}

                  {labeledPoints.has(idx) && (
                    <text
                      x={cx}
                      y={svgHeight - 8}
                      textAnchor="middle"
                      className="font-sans text-[8.5px] fill-slate-500 dark:fill-zinc-400 select-none"
                    >
                      {p.dateStr}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-1.5 mt-1 border-t border-hairline/60 text-[11px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span>{isCumulative ? "Cumulative score" : "Standard"}</span>
            </span>
            {points.some((p) => p.isMarksRevised) && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium text-emerald-800">Revaluation Upgraded</span>
              </span>
            )}
            {points.some((p) => p.isRevalPending) && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>In Review</span>
              </span>
            )}
            {!isCumulative && count >= 2 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 border-t-2 border-dashed border-purple-500" />
                <span>Average</span>
              </span>
            )}
            {isCumulative && count >= 1 && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 border-t-2 border-dashed border-slate-400 dark:border-zinc-500" />
                  <span>Available</span>
                </span>
                <span className="ml-auto font-mono font-bold text-ink">
                  {formatMarks(totalAwarded)} / {formatMarks(totalMax)} marks
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </FeatureCard>
  );
}
