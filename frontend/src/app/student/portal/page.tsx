"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clock,
  Upload,
  FileCheck2,
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  RotateCcw,
  RefreshCw,
  FileText,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Award,
  BookOpen,
  Calendar,
  Layers,
  HelpCircle,
  CheckSquare,
  Square,
  ExternalLink,
  Info,
  Bell,
  TrendingUp,
  TrendingDown,
  Minus,
  LineChart,
  ChevronDown,
  ChevronUp,
  Sliders,
  Search,
  X,
  Cpu,
  LifeBuoy,
  AlertTriangle,
  Camera,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Trophy,
} from "lucide-react";
import { api, getAuthToken } from "@/lib/api";
import { useToast } from "@/lib/ToastContext";
import { useNotifications } from "@/lib/NotificationContext";
import { ReportIssueModal } from "@/components/ReportIssueModal";
import { ArtifactViewerModal } from "@/components/ArtifactViewerModal";
import { ExamRankedTable } from "@/components/ExamRankedTable";
import { assembleFilesToCanonicalPdf, AssemblyProgress } from "@/lib/pdfAssembler";
import {
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
  ModalCard,
  FormInput,
  StudentPortalSkeleton,
  PastExamsCardsSkeleton,
  PastExamsTabSkeleton,
  StatusWell,
  MathText,
} from "@/components/ui";

interface TrajectoryPoint {
  index: number;
  id: string;
  title: string;
  subject: string;
  dateStr: string;
  marks: number;
  maxMarks: number;
  percentage: number;
  isMarksRevised: boolean;
  isRevalPending: boolean;
}

function StudentMarksTrajectory({
  submissions,
}: {
  submissions: any[];
}) {
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
        // Find existing case-insensitive match or add
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

    return filtered
      .slice()
      .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
      .map((sub, idx) => {
        const rawMarks = Number(sub.total_awarded_marks ?? 0);
        const maxMarks = Number(sub.max_marks ?? 100);
        const pct =
          sub.percentage !== null && sub.percentage !== undefined
            ? Number(sub.percentage)
            : maxMarks > 0
            ? Number(((rawMarks / maxMarks) * 100).toFixed(1))
            : 0;

        const reval = sub.revaluation;
        const isRevalResolved = reval && reval.status === "RESOLVED";
        const isMarksRevised =
          isRevalResolved && (reval.decision === "MARKS_REVISED" || sub.is_manual_override === 1);
        const isRevalPending =
          reval && (reval.status === "SUBMITTED" || reval.status === "UNDER_REVIEW");

        return {
          index: idx,
          id: sub.id,
          title: sub.exam_title || `Exam #${idx + 1}`,
          subject: sub.exam_subject || "General",
          dateStr: sub.created_at
            ? new Date(sub.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            : `Paper ${idx + 1}`,
          marks: rawMarks,
          maxMarks: maxMarks,
          percentage: pct,
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

  const [lineAnimated, setLineAnimated] = useState(false);

  // Easing: starts slow, accelerates fast through the middle, decelerates smoothly to a landing
  const EASING_SLOW_FAST_SLOW = "cubic-bezier(0.75, 0.02, 0.18, 0.98)";
  const DURATION_SECS = 1.4;

  useEffect(() => {
    setLineAnimated(false);
    const frame = requestAnimationFrame(() => {
      const t = setTimeout(() => setLineAnimated(true), 50);
      return () => clearTimeout(t);
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedSubject, points.length]);

  // Synchronize data dot pop-in with the exact physical velocity of the S-curve line tip
  const getPointDelay = (idx: number, total: number) => {
    if (total <= 1) return 0.2;
    const p = idx / (total - 1);
    // S-curve smoothstep mapping (3p^2 - 2p^3) matching slow-fast-slow progression
    const s = p * p * (3 - 2 * p);
    return Number((0.15 + s * 1.15).toFixed(2));
  };

  // SVG Coordinates calculation (optimized 520x165 dynamic viewBox)
  const svgWidth = 520;
  const svgHeight = 165;
  const padTop = 16;
  const padBottom = 24;
  const padLeft = 32;
  const padRight = 16;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const getY = (pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    return padTop + (1 - clamped / 100) * plotH;
  };

  const getX = (idx: number) => {
    if (count <= 1) return padLeft + plotW / 2;
    return padLeft + (idx / (count - 1)) * plotW;
  };

  // Build SVG path
  const pathD = useMemo(() => {
    if (count === 0) return "";
    if (count === 1) {
      const cx = getX(0);
      const cy = getY(points[0].percentage);
      return `M ${cx - 20} ${cy} L ${cx + 20} ${cy}`;
    }
    return points.reduce((acc, p, i) => {
      const x = getX(i);
      const y = getY(p.percentage);
      if (i === 0) return `M ${x} ${y}`;
      const prevX = getX(i - 1);
      const prevY = getY(points[i - 1].percentage);
      const cpX1 = prevX + (x - prevX) / 2;
      const cpY1 = prevY;
      const cpX2 = prevX + (x - prevX) / 2;
      const cpY2 = y;
      return `${acc} C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${x} ${y}`;
    }, "");
  }, [points, count]);

  const areaD = useMemo(() => {
    if (count < 2) return "";
    const firstX = getX(0);
    const lastX = getX(count - 1);
    const bottomY = padTop + plotH;
    return `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [pathD, count]);

  if (publishedSubmissions.length === 0) {
    return null;
  }

  return (
    <FeatureCard className="p-3.5 sm:p-4 space-y-3">
      {/* Top Header: Minimal Subject Title */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm sm:text-base font-bold text-ink">Marks Trajectory</h2>
        {revalUpgradesCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
            <Sparkles className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            {revalUpgradesCount} Upgraded
          </span>
        )}
      </div>

      {/* Subject Tabs Navigation (All Subjects, Physics, Chemistry, Maths, Biology) */}
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
                    ? "bg-white/20 text-white font-bold"
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
        /* Seamless Dynamic SVG Chart Container */
        <div className="relative w-full overflow-hidden pt-1">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto select-none overflow-visible block"
          >
            <defs>
              {/* Dynamic Marks Trajectory Area Wash */}
              <linearGradient id="pgMarksTrajectoryGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.32" />
                <stop offset="55%" stopColor="#6366f1" stopOpacity="0.10" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
              </linearGradient>

              {/* Cool Bi-Chromatic Trajectory Line Gradient */}
              <linearGradient id="pgLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="45%" stopColor="#4f46e5" />
                <stop offset="100%" stopColor="#7c3aed" />
              </linearGradient>

              {/* Data Node Glow */}
              <filter id="pgPointGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="#2563eb" floodOpacity="0.35" />
              </filter>

              {/* Fluid Line Drop Shadow Glow */}
              <filter id="pgLineGlow" x="-5%" y="-20%" width="110%" height="150%">
                <feDropShadow dx="0" dy="2" stdDeviation="3.5" floodColor="#4f46e5" floodOpacity="0.28" />
              </filter>
            </defs>

            {/* Grid lines and Y-axis percentage labels */}
            {[100, 75, 50, 25, 0].map((pct) => {
              const y = getY(pct);
              return (
                <g key={pct}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={svgWidth - padRight}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                    strokeDasharray={pct === 0 ? "none" : "3 3"}
                    className="stroke-slate-200 dark:stroke-zinc-800 transition-colors"
                  />
                  <text
                    x={padLeft - 6}
                    y={y + 3.5}
                    textAnchor="end"
                    className="fill-slate-400 dark:fill-zinc-500 font-mono text-[8.5px] select-none"
                  >
                    {pct}%
                  </text>
                </g>
              );
            })}

            {/* Dotted Average Benchmark Line with Soft Mount Fade */}
            {avgPct !== null && count >= 2 && (
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

            {/* Area Fill - Sweeps from Left-to-Right in Sync with the Line */}
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

            {/* Ambient Glow Aura (Follows the Line Tip) */}
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

            {/* Main Fluid Trajectory Line - Slow Start, Fast Middle, Slow End */}
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

            {/* Data Nodes with Synchronized Velocity Pop-in Animation */}
            {points.map((p, idx) => {
              const cx = getX(idx);
              const cy = getY(p.percentage);
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
                  <title>{`${p.title} (${p.subject}): ${p.marks}/${p.maxMarks} (${p.percentage}%)`}</title>

                  {/* Latest Exam Result Pulse Beacon */}
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

                  {/* Revaluation Upgraded Halo */}
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

                  {/* Node Center Dot */}
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

                  {/* Score Label above node */}
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
                    {p.percentage}%
                  </text>

                  {/* X-axis Date/Exam Label */}
                  <text
                    x={cx}
                    y={svgHeight - 8}
                    textAnchor="middle"
                    className="font-sans text-[8.5px] fill-slate-500 dark:fill-zinc-400 select-none"
                  >
                    {p.dateStr}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Minimal Legend Footer */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-1.5 mt-1 border-t border-hairline/60 text-[11px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span>Standard</span>
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
            {count >= 2 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 border-t-2 border-dashed border-purple-500" />
                <span>Average</span>
              </span>
            )}
          </div>
        </div>
      )}
    </FeatureCard>
  );
}

const PAST_EXAMS_BATCH_SIZE = 5;

interface PastExamCardProps {
  sub: any;
  idx: number;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onOpenBreakdown: (sub: any) => void;
  onOpenRankings: (sub: any) => void;
  onOpenArtifacts: (sub: any) => void;
  onOpenReval: (sub: any) => void;
}

const PastExamCard = React.memo(function PastExamCard({
  sub,
  idx,
  isExpanded,
  onToggle,
  onOpenBreakdown,
  onOpenRankings,
  onOpenArtifacts,
  onOpenReval,
}: PastExamCardProps) {
  const { toast } = useToast();
  const isAbsent = sub.status === "ABSENT" || Boolean(sub.is_absent);
  const isExamPublished =
    !isAbsent &&
    Boolean(
      sub.exam_is_published === 1 ||
      sub.exam_is_published === true ||
      sub.exam_lifecycle_status === "PUBLISHED" ||
      sub.exam_status === "PUBLISHED"
    );
  const isPublished =
    !isAbsent && (
      sub.publication_status === "PUBLISHED" ||
      (sub.publication_status !== "UNPUBLISHED" && Boolean(sub.exam_is_published || sub.is_published))
    );
  const hasAnswers = sub.answers && sub.answers.length > 0;
  const reval = sub.revaluation;
  const hasOpenReval =
    reval && (reval.status === "SUBMITTED" || reval.status === "UNDER_REVIEW");
  const isRevalResolved = reval && reval.status === "RESOLVED";

  return (
    <FeatureCard
      style={{ animationDelay: `${(idx % PAST_EXAMS_BATCH_SIZE) * 50}ms` }}
      className={`animate-cascade transition-[border-color,box-shadow,background-color] duration-200 border p-4 sm:p-5 ${
        isExpanded
          ? "shadow-sm border-primary/30 ring-1 ring-primary/20"
          : "hover:border-hairline-strong hover:bg-canvas-soft/30 cursor-pointer"
      }`}
    >
      {/* Collapsed Header */}
      <div
        onClick={() => onToggle(sub.id)}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm sm:text-base font-bold text-ink hover:text-primary transition-colors leading-snug">
              {sub.exam_title || "Academic Examination"}
            </span>
            {(sub.exam_subject || sub.subject) && (
              <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-md bg-canvas-soft border border-hairline text-ink-muted shrink-0">
                {sub.exam_subject || sub.subject}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-muted mt-0.5">
            <span className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <Calendar className="h-3 w-3 text-ink-muted shrink-0" />
              <span>
                {isAbsent ? "Examination missed" : "Submitted on"}{" "}
                {sub.created_at
                  ? new Date(sub.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Recorded"}
              </span>
            </span>
            <span className="text-ink-faint hidden xs:inline">•</span>
            <span className="inline-flex items-center font-mono whitespace-nowrap bg-canvas-soft/70 dark:bg-[#1a1a1a] border border-hairline/60 px-1.5 py-0.5 rounded-md text-[10.5px] text-ink-secondary shrink-0">
              Roll: <strong className="text-ink ml-1 font-semibold">{sub.roll_number}</strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-start sm:self-center pt-0.5 sm:pt-0">
          {isAbsent ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#fbf0f0] text-[#872323] border border-[#ecd0d0] dark:bg-[#261212] dark:text-[#e87878] dark:border-[#491f1f] whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <AlertCircle className="h-3 w-3 text-[#872323] dark:text-[#e87878]" />
              Absent
            </span>
          ) : isPublished ? (
            <>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#edf5f0] text-[#1e613b] border border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <CheckCircle2 className="h-3 w-3 text-[#1e613b] dark:text-[#86d4a4]" />
                Results Published
              </span>
              {sub.is_document_purged ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#f1f0ee] text-[#4d4a46] border border-[#dedcd8] dark:bg-[#1e1e1e] dark:text-[#a8a6a2] dark:border-[#2f2f2f] whitespace-nowrap">
                  <AlertCircle className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                  PDF Archived
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] whitespace-nowrap shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  title="Graded PDFs are deleted 15 days post-evaluation to optimize system storage."
                >
                  <Clock className="h-3 w-3 text-[#7a4e18] dark:text-[#e5ad68]" />
                  {sub.days_remaining !== undefined && sub.days_remaining !== null
                    ? `${sub.days_remaining}d until purge`
                    : "15d retention"}
                </span>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] whitespace-nowrap shadow-2xs">
              <Clock className="h-3 w-3 text-[#7a4e18] dark:text-[#e5ad68]" />
              Grading in Progress
            </span>
          )}

          {hasOpenReval && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] whitespace-nowrap">
              <RotateCcw className="h-3 w-3 animate-spin" />
              In Review
            </span>
          )}

          {isRevalResolved && reval.decision === "MARKS_REVISED" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#edf5f0] text-[#1e613b] border border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] whitespace-nowrap">
              <Sparkles className="h-3 w-3 text-[#1e613b] dark:text-[#86d4a4]" />
              Marks Revised
            </span>
          )}

          {isAbsent ? (
            <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-xs font-bold text-rose-700 dark:text-rose-300 whitespace-nowrap shrink-0">
              0.0 / {sub.max_marks || sub.exam_total_marks || 25}m
            </span>
          ) : isPublished && sub.total_awarded_marks !== null ? (
            <span className="px-2 py-0.5 rounded-md bg-canvas-soft border border-hairline text-xs font-bold text-ink whitespace-nowrap shrink-0">
              {Number(sub.total_awarded_marks).toFixed(1)} / {sub.max_marks || sub.exam_total_marks || 25}m
              {sub.percentage !== null && ` (${Number(sub.percentage).toFixed(0)}%)`}
            </span>
          ) : null}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(sub.id);
            }}
            className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors ml-1 cursor-pointer"
            aria-label={isExpanded ? "Collapse exam card" : "Expand exam card"}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${
                isExpanded ? "rotate-180 text-primary" : "rotate-0 text-ink-muted"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Expanded Content (Apple-style smooth CSS grid accordion) */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[grid-template-rows] ${
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden min-h-0">
          <div
            className={`pt-3.5 mt-3 border-t border-hairline space-y-4 transition-[opacity,transform] duration-250 ease-out will-change-[opacity,transform] ${
              isExpanded
                ? "opacity-100 translate-y-0"
                : "opacity-0 -translate-y-1 pointer-events-none"
            }`}
          >
            {isAbsent ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-lg bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-rose-900 dark:text-rose-200">Candidate Recorded as Absent</div>
                    <div className="text-[11px] text-rose-700 dark:text-rose-400">
                      No answer sheet was uploaded during the exam window. This paper was not evaluated.
                    </div>
                  </div>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <div className="text-sm font-bold text-rose-700 dark:text-rose-300 font-mono">0.0 / {sub.exam_total_marks || 25}</div>
                  <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold uppercase">Absent</div>
                </div>
              </div>
            ) : isPublished ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2.5 sm:p-3.5 rounded-lg bg-canvas-soft border border-hairline">
                <div className="grid grid-cols-3 sm:flex items-center gap-2 sm:gap-4">
                  <div>
                    <div className="text-[10px] sm:text-[11px] font-medium text-ink-muted leading-none">
                      Total Score
                    </div>
                    <div className="text-base sm:text-xl font-bold text-ink mt-0.5 leading-tight">
                      {sub.total_awarded_marks !== null && sub.total_awarded_marks !== undefined
                        ? Number(sub.total_awarded_marks).toFixed(1)
                        : "—"}{" "}
                      <span className="text-[10px] sm:text-xs font-normal text-ink-muted">
                        / {sub.max_marks || sub.exam_total_marks || 25}m
                      </span>
                    </div>
                  </div>

                  <div className="h-7 w-px bg-hairline hidden sm:block" />

                  <div>
                    <div className="text-[10px] sm:text-[11px] font-medium text-ink-muted leading-none">
                      Percentage
                    </div>
                    <div className="text-sm sm:text-base font-bold text-ink mt-0.5 leading-tight">
                      {sub.percentage !== null && sub.percentage !== undefined
                        ? `${Number(sub.percentage).toFixed(1)}%`
                        : "—"}
                    </div>
                  </div>

                  <div className="h-7 w-px bg-hairline hidden sm:block" />

                  <div>
                    <div className="text-[10px] sm:text-[11px] font-medium text-ink-muted leading-none">
                      Questions
                    </div>
                    <div className="text-[11px] sm:text-xs font-semibold text-ink mt-0.5 leading-tight truncate">
                      {hasAnswers ? `${sub.answers.length} Graded` : "Registered"}
                    </div>
                  </div>
                </div>

                {isRevalResolved && reval.reviewer_notes && (
                  <div className="sm:max-w-xs text-left bg-surface border border-hairline p-2 rounded-md">
                    <div className="text-[10px] font-semibold text-ink-secondary">
                      Faculty Feedback:
                    </div>
                    <p className="text-[11px] text-ink italic line-clamp-2">
                      "{reval.reviewer_notes}"
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {/* Actions Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                {isAbsent ? (
                  <button
                    type="button"
                    disabled
                    className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted/70 bg-canvas-soft border border-hairline px-4 rounded-md cursor-not-allowed select-none text-center whitespace-nowrap shrink-0"
                  >
                    <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    <span>No Script Uploaded</span>
                  </button>
                ) : (
                  <Link
                    href={`/student/submissions/${sub.id}`}
                    className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md btn-glass-primary transition-all cursor-pointer text-center shrink-0 whitespace-nowrap px-4"
                  >
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {isPublished
                        ? sub.is_document_purged
                          ? "View Archived Question Marks →"
                          : "Inspect in PDF Viewer →"
                        : "View Submitted Script →"}
                    </span>
                  </Link>
                )}

                {/* Secondary: View Breakdown */}
                {isPublished ? (
                  <button
                    type="button"
                    onClick={() => onOpenBreakdown(sub)}
                    className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold btn-glass-utility px-3.5 rounded-md transition-all cursor-pointer text-center whitespace-nowrap shrink-0"
                  >
                    <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>View Summary</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Detailed breakdown will be accessible once marks are officially published by faculty."
                    className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted/80 bg-canvas-soft border border-hairline/70 px-3.5 rounded-md cursor-not-allowed select-none text-center whitespace-nowrap shrink-0"
                  >
                    <FileText className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                    <span>Summary Pending</span>
                  </button>
                )}

                {/* Class Standings & Rankings (Only visible once exam results are officially published) */}
                {isExamPublished && (
                  <button
                    type="button"
                    onClick={() => onOpenRankings(sub)}
                    className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold btn-glass-utility px-3.5 rounded-md transition-all cursor-pointer text-center whitespace-nowrap shrink-0"
                    title="View Official Class Standings & Rankings"
                  >
                    <Trophy className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span>Class Standings</span>
                  </button>
                )}

                {/* Question Paper & Answer Key Viewer */}
                {isPublished && (sub.has_question_paper || sub.has_answer_key) && (
                  <button
                    type="button"
                    onClick={() => onOpenArtifacts(sub)}
                    className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink bg-surface border border-hairline hover:bg-canvas-soft px-3.5 rounded-md transition-colors cursor-pointer text-center whitespace-nowrap shrink-0 shadow-2xs"
                    title="View Question Paper & Official Answer Key"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>QP & Key</span>
                  </button>
                )}

                {/* Download Graded PDF */}
                {isPublished ? (
                  sub.is_document_purged ? (
                    <button
                      type="button"
                      disabled
                      title="Graded PDF was permanently purged after 15 days to preserve storage. Question marks remain archived."
                      className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted bg-canvas-soft border border-hairline px-3.5 rounded-md opacity-60 cursor-not-allowed text-center whitespace-nowrap shrink-0"
                    >
                      <Download className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                      <span>PDF Expired</span>
                    </button>
                  ) : (
                    <a
                      href={api.getAnnotatedPdfUrl(sub.id)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() =>
                        toast.info("Opening evaluated answer sheet...", { title: "Graded Paper" })
                      }
                      className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 px-3.5 rounded-md transition-colors text-center whitespace-nowrap shrink-0 shadow-2xs"
                      title={`Download before expiration (${sub.days_remaining ?? 15} days remaining)`}
                    >
                      <Download className="h-3.5 w-3.5 shrink-0" />
                      <span>Download PDF</span>
                    </a>
                  )
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Evaluated PDF download will be enabled once faculty officially publishes results."
                    className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted/80 bg-canvas-soft border border-hairline/70 px-3.5 rounded-md cursor-not-allowed select-none text-center whitespace-nowrap shrink-0"
                  >
                    <Download className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                    <span>PDF Pending</span>
                  </button>
                )}
              </div>

              {/* Revaluation Appeal Status Pill (Shown only if appeal is active or resolved) */}
              {isPublished && (hasOpenReval || isRevalResolved) && (
                <div className="w-full sm:w-auto">
                  {hasOpenReval ? (
                    <div className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 rounded-md text-xs font-semibold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] text-center whitespace-nowrap shadow-2xs">
                      <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                      <span>Revaluation Appeal Active</span>
                    </div>
                  ) : (
                    <div className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 rounded-md text-xs font-semibold bg-[#edf5f0] text-[#1e613b] border border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] text-center whitespace-nowrap shadow-2xs">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Revaluation Completed</span>
                    </div>
                  )}
                </div>
              )}

              {/* Request Revaluation Button */}
              {isPublished && !hasOpenReval && !isRevalResolved && (
                <button
                  type="button"
                  onClick={() => onOpenReval(sub)}
                  className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-secondary hover:text-ink hover:bg-canvas-soft border border-hairline px-3.5 rounded-md transition-colors cursor-pointer text-center whitespace-nowrap shrink-0 shadow-2xs"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-ink-muted" />
                  <span>Request Revaluation</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </FeatureCard>
  );
});

export default function StudentPortalPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { permission, isSupported, requestPermission } = useNotifications();
  const [hideNotifBanner, setHideNotifBanner] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [exams, setExams] = useState<any[]>([]);
  const [activeWindows, setActiveWindows] = useState<Array<{ exam: any; window_status: any }>>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Segmented control active tab & slide animation direction
  const [activeTab, setActiveTab] = useState<"dashboard" | "exams">("dashboard");
  const [tabDirection, setTabDirection] = useState<"left" | "right">("right");

  // Read initial tab from URL query param (?tab=exams) & handle back/forward navigation
  useEffect(() => {
    const handleUrlTab = () => {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("tab") === "exams") {
          setActiveTab("exams");
        } else {
          setActiveTab("dashboard");
        }
      }
    };
    handleUrlTab();
    window.addEventListener("popstate", handleUrlTab);
    return () => window.removeEventListener("popstate", handleUrlTab);
  }, []);

  const handleTabSwitch = (newTab: "dashboard" | "exams", scrollToTop = true) => {
    if (newTab === activeTab) return;
    setTabDirection(newTab === "exams" ? "right" : "left");
    setActiveTab(newTab);
    const newUrl = newTab === "exams" ? "/student/portal?tab=exams" : "/student/portal";
    window.history.replaceState(null, "", newUrl);
    if (scrollToTop && typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  };

  // Mobile horizontal swipe between Dashboard and Past Exams
  const portalTouchStartXRef = useRef<number | null>(null);
  const portalTouchStartYRef = useRef<number | null>(null);

  const handlePortalTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const target = e.target as HTMLElement;
    // Don't swipe if touching inside a scrollable table/list, input, button, or open modal
    if (
      breakdownModalOpen ||
      rankingsModalOpen ||
      revalModalOpen ||
      reportModalOpen ||
      artifactModalOpen ||
      target.closest(".overflow-x-auto, [data-no-swipe], input, textarea, button, a, [role='dialog']")
    ) {
      portalTouchStartXRef.current = null;
      portalTouchStartYRef.current = null;
      return;
    }
    portalTouchStartXRef.current = e.touches[0].clientX;
    portalTouchStartYRef.current = e.touches[0].clientY;
  };

  const handlePortalTouchEnd = (e: React.TouchEvent) => {
    if (portalTouchStartXRef.current === null || portalTouchStartYRef.current === null) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - portalTouchStartXRef.current;
    const deltaY = touch.clientY - portalTouchStartYRef.current;

    portalTouchStartXRef.current = null;
    portalTouchStartYRef.current = null;

    // Must be predominantly horizontal and at least 65px travel
    if (Math.abs(deltaX) > 65 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0 && activeTab === "dashboard") {
        // Swiping left: slide to Past Exams
        handleTabSwitch("exams", true);
      } else if (deltaX > 0 && activeTab === "exams") {
        // Swiping right: slide to Dashboard
        handleTabSwitch("dashboard", true);
      }
    }
  };

  // Derived current active exam and window status
  const currentActiveItem =
    activeWindows.find((w) => w.exam?.id === selectedExamId) || activeWindows[0] || null;
  const activeExam = currentActiveItem?.exam || null;
  const windowStatus = currentActiveItem?.window_status || null;

  // Track if student wants to replace/re-upload an already submitted answer sheet
  const [isReplacingUpload, setIsReplacingUpload] = useState(false);

  // Submission for the active exam (if student has already uploaded)
  const activeExamSubmission = useMemo(() => {
    if (!activeExam) return null;
    return (
      submissions.find(
        (s) => s.exam_id === activeExam.id && s.submission_status !== "SUPERSEDED"
      ) || null
    );
  }, [submissions, activeExam]);

  useEffect(() => {
    setIsReplacingUpload(false);
  }, [selectedExamId]);

  // Question Paper & Answer Key Viewer Modal state
  const [artifactModalOpen, setArtifactModalOpen] = useState(false);
  const [artifactModalExam, setArtifactModalExam] = useState<any>(null);
  const [artifactModalInitialTab, setArtifactModalInitialTab] = useState<"question-paper" | "answer-key">("question-paper");

  // Multi-page Scanning & Upload state
  const [scannedPages, setScannedPages] = useState<Array<{
    id: string;
    file: File;
    name: string;
    size: number;
    previewUrl?: string;
    isPdf: boolean;
  }>>([]);
  const [uploading, setUploading] = useState(false);
  const [assemblyProgress, setAssemblyProgress] = useState<AssemblyProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);

  // Revoke preview object URLs when items are removed
  const cleanupPreviews = (items: typeof scannedPages) => {
    items.forEach((item) => {
      if (item.previewUrl && !item.isPdf) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
  };

  const handleAddFiles = (newFiles: FileList | File[]) => {
    if (uploading) return;
    setUploadError(null);
    setUploadSuccess(null);

    const addedList = Array.from(newFiles);
    if (addedList.length === 0) return;

    // Check if user is uploading a single PDF
    const hasPdf = addedList.some((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));

    if (hasPdf) {
      const pdfFile = addedList.find((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))!;
      if (pdfFile.size > 7 * 1024 * 1024) {
        setUploadError("PDF file exceeds 7 MB limit.");
        toast.error("PDF exceeds 7 MB limit.");
        return;
      }
      cleanupPreviews(scannedPages);
      setScannedPages([
        {
          id: `pdf_${Date.now()}`,
          file: pdfFile,
          name: pdfFile.name,
          size: pdfFile.size,
          isPdf: true,
        },
      ]);
      return;
    }

    // It's image pages (from camera or gallery)
    const currentIsPdf = scannedPages.length === 1 && scannedPages[0].isPdf;
    const baseItems = currentIsPdf ? [] : [...scannedPages];
    if (currentIsPdf) cleanupPreviews(scannedPages);

    const newItems: typeof scannedPages = [];
    for (const f of addedList) {
      if (baseItems.length + newItems.length >= 15) {
        toast.warning("Maximum 15 pages allowed per answer sheet.");
        break;
      }
      const previewUrl = URL.createObjectURL(f);
      newItems.push({
        id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file: f,
        name: f.name,
        size: f.size,
        previewUrl,
        isPdf: false,
      });
    }

    setScannedPages([...baseItems, ...newItems]);
  };

  const handleRemovePage = (index: number) => {
    if (uploading) return;
    setScannedPages((prev) => {
      const target = prev[index];
      if (target?.previewUrl && !target.isPdf) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleMovePage = (index: number, direction: "up" | "down") => {
    if (uploading) return;
    setScannedPages((prev) => {
      const targetIdx = direction === "up" ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  const handleClearAllPages = () => {
    if (uploading) return;
    cleanupPreviews(scannedPages);
    setScannedPages([]);
    setUploadError(null);
  };

  // Exam Standings / Rankings Modal state
  const [rankingsModalOpen, setRankingsModalOpen] = useState(false);
  const [rankingsExam, setRankingsExam] = useState<{ id: string; title: string; max_marks?: number } | null>(null);
  const [rankingsData, setRankingsData] = useState<any[]>([]);
  const [isRankingsLoading, setIsRankingsLoading] = useState(false);

  const handleOpenRankingsModal = useCallback(async (sub: any) => {
    const isExamPublished = Boolean(
      sub?.exam_is_published === 1 ||
      sub?.exam_is_published === true ||
      sub?.exam_lifecycle_status === "PUBLISHED" ||
      sub?.exam_status === "PUBLISHED"
    );

    if (!isExamPublished) {
      toast.info("Class standings will become available once results are officially published by faculty.", {
        title: "Standings Pending",
      });
      return;
    }

    const examId = sub.exam_id;
    const examTitle = sub.exam_title || sub.title || "Exam";
    const maxMarks = sub.max_marks || sub.exam_total_marks || 25;

    setRankingsExam({ id: examId, title: examTitle, max_marks: maxMarks });
    setRankingsModalOpen(true);
    setIsRankingsLoading(true);

    try {
      const data = await api.getExamRankings(examId);
      if (data && Array.isArray(data.rankings) && data.is_published !== false) {
        setRankingsData(data.rankings);
      } else {
        setRankingsData([]);
      }
    } catch (err: any) {
      console.warn("Could not load exam rankings:", err);
      setRankingsData([]);
    } finally {
      setIsRankingsLoading(false);
    }
  }, [toast]);

  // Detailed Breakdown Modal state
  const [breakdownModalOpen, setBreakdownModalOpen] = useState(false);
  const [breakdownSubmission, setBreakdownSubmission] = useState<any>(null);
  const [isBreakdownLoadingDetails, setIsBreakdownLoadingDetails] = useState(false);
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Record<string, boolean>>({});

  const toggleQuestionExpand = (id: string) => {
    setExpandedQuestionIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const toggleAllQuestionsExpand = (allAnswers: any[]) => {
    const allKeys = allAnswers.map((a: any, idx: number) => a.id || a.question_id || `q_${idx}`);
    const isAllExpanded = allKeys.every((key) => expandedQuestionIds[key]);
    if (isAllExpanded) {
      setExpandedQuestionIds({});
    } else {
      const next: Record<string, boolean> = {};
      allKeys.forEach((key) => {
        next[key] = true;
      });
      setExpandedQuestionIds(next);
    }
  };

  // Revaluation modal state
  const [revalModalOpen, setRevalModalOpen] = useState(false);
  const [revalSubmission, setRevalSubmission] = useState<any>(null);
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [revalReason, setRevalReason] = useState("");
  const [revalLoading, setRevalLoading] = useState(false);
  const [revalMsg, setRevalMsg] = useState<string | null>(null);

  // Technical issue report modal state
  const [reportModalOpen, setReportModalOpen] = useState(false);

  // Live ticker (updates every 15s to automatically unmount expired closed window cards without refresh)
  const [currentTick, setCurrentTick] = useState<number>(Date.now());
  useEffect(() => {
    const ticker = setInterval(() => setCurrentTick(Date.now()), 15000);
    return () => clearInterval(ticker);
  }, []);

  // Load student profile, exam windows, and all past submissions
  const loadPortalData = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      try {
        const state = await api.getStudentPortalState();
        if (state) {
          setUser(state.user);
          setExams(state.exams || []);
          const rawSubs = (state.submissions || []).filter(
            (s: any) => s.submission_status !== "SUPERSEDED"
          );
          const seenExams = new Set<string>();
          const dedupedSubs: any[] = [];
          for (const s of rawSubs) {
            const key = s.exam_id || s.id;
            if (!seenExams.has(key)) {
              seenExams.add(key);
              dedupedSubs.push(s);
            }
          }
          setSubmissions(dedupedSubs);
          const wins =
            state.active_windows && state.active_windows.length > 0
              ? state.active_windows
              : state.active_exam && state.window_status
              ? [{ exam: state.active_exam, window_status: state.window_status }]
              : [];
          setActiveWindows(wins);
          setSelectedExamId((prev) => {
            if (prev && wins.some((w: any) => w.exam?.id === prev)) return prev;
            return wins.length > 0 ? wins[0].exam.id : null;
          });
          return;
        }
      } catch (portalErr) {
        console.warn("Consolidated portal-state endpoint failed, falling back to multi-call", portalErr);
      }

      // Fallback to individual endpoints if consolidated endpoint is unavailable
      const me = await api.getMe();
      setUser(me);

      const [examList, subList] = await Promise.all([
        api.listExams().catch(() => []),
        api.listSubmissions().catch(() => []),
      ]);

      setExams(examList);
      const rawFallback = (subList || []).filter(
        (s: any) => s.submission_status !== "SUPERSEDED"
      );
      const seenFallback = new Set<string>();
      const dedupedFallback: any[] = [];
      for (const s of rawFallback) {
        const key = s.exam_id || s.id;
        if (!seenFallback.has(key)) {
          seenFallback.add(key);
          dedupedFallback.push(s);
        }
      }
      setSubmissions(dedupedFallback);

      if (examList.length > 0) {
        const windowResults = await Promise.all(
          examList.map(async (ex) => {
            try {
              const win = await api.getWindowStatus(ex.id);
              return { exam: ex, win };
            } catch {
              return { exam: ex, win: null };
            }
          })
        );

        const activeResults = windowResults
          .filter((r) => r.win && r.win.is_active)
          .map((r) => ({ exam: r.exam, window_status: r.win }));

        if (activeResults.length > 0) {
          setActiveWindows(activeResults);
          setSelectedExamId((prev) => {
            if (prev && activeResults.some((w: any) => w.exam?.id === prev)) return prev;
            return activeResults[0].exam.id;
          });
        } else {
          // Check for windows closed within the last 2 hours (<= 7200000 ms)
          const twoHoursMs = 2 * 60 * 60 * 1000;
          const recentlyClosed = windowResults
            .filter((r) => {
              if (!r.win) return false;
              if (r.win.should_display !== undefined) return r.win.should_display;
              const closedIso = r.win.grace_deadline_at || r.win.deadline_at || r.win.closed_at;
              if (!closedIso) return false;
              const diffMs = Date.now() - new Date(closedIso).getTime();
              return diffMs >= 0 && diffMs <= twoHoursMs;
            })
            .sort((a, b) => {
              const timeA = new Date(a.win?.grace_deadline_at || a.win?.deadline_at || a.win?.closed_at || 0).getTime();
              const timeB = new Date(b.win?.grace_deadline_at || b.win?.deadline_at || b.win?.closed_at || 0).getTime();
              return timeB - timeA;
            })
            .map((r) => ({ exam: r.exam, window_status: r.win }));

          if (recentlyClosed.length > 0) {
            setActiveWindows([recentlyClosed[0]]);
            setSelectedExamId(recentlyClosed[0].exam.id);
          } else {
            setActiveWindows([]);
            setSelectedExamId(null);
          }
        }
      } else {
        setActiveWindows([]);
        setSelectedExamId(null);
      }
    } catch (err) {
      console.error("Failed to load student portal data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      router.push("/auth/login?role=student&redirect=/student/portal");
      return;
    }
    loadPortalData();

    // Auto-poll portal data every 20 seconds to detect live window opens or result publications
    const pollInterval = setInterval(() => {
      loadPortalData(true);
    }, 20000);

    return () => clearInterval(pollInterval);
  }, [router]);

  // Window countdown timer effect (ticks all active windows)
  useEffect(() => {
    const anyActive = activeWindows.some(
      (w) => w.window_status?.is_active && w.window_status.seconds_remaining > 0
    );
    if (!anyActive) return;

    const interval = setInterval(() => {
      setActiveWindows((prevList) =>
        prevList.map((item) => {
          if (!item.window_status?.is_active || item.window_status.seconds_remaining <= 0) {
            return item;
          }
          const newSec = Math.max(0, item.window_status.seconds_remaining - 1);
          return {
            ...item,
            window_status: {
              ...item.window_status,
              seconds_remaining: newSec,
              is_active: newSec > 0 || item.window_status.is_in_grace,
            },
          };
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [activeWindows]);

  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Upload handler (Client-Side Document Assembly -> Canonical PDF)
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (scannedPages.length === 0 || !activeExam) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    setAssemblyProgress(null);

    try {
      const roll = user?.roll_number || user?.student?.roll_number || "ROLL-101";
      const studentName = user?.full_name || "Enrolled Student";

      let finalPdfFile: File;

      // Fast path: if already a single PDF, no client compilation needed
      if (scannedPages.length === 1 && scannedPages[0].isPdf) {
        finalPdfFile = scannedPages[0].file;
      } else {
        // Prepare and compile images into high-quality PDF
        setAssemblyProgress({
          currentPage: 1,
          totalPages: scannedPages.length,
          percent: 5,
          stage: "optimizing",
          statusMessage: "Preparing pages for upload...",
        });

        finalPdfFile = await assembleFilesToCanonicalPdf(
          scannedPages.map((p) => p.file),
          {
            outputFilename: `answersheet_${roll.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
            maxPageDimension: 1600,
            jpegQuality: 0.82,
            onProgress: (p) => setAssemblyProgress(p),
          }
        );
      }

      const formData = new FormData();
      formData.append("file", finalPdfFile);
      formData.append("roll_number", roll);
      formData.append("student_name", studentName);

      const result = await api.uploadSingleMultipart(activeExam.id, formData);
      const successMsg = result.is_replacement
        ? "Answer sheet replaced successfully!"
        : "Answer sheet uploaded successfully!";
      setUploadSuccess(successMsg);
      toast.success(successMsg, { title: "Submission Received" });
      handleClearAllPages();
      setIsReplacingUpload(false);

      // Refresh submissions
      await loadPortalData();
    } catch (err: any) {
      const errorMsg = err.message || "Failed to upload answer sheet.";
      setUploadError(errorMsg);
      toast.error(errorMsg, { title: "Upload Failed" });
    } finally {
      setUploading(false);
      setAssemblyProgress(null);
    }
  };

  // Determine if active exam submission window card should be displayed:
  // ONLY show if window is currently active (OPEN + within deadline/grace),
  // OR if the window closed within the last 2 hours (<= 120 minutes).
  const shouldShowExamWindowCard = Boolean(
    activeExam &&
      windowStatus &&
      (windowStatus.is_active ||
        (() => {
          const closedIso =
            windowStatus.grace_deadline_at ||
            windowStatus.deadline_at ||
            windowStatus.closed_at;
          if (!closedIso) return false;
          const closedTime = new Date(closedIso).getTime();
          if (isNaN(closedTime)) return false;
          const diffMs = currentTick - closedTime;
          const twoHoursMs = 2 * 60 * 60 * 1000;
          return diffMs >= 0 && diffMs <= twoHoursMs;
        })())
  );

  // Time remaining before the closed window card disappears from view
  const getRemainingCardTime = () => {
    if (!windowStatus || windowStatus.is_active) return null;
    const closedIso =
      windowStatus.grace_deadline_at ||
      windowStatus.deadline_at ||
      windowStatus.closed_at;
    if (!closedIso) return null;
    const closedTime = new Date(closedIso).getTime();
    if (isNaN(closedTime)) return null;
    const elapsedMs = currentTick - closedTime;
    const remainingMs = 2 * 60 * 60 * 1000 - elapsedMs;
    if (remainingMs <= 0) return null;
    const mins = Math.ceil(remainingMs / 60000);
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}h ${m}m`;
    }
    return `${mins}m`;
  };

  // Past submissions list: if the active exam submission is already displayed
  // in the active window card above, exclude it from past submissions below to avoid clutter and duplicate display
  const pastSubmissionsList = useMemo(() => {
    let list = submissions.filter((s) => s.submission_status !== "SUPERSEDED");
    if (shouldShowExamWindowCard && activeExam && activeExamSubmission) {
      list = list.filter((s) => s.exam_id !== activeExam.id);
    }
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const item of list) {
      const key = item.exam_id || item.id;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(item);
      }
    }
    return deduped;
  }, [submissions, shouldShowExamWindowCard, activeExam, activeExamSubmission]);

  // Search & Filter state for dedicated Past Exams tab
  const [searchQuery, setSearchQuery] = useState("");
  const [examSubjectFilter, setExamSubjectFilter] = useState("ALL");
  const [examStatusFilter, setExamStatusFilter] = useState("ALL");
  const [isPastExamsFilterExpanded, setIsPastExamsFilterExpanded] = useState(false);
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});

  // Compute unique subjects present in student submissions
  const uniqueExamSubjects = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach((s) => {
      const sub = s.exam_subject || s.subject;
      if (sub && typeof sub === "string" && sub.trim()) {
        set.add(sub.trim());
      }
    });
    return Array.from(set).sort();
  }, [submissions]);

  // Filtered submissions based on search, subject, and status
  const filteredPastSubmissions = useMemo(() => {
    return pastSubmissionsList.filter((sub) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (sub.exam_title || "").toLowerCase().includes(q);
        const subjectMatch = (sub.exam_subject || sub.subject || "").toLowerCase().includes(q);
        if (!titleMatch && !subjectMatch) return false;
      }
      if (examSubjectFilter !== "ALL") {
        const subName = sub.exam_subject || sub.subject || "";
        if (subName.toLowerCase() !== examSubjectFilter.toLowerCase()) return false;
      }
      if (examStatusFilter !== "ALL") {
        const isPublished =
          sub.publication_status === "PUBLISHED" ||
          (sub.publication_status !== "UNPUBLISHED" && Boolean(sub.exam_is_published || sub.is_published));
        if (examStatusFilter === "PUBLISHED" && !isPublished) return false;
        if (examStatusFilter === "IN_PROGRESS" && isPublished) return false;
      }
      return true;
    });
  }, [pastSubmissionsList, searchQuery, examSubjectFilter, examStatusFilter]);

  const handleToggleAllCards = (expand: boolean) => {
    const updated: Record<string, boolean> = {};
    if (expand) {
      paginatedPastExams.forEach((s) => {
        updated[s.id] = true;
      });
    }
    setExpandedCardIds(updated);
  };

  // Dedicated Past Exams Infinite Scrolling & API State (uses top-level PAST_EXAMS_BATCH_SIZE)
  const [paginatedPastExams, setPaginatedPastExams] = useState<any[]>([]);
  const [pastExamsPage, setPastExamsPage] = useState<number>(1);
  const [hasMorePastExams, setHasMorePastExams] = useState<boolean>(true);
  const [isPastExamsInitialLoading, setIsPastExamsInitialLoading] = useState<boolean>(false);
  const [isLoadingMorePastExams, setIsLoadingMorePastExams] = useState<boolean>(false);
  const [pastExamsTotal, setPastExamsTotal] = useState<number>(0);

  // Refs to avoid tearing down observers or triggering infinite loops on countdowns/polling
  const isLoadingMoreRef = useRef<boolean>(false);
  const isInitialLoadingRef = useRef<boolean>(false);
  const pastExamsPageRef = useRef<number>(1);
  pastExamsPageRef.current = pastExamsPage;
  const hasMorePastExamsRef = useRef<boolean>(true);
  hasMorePastExamsRef.current = hasMorePastExams;

  const filteredPastSubmissionsRef = useRef<any[]>(filteredPastSubmissions);
  filteredPastSubmissionsRef.current = filteredPastSubmissions;

  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const activeFilterKeyRef = useRef<string>("");

  // Core batch fetching function (stable identity, unaffected by background polling or timer ticks)
  const fetchPastExamsPage = useCallback(
    async (pageToFetch: number, isReset = false) => {
      if (isReset) {
        setIsPastExamsInitialLoading(true);
        isInitialLoadingRef.current = true;
      } else {
        if (isLoadingMoreRef.current || !hasMorePastExamsRef.current) return;
        setIsLoadingMorePastExams(true);
        isLoadingMoreRef.current = true;
      }

      try {
        const res = await api.getStudentPastSubmissions({
          page: pageToFetch,
          limit: PAST_EXAMS_BATCH_SIZE,
          search: searchQuery,
          subject: examSubjectFilter,
          status: examStatusFilter,
        });

        if (res && Array.isArray(res.items)) {
          if (pageToFetch === 1) {
            setPaginatedPastExams(res.items);
          } else {
            setPaginatedPastExams((prev) => {
              const existingIds = new Set(prev.map((i) => i.id));
              const fresh = res.items.filter((i: any) => !existingIds.has(i.id));
              return [...prev, ...fresh];
            });
          }
          const totalCount = typeof res.total === "number" ? res.total : res.items.length;
          setPastExamsTotal(totalCount);
          const hasMore = Boolean(res.has_more);
          setHasMorePastExams(hasMore);
          hasMorePastExamsRef.current = hasMore;
          setPastExamsPage(pageToFetch);
          pastExamsPageRef.current = pageToFetch;
          return;
        }
      } catch (err) {
        console.warn("API past submissions fetch failed, falling back to cached portal data", err);
      } finally {
        if (isReset) {
          setIsPastExamsInitialLoading(false);
          isInitialLoadingRef.current = false;
        } else {
          setIsLoadingMorePastExams(false);
          isLoadingMoreRef.current = false;
        }
      }

      // Fallback: slice from local filtered submissions without triggering re-render cascades
      const localSubs = filteredPastSubmissionsRef.current || [];
      const offset = (pageToFetch - 1) * PAST_EXAMS_BATCH_SIZE;
      const slice = localSubs.slice(offset, offset + PAST_EXAMS_BATCH_SIZE);
      if (pageToFetch === 1) {
        setPaginatedPastExams(slice);
      } else {
        setPaginatedPastExams((prev) => {
          const existingIds = new Set(prev.map((i) => i.id));
          const fresh = slice.filter((i: any) => !existingIds.has(i.id));
          return [...prev, ...fresh];
        });
      }
      setPastExamsTotal(localSubs.length);
      const hasMore = offset + slice.length < localSubs.length;
      setHasMorePastExams(hasMore);
      hasMorePastExamsRef.current = hasMore;
      setPastExamsPage(pageToFetch);
      pastExamsPageRef.current = pageToFetch;
    },
    [searchQuery, examSubjectFilter, examStatusFilter]
  );

  // Only trigger reset and initial fetch when tab is "exams" and filter criteria genuinely changes
  useEffect(() => {
    if (activeTab !== "exams") return;

    const filterKey = `${searchQuery.trim().toLowerCase()}|${examSubjectFilter}|${examStatusFilter}`;
    // If the filters haven't changed and we already have loaded cards, NEVER reset or refetch!
    if (activeFilterKeyRef.current === filterKey && paginatedPastExams.length > 0) {
      return;
    }
    activeFilterKeyRef.current = filterKey;

    let isMounted = true;
    const timer = setTimeout(() => {
      if (!isMounted) return;
      fetchPastExamsPage(1, true);
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [activeTab, searchQuery, examSubjectFilter, examStatusFilter, fetchPastExamsPage, paginatedPastExams.length]);

  // Callback ref: immediately attaches IntersectionObserver the moment sentinel mounts into the DOM
  const sentinelObserverRef = useRef<IntersectionObserver | null>(null);
  const sentinelCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (sentinelObserverRef.current) {
        sentinelObserverRef.current.disconnect();
        sentinelObserverRef.current = null;
      }
      if (node && activeTab === "exams") {
        const observer = new IntersectionObserver(
          (entries) => {
            const first = entries[0];
            if (
              first.isIntersecting &&
              hasMorePastExamsRef.current &&
              !isLoadingMoreRef.current &&
              !isInitialLoadingRef.current
            ) {
              fetchPastExamsPage(pastExamsPageRef.current + 1, false);
            }
          },
          { root: null, rootMargin: "400px", threshold: 0 }
        );
        observer.observe(node);
        sentinelObserverRef.current = observer;
      }
    },
    [activeTab, fetchPastExamsPage]
  );

  // Window scroll fallback to guarantee detection even on touch devices / fast scrolling
  useEffect(() => {
    if (activeTab !== "exams") return;

    const handleWindowScroll = () => {
      if (!hasMorePastExamsRef.current || isLoadingMoreRef.current || isInitialLoadingRef.current) {
        return;
      }
      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const clientHeight = window.innerHeight || document.documentElement.clientHeight;

      if (scrollHeight - (scrollTop + clientHeight) < 450) {
        fetchPastExamsPage(pastExamsPageRef.current + 1, false);
      }
    };

    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleWindowScroll);
  }, [activeTab, fetchPastExamsPage]);

  const toggleCard = useCallback((id: string) => {
    setExpandedCardIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const handleOpenArtifacts = useCallback((sub: any) => {
    setArtifactModalExam({
      id: sub.exam_id,
      title: sub.exam_title,
      subject: sub.exam_subject || sub.subject,
      has_question_paper: sub.has_question_paper,
      has_answer_key: sub.has_answer_key,
      is_document_purged: sub.exam_is_document_purged,
    });
    setArtifactModalInitialTab(sub.has_answer_key ? "answer-key" : "question-paper");
    setArtifactModalOpen(true);
  }, []);

  // Open Revaluation Modal for a specific submission
  const handleOpenRevalModal = useCallback(async (sub: any) => {
    setRevalSubmission(sub);
    setSelectedQuestions([]);
    setRevalReason("");
    setRevalMsg(null);
    setRevalModalOpen(true);

    if (!sub.answers || sub.answers.length === 0) {
      try {
        const details = await api.getSubmission(sub.id);
        if (details && details.answers) {
          setRevalSubmission((prev: any) => ({
            ...prev,
            ...details,
            answers: details.answers,
          }));
        }
      } catch (err) {
        console.warn("Could not fetch detailed answers for revaluation modal", err);
      }
    }
  }, []);

  // Open Breakdown Modal for a specific submission
  const handleOpenBreakdownModal = useCallback(async (sub: any) => {
    const isPub =
      sub.publication_status === "PUBLISHED" ||
      (sub.publication_status !== "UNPUBLISHED" && Boolean(sub.exam_is_published || sub.is_published));
    if (!isPub) {
      toast.info("Evaluation marks and summary are undergoing faculty review and will be accessible once officially published.", {
        title: "Grading in Progress",
      });
      return;
    }
    setBreakdownSubmission(sub);
    setExpandedQuestionIds({});
    setBreakdownModalOpen(true);

    const hasDetailsAlready = Boolean(
      sub.answers &&
      sub.answers.length > 0 &&
      sub.answers.some((a: any) => (a.criterion_scores && a.criterion_scores.length > 0) || a.question_text)
    );
    setIsBreakdownLoadingDetails(!hasDetailsAlready);

    // Fetch full question answers breakdown (including criteria, official answer, and AI transcription)
    try {
      const details = await api.getSubmission(sub.id);
      if (details && details.answers) {
        setBreakdownSubmission((prev: any) => ({
          ...prev,
          ...details,
          answers: details.answers,
        }));
        setSubmissions((prevList) =>
          prevList.map((s) => (s.id === sub.id ? { ...s, ...details, answers: details.answers } : s))
        );
      }
    } catch (err) {
      console.warn("Could not fetch detailed answers for breakdown modal", err);
    } finally {
      setIsBreakdownLoadingDetails(false);
    }
  }, [toast]);

  // Revaluation submission handler
  const handleRevalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revalSubmission || selectedQuestions.length === 0 || !revalReason.trim()) return;

    setRevalLoading(true);
    try {
      await api.requestRevaluation(revalSubmission.id, {
        question_ids: selectedQuestions,
        student_reason: revalReason.trim(),
      });
      const successMsg = "Revaluation request submitted. Senior faculty will manually review your paper.";
      setRevalMsg(successMsg);
      toast.success(successMsg, { title: "Request Received", duration: 4000 });
      
      // Update local submissions list optimistically
      setSubmissions((prev) =>
        prev.map((s) => {
          if (s.id === revalSubmission.id) {
            return {
              ...s,
              revaluation: {
                id: `rev_pending_${Date.now()}`,
                status: "SUBMITTED",
                question_ids_json: JSON.stringify(selectedQuestions),
                student_reason: revalReason.trim(),
                requested_at: new Date().toISOString(),
              },
            };
          }
          return s;
        })
      );

      setTimeout(() => {
        setRevalModalOpen(false);
        setRevalMsg(null);
        loadPortalData();
      }, 1200);
    } catch (err: any) {
      const errorMsg = err.message || "Failed to submit revaluation request.";
      setRevalMsg(errorMsg);
      toast.error(errorMsg, { title: "Submission Failed" });
    } finally {
      setRevalLoading(false);
    }
  };

  if (loading) {
    return <StudentPortalSkeleton />;
  }

  // Summary Metrics
  const totalSubmissionsCount = submissions.length;
  const publishedSubmissions = submissions.filter(
    (s) => s.publication_status === "PUBLISHED" || s.exam_is_published || s.is_published
  );
  const avgPercentage =
    publishedSubmissions.length > 0
      ? (
          publishedSubmissions.reduce((acc, curr) => acc + (Number(curr.percentage) || 0), 0) /
          publishedSubmissions.length
        ).toFixed(1)
      : null;
  const activeRevalsCount = submissions.filter(
    (s) => s.revaluation && (s.revaluation.status === "SUBMITTED" || s.revaluation.status === "UNDER_REVIEW")
  ).length;

  const rollNumber = user?.roll_number || user?.student?.roll_number || "Enrolled";
  const studentIdDisplay = user?.student_id_num || user?.student?.student_id_num || user?.id;

  return (
    <div className="max-w-5xl mx-auto space-y-5 sm:space-y-7 pt-5 sm:pt-8 pb-16 px-3 sm:px-6 cascade-group overflow-x-hidden">
      {/* Header Profile Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-3 border-b border-hairline">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              Welcome, {user?.full_name || "Student"}
            </h1>
          </div>
          <div className="text-xs text-ink-muted mt-1 leading-normal flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="whitespace-nowrap">
              Roll No: <strong className="text-ink font-medium font-mono">{rollNumber}</strong>
            </span>
            <span className="text-ink-faint hidden xs:inline">•</span>
            <span className="whitespace-nowrap">
              Student ID: <strong className="text-ink font-medium font-mono">{studentIdDisplay}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setReportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold btn-glass-utility transition-all cursor-pointer shadow-2xs"
            title="Report a technical issue with the portal"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-primary" />
            <span>Report Issue</span>
          </button>
        </div>
      </div>

      {/* Portal Top Navigation Switcher (Instant Animated Segmented Control) */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-canvas-soft/80 border border-hairline w-full sm:w-auto">
        <button
          type="button"
          onClick={() => handleTabSwitch("dashboard")}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs transition-all duration-200 cursor-pointer ${
            activeTab === "dashboard"
              ? "font-bold text-ink bg-surface shadow-2xs border border-hairline/60"
              : "font-semibold text-ink-muted hover:text-ink hover:bg-surface/50 border border-transparent"
          }`}
        >
          <Layers className={`h-3.5 w-3.5 ${activeTab === "dashboard" ? "text-primary" : "text-ink-muted"}`} />
          <span>Dashboard</span>
          {activeWindows.length > 0 && (
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabSwitch("exams")}
          className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs transition-all duration-200 cursor-pointer ${
            activeTab === "exams"
              ? "font-bold text-ink bg-surface shadow-2xs border border-hairline/60"
              : "font-semibold text-ink-muted hover:text-ink hover:bg-surface/50 border border-transparent"
          }`}
        >
          <BookOpen className={`h-3.5 w-3.5 ${activeTab === "exams" ? "text-primary" : "text-ink-muted"}`} />
          <span>Past Exams</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-canvas-soft border border-hairline/60 text-ink-muted">
            {pastSubmissionsList.length}
          </span>
        </button>
      </div>

      {/* Tab Views with Mobile Touch Swipe Navigation */}
      <div
        className="w-full"
        onTouchStart={handlePortalTouchStart}
        onTouchEnd={handlePortalTouchEnd}
      >
        {activeTab === "dashboard" ? (
          <div
            key="dashboard-tab-view"
            className={`space-y-6 overflow-hidden ${
              tabDirection === "left" ? "animate-tab-slide-left" : "animate-tab-slide-right"
            }`}
          >

      {/* Push Notification Permission Opt-in Prompt */}
      {isSupported && permission === "default" && !hideNotifBanner && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-primary/25 bg-primary/5 shadow-2xs animate-in fade-in">
          <div className="flex items-start sm:items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-ink">Turn on Push Notifications</h3>
              <p className="text-[11px] text-ink-muted leading-tight mt-0.5">
                Get real-time device alerts the moment your answer sheets are graded, rubrics scored, or revaluations published.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setHideNotifBanner(true)}
              className="px-2.5 py-1 text-[11px] font-medium text-ink-secondary hover:text-ink transition-colors cursor-pointer"
            >
              Later
            </button>
            <button
              type="button"
              onClick={async () => {
                const ok = await requestPermission();
                if (ok) setHideNotifBanner(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary-active transition-colors shadow-2xs cursor-pointer"
            >
              <Sparkles className="h-3 w-3" />
              Enable Alerts
            </button>
          </div>
        </div>
      )}

      {/* Top Academic Summary Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 cascade-fast">
        <div className="rounded-lg border border-hairline bg-surface p-2.5 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[10px] sm:text-[11px] font-medium">Submitted</span>
            <Layers className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-ink mt-1">{totalSubmissionsCount}</div>
          <div className="text-[9.5px] sm:text-[10px] text-ink-muted mt-0.5 truncate">Verified sheets</div>
        </div>

        <div className="rounded-lg border border-hairline bg-surface p-2.5 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[10px] sm:text-[11px] font-medium">Published</span>
            <Award className="h-3.5 w-3.5 text-[#1aae39]" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-ink mt-1">{publishedSubmissions.length}</div>
          <div className="text-[9.5px] sm:text-[10px] text-ink-muted mt-0.5 truncate">Official scores</div>
        </div>

        <div className="rounded-lg border border-hairline bg-surface p-2.5 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[10px] sm:text-[11px] font-medium">Average</span>
            <Sparkles className="h-3.5 w-3.5 text-[#793caf]" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-ink mt-1">
            {avgPercentage !== null ? `${avgPercentage}%` : "—"}
          </div>
          <div className="text-[9.5px] sm:text-[10px] text-ink-muted mt-0.5 truncate">All exams</div>
        </div>

        <div className="rounded-lg border border-hairline bg-surface p-2.5 sm:p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[10px] sm:text-[11px] font-medium">Revaluations</span>
            <RotateCcw className="h-3.5 w-3.5 text-[#d97706]" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-ink mt-1">{activeRevalsCount}</div>
          <div className="text-[9.5px] sm:text-[10px] text-ink-muted mt-0.5 truncate">
            {activeRevalsCount > 0 ? "Under review" : "No appeals"}
          </div>
        </div>
      </div>

      {/* Minimal Marks Trajectory Graph */}
      <StudentMarksTrajectory submissions={submissions} />

      {/* Active Exam Submission Window Card (Only displayed if open, or if closed within the last 2 hours) */}
      {shouldShowExamWindowCard && activeExam && (
        <div className="space-y-3">
          {/* Multi-Window Selector (Rendered whenever 2 or more exam windows are open concurrently) */}
          {activeWindows.length > 1 && (
            <div className="p-3 sm:p-4 rounded-xl bg-gradient-to-r from-blue-50/90 to-indigo-50/70 border border-blue-200/90 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-blue-950 uppercase tracking-wider">
                    {activeWindows.length} Exam Windows Currently Open
                  </span>
                </div>
                <span className="text-[11px] font-medium text-blue-700">Select paper to submit:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activeWindows.map((winItem) => {
                  const isSelected = winItem.exam?.id === activeExam?.id;
                  const remaining = winItem.window_status?.seconds_remaining || 0;
                  return (
                    <button
                      key={winItem.exam.id}
                      type="button"
                      disabled={uploading}
                      onClick={() => {
                        if (uploading) return;
                        if (scannedPages.length > 0 && !isSelected) {
                          if (
                            !confirm(
                              "You have scanned pages staged for upload. Switching exams will clear them. Continue?"
                            )
                          ) {
                            return;
                          }
                          setScannedPages([]);
                        }
                        setSelectedExamId(winItem.exam.id);
                      }}
                      className={`flex items-center justify-between p-3 rounded-lg text-left transition-all border ${
                        isSelected
                          ? "bg-surface dark:bg-[#202020] border-primary shadow-sm ring-1.5 ring-primary"
                          : "bg-surface/80 dark:bg-[#1a1a1a] hover:bg-surface border-hairline hover:border-primary/50 text-ink-secondary"
                      } ${uploading ? "opacity-50 cursor-not-allowed pointer-events-none" : "cursor-pointer"}`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              isSelected ? "bg-primary" : "bg-slate-300"
                            }`}
                          />
                          <span className="text-xs font-bold text-ink truncate">
                            {winItem.exam.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-muted truncate pl-3.5">
                          {winItem.exam.subject || "General"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                            remaining < 300
                              ? "bg-amber-100 text-amber-900 border border-amber-200"
                              : "bg-blue-100/80 text-blue-900 border border-blue-200"
                          }`}
                        >
                          {formatCountdown(remaining)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <FeatureCard className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <BadgePill
                  label={
                    windowStatus?.is_active
                      ? windowStatus.is_in_grace
                        ? "Grace Period (2m)"
                        : "Submission Window Open"
                      : "Window Closed"
                  }
                  color={
                    windowStatus?.is_active
                      ? windowStatus.is_in_grace
                        ? "orange"
                        : "green"
                      : "gray"
                  }
                />
                <span className="text-xs text-ink-muted">• {activeExam.subject}</span>
                {!windowStatus?.is_active && getRemainingCardTime() && (
                  <span className="text-[11px] text-ink-muted bg-canvas-soft border border-hairline px-2 py-0.5 rounded-full">
                    Notice disappears in {getRemainingCardTime()}
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-ink">{activeExam.title}</h2>
            </div>

            {/* Countdown Clock */}
            {windowStatus?.is_active && (
              <div className="flex items-center gap-2 bg-canvas-soft border border-hairline px-3.5 py-2 rounded-md">
                <Clock className="h-4 w-4 text-primary animate-pulse" />
                <div>
                  <div className="text-[10px] uppercase font-semibold text-ink-muted leading-none">
                    Time Remaining
                  </div>
                  <div className="text-base font-mono font-bold text-ink leading-tight">
                    {formatCountdown(windowStatus.seconds_remaining)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Submission Section */}
          <div className="mt-5 space-y-4">
            {activeExamSubmission && !isReplacingUpload ? (
              /* Already submitted answer sheet card */
              <div className="rounded-xl border border-hairline bg-surface p-4 sm:p-5 space-y-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-[#edf5f0] text-[#1e613b] dark:bg-[#13231a] dark:text-[#86d4a4] border border-[#c8e2d2] dark:border-[#1d3d2a] flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-ink">Answer Sheet Submitted</h3>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#edf5f0] text-[#1e613b] border border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a]">
                          Recorded
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted mt-0.5">
                        Submitted on{" "}
                        {activeExamSubmission.created_at
                          ? new Date(activeExamSubmission.created_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Recently recorded"}
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] self-start sm:self-auto">
                    <Clock className="h-3.5 w-3.5 text-[#7a4e18] dark:text-[#e5ad68]" />
                    {activeExamSubmission.status === "EVALUATED" || activeExamSubmission.publication_status === "PUBLISHED"
                      ? "Evaluation Complete"
                      : "Grading in Progress"}
                  </span>
                </div>

                <div className="p-3.5 rounded-lg bg-canvas-soft border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-3 text-ink-muted">
                    <span className="whitespace-nowrap font-mono text-[11px] bg-surface/80 dark:bg-[#1f1f1f] px-2 py-0.5 rounded-md border border-hairline/60">
                      Roll: <strong className="text-ink font-semibold">{activeExamSubmission.roll_number}</strong>
                    </span>
                    {activeExamSubmission.page_count && (
                      <>
                        <span className="text-ink-faint">•</span>
                        <span className="whitespace-nowrap">
                          Pages: <strong className="text-ink font-semibold">{activeExamSubmission.page_count}</strong>
                        </span>
                      </>
                    )}
                  </div>
                  <span className="text-[11px] text-ink-muted">
                    Answer sheet recorded securely. Detailed marks unlock upon publication.
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                  <Link
                    href={`/student/submissions/${activeExamSubmission.id}`}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-hover shadow-xs active:scale-[0.98] transition-all text-center"
                  >
                    <Eye className="h-4 w-4" />
                    <span>View Submitted Script →</span>
                  </Link>

                  {windowStatus?.is_active && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsReplacingUpload(true);
                        handleClearAllPages();
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-surface border border-hairline hover:bg-canvas-soft text-ink hover:text-primary text-xs font-semibold transition-colors cursor-pointer text-center"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-ink-muted" />
                      <span>Replace Answer Sheet</span>
                    </button>
                  )}
                </div>
              </div>
            ) : windowStatus?.is_active ? (
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                {isReplacingUpload && (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertCircle className="h-4 w-4 text-[#7a4e18] dark:text-[#e5ad68] shrink-0" />
                      <span>Uploading a new file will replace your existing submitted answer sheet.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsReplacingUpload(false);
                        handleClearAllPages();
                      }}
                      className="text-xs font-semibold text-[#7a4e18] dark:text-[#e5ad68] underline hover:no-underline shrink-0 cursor-pointer"
                    >
                      Keep Current
                    </button>
                  </div>
                )}
                {/* Hidden File Inputs */}
                {/* 1. Camera Input (Environment Camera for Direct Page Scanning) */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleAddFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                {/* 2. File / Gallery Picker Input (Multi-Image or PDF) */}
                <input
                  ref={filePickerRef}
                  type="file"
                  accept=".pdf,image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleAddFiles(e.target.files);
                    e.target.value = "";
                  }}
                />

                {scannedPages.length === 0 ? (
                  /* Empty state: Choice between Camera Scan and File Picker */
                  <div className="rounded-xl border-2 border-dashed border-hairline hover:border-primary/50 bg-canvas-soft/40 p-6 sm:p-8 text-center transition-all">
                    <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
                      <Camera className="h-6 w-6" />
                    </div>
                    <h3 className="text-sm font-bold text-ink">
                      Capture or Upload Answer Sheet
                    </h3>
                    <p className="text-xs text-ink-muted max-w-sm mx-auto mt-1 mb-5">
                      Snap pages sequentially with your phone camera, or upload a single combined PDF (Max 15 pages, 7 MB).
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-hover shadow-xs active:scale-[0.98] transition-all cursor-pointer"
                      >
                        <Camera className="h-4 w-4" />
                        <span>Scan Page (Camera)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => filePickerRef.current?.click()}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-surface border border-hairline text-ink hover:bg-canvas-soft text-xs font-semibold shadow-xs active:scale-[0.98] transition-all cursor-pointer"
                      >
                        <Upload className="h-4 w-4 text-ink-muted" />
                        <span>Choose Photos / PDF</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Scanned Pages List / Review Section */
                  <div className="rounded-xl border border-hairline bg-surface p-4 sm:p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-hairline pb-3">
                      <div className="flex items-center gap-2">
                        <FileCheck2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-xs font-bold text-ink">
                          {scannedPages.length === 1 && scannedPages[0].isPdf
                            ? "Document Ready"
                            : `Scanned Pages (${scannedPages.length} of 15)`}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={handleClearAllPages}
                        className={`text-[11px] font-medium flex items-center gap-1 transition-colors ${
                          uploading
                            ? "text-red-400/40 opacity-40 cursor-not-allowed pointer-events-none"
                            : "text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                        }`}
                      >
                        <Trash2 className="h-3 w-3" />
                        Reset
                      </button>
                    </div>

                    {scannedPages.length === 1 && scannedPages[0].isPdf ? (
                      /* Single PDF Preview Card */
                      <div className={`flex items-center justify-between p-3 rounded-lg border border-hairline transition-all ${
                        uploading ? "bg-canvas-soft/30 opacity-60 pointer-events-none select-none" : "bg-canvas-soft/60"
                      }`}>
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <div className="h-10 w-10 rounded-md bg-red-100 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink truncate break-all max-w-[200px] sm:max-w-md">
                              {scannedPages[0].name}
                            </p>
                            <p className="text-[11px] text-ink-muted font-mono">
                              {(scannedPages[0].size / (1024 * 1024)).toFixed(2)} MB • Combined PDF
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={uploading}
                          onClick={() => filePickerRef.current?.click()}
                          className={`text-xs font-medium shrink-0 transition-colors ${
                            uploading
                              ? "text-primary/40 opacity-40 cursor-not-allowed pointer-events-none"
                              : "text-primary hover:underline cursor-pointer"
                          }`}
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      /* Scanned Image Pages Grid with Reorder / Delete Controls */
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                          {scannedPages.map((page, idx) => (
                            <div
                              key={page.id}
                              className={`flex items-center justify-between p-2.5 rounded-lg border border-hairline transition-all ${
                                uploading
                                  ? "bg-canvas-soft/30 opacity-60 pointer-events-none select-none"
                                  : "bg-canvas-soft/40 hover:bg-canvas-soft/80"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                {page.previewUrl ? (
                                  <img
                                    src={page.previewUrl}
                                    alt={`Page ${idx + 1}`}
                                    className="h-12 w-9 rounded object-cover border border-hairline shrink-0 shadow-2xs"
                                  />
                                ) : (
                                  <div className="h-12 w-9 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                    <ImageIcon className="h-4 w-4" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                      Page {idx + 1}
                                    </span>
                                  </div>
                                  <p className="text-[11px] font-mono text-ink-muted truncate break-all max-w-[120px] sm:max-w-[160px] mt-0.5">
                                    {page.name}
                                  </p>
                                  <p className="text-[10px] text-ink-faint">
                                    {(page.size / 1024).toFixed(0)} KB
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  disabled={uploading || idx === 0}
                                  onClick={() => handleMovePage(idx, "up")}
                                  title="Move earlier"
                                  className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={uploading || idx === scannedPages.length - 1}
                                  onClick={() => handleMovePage(idx, "down")}
                                  title="Move later"
                                  className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={uploading}
                                  onClick={() => handleRemovePage(idx)}
                                  title="Delete page"
                                  className={`p-1 rounded transition-colors ${
                                    uploading
                                      ? "text-ink-muted/30 opacity-30 cursor-not-allowed pointer-events-none"
                                      : "text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                                  }`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Page Add Controls */}
                        {scannedPages.length < 15 && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              disabled={uploading}
                              onClick={() => cameraInputRef.current?.click()}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-canvas-soft border border-hairline text-xs font-medium transition-colors ${
                                uploading
                                  ? "opacity-40 cursor-not-allowed pointer-events-none text-ink-muted"
                                  : "hover:border-primary text-ink hover:text-primary cursor-pointer"
                              }`}
                            >
                              <Camera className="h-3.5 w-3.5" />
                              <span>+ Scan Next Page (Camera)</span>
                            </button>
                            <button
                              type="button"
                              disabled={uploading}
                              onClick={() => filePickerRef.current?.click()}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-canvas-soft border border-hairline text-xs font-medium transition-colors ${
                                uploading
                                  ? "opacity-40 cursor-not-allowed pointer-events-none text-ink-muted"
                                  : "hover:border-primary text-ink hover:text-primary cursor-pointer"
                              }`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Add Photos</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {uploading && assemblyProgress && (
                  <div className="rounded-xs bg-brand-50 border border-brand-200 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-brand-700 font-medium">
                      <span className="flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5 animate-spin text-brand-600" />
                        {assemblyProgress.statusMessage}
                      </span>
                      <span>{assemblyProgress.percent}%</span>
                    </div>
                    <div className="w-full bg-brand-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-brand-600 h-1.5 transition-all duration-200 ease-out rounded-full"
                        style={{ width: `${assemblyProgress.percent}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-brand-600/80">
                      Preparing high-quality PDF for submission...
                    </p>
                  </div>
                )}

                {uploadError && (
                  <div className="rounded-xs bg-red-50 border border-red-200 p-2.5 text-xs text-red-600">
                    {uploadError}
                  </div>
                )}
                {uploadSuccess && (
                  <div className="rounded-xs bg-green-50 border border-green-200 p-2.5 text-xs text-green-700">
                    {uploadSuccess}
                  </div>
                )}

                {scannedPages.length > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <div className="text-xs text-ink-muted">
                      <span className="font-semibold text-ink">
                        {(scannedPages.reduce((acc, p) => acc + p.size, 0) / (1024 * 1024)).toFixed(2)} MB
                      </span>{" "}
                      across {scannedPages.length} {scannedPages.length === 1 ? "page" : "pages"}
                    </div>
                    <ButtonPrimary
                      type="submit"
                      isLoading={uploading}
                      className="w-full sm:w-auto"
                    >
                      {uploading
                        ? assemblyProgress && assemblyProgress.stage !== "ready"
                          ? "Preparing Document..."
                          : "Uploading PDF..."
                        : "Submit Answer Sheet"}
                    </ButtonPrimary>
                  </div>
                )}
              </form>
            ) : (
              <div className="flex items-center gap-2.5 text-xs text-ink-muted py-1">
                <Info className="h-4 w-4 text-ink-faint shrink-0" />
                <span>
                  The upload window for <strong className="text-ink">{activeExam.title}</strong> is currently closed.
                </span>
              </div>
            )}
          </div>
        </FeatureCard>
        </div>
      )}

      {/* SECTION: PAST EXAM SUBMISSIONS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-ink">Past Exam Submissions</h2>
              {pastSubmissionsList.length > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-canvas-soft border border-hairline text-ink-muted shrink-0">
                  {pastSubmissionsList.length} {pastSubmissionsList.length === 1 ? "Paper" : "Papers"}
                </span>
              )}
            </div>
            <p className="text-xs text-ink-muted leading-relaxed mt-0.5">
              Review evaluated answer sheets, question-by-question marks, and faculty revaluations.
            </p>
          </div>
        </div>

        {pastSubmissionsList.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-surface p-6 sm:p-8 text-center space-y-2">
            <FileText className="h-7 w-7 text-ink-faint mx-auto" />
            <h3 className="text-sm font-semibold text-ink">No past exam submissions</h3>
            <p className="text-xs text-ink-muted max-w-sm mx-auto">
              Your evaluated answer sheets and marks from completed exams will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              {pastSubmissionsList.slice(0, 1).map((sub) => {
              const isAbsent = sub.status === "ABSENT" || Boolean(sub.is_absent);
              const isExamPublished =
                !isAbsent &&
                Boolean(
                  sub.exam_is_published === 1 ||
                  sub.exam_is_published === true ||
                  sub.exam_lifecycle_status === "PUBLISHED" ||
                  sub.exam_status === "PUBLISHED"
                );
              const isPublished =
                !isAbsent && (
                  sub.publication_status === "PUBLISHED" ||
                  (sub.publication_status !== "UNPUBLISHED" && Boolean(sub.exam_is_published || sub.is_published))
                );
              const hasAnswers = sub.answers && sub.answers.length > 0;
              const reval = sub.revaluation;
              const hasOpenReval =
                reval && (reval.status === "SUBMITTED" || reval.status === "UNDER_REVIEW");
              const isRevalResolved = reval && reval.status === "RESOLVED";

              return (
                <FeatureCard key={sub.id} className="p-4 sm:p-5 space-y-4">
                  {/* Top Bar: Exam Title & Publication Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-4 pb-3 border-b border-hairline">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm sm:text-base font-bold text-ink leading-snug">
                          {sub.exam_title || "Academic Examination"}
                        </span>
                        {sub.exam_subject && (
                          <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-md bg-canvas-soft border border-hairline text-ink-muted shrink-0">
                            {sub.exam_subject}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-muted mt-0.5">
                        <span className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                          <Calendar className="h-3 w-3 text-ink-muted shrink-0" />
                          <span>
                            {isAbsent ? "Examination missed" : "Submitted on"}{" "}
                            {sub.created_at
                              ? new Date(sub.created_at).toLocaleDateString(undefined, {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Recorded"}
                          </span>
                        </span>
                        <span className="text-ink-faint hidden xs:inline">•</span>
                        <span className="inline-flex items-center font-mono whitespace-nowrap bg-canvas-soft/70 dark:bg-[#1a1a1a] border border-hairline/60 px-1.5 py-0.5 rounded-md text-[10.5px] text-ink-secondary shrink-0">
                          Roll: <strong className="text-ink ml-1 font-semibold">{sub.roll_number}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-start sm:self-auto pt-0.5 sm:pt-0">
                      {isAbsent ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                          <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                          Absent
                        </span>
                      ) : isPublished ? (
                        <>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50 whitespace-nowrap">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            Results Published
                          </span>
                          {sub.is_document_purged ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/50 whitespace-nowrap">
                              <AlertCircle className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                              PDF Archived
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700/50 whitespace-nowrap"
                              title="Graded PDFs are deleted 15 days post-evaluation to optimize system storage."
                            >
                              <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                              {sub.days_remaining !== undefined && sub.days_remaining !== null
                                ? `${sub.days_remaining}d until PDF purge`
                                : "15d PDF retention"}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] shadow-2xs whitespace-nowrap">
                          <Clock className="h-3.5 w-3.5 text-[#7a4e18] dark:text-[#e5ad68]" />
                          Grading in Progress
                        </span>
                      )}

                      {/* Revaluation Status Pill */}
                      {hasOpenReval && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#faf4ec] text-[#7a4e18] border border-[#e8dac5] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] whitespace-nowrap">
                          <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                          Revaluation In Review
                        </span>
                      )}
                      {isRevalResolved && reval.decision === "MARKS_REVISED" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#edf5f0] text-[#1e613b] border border-[#c8e2d2] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] whitespace-nowrap">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Marks Revised
                        </span>
                      )}
                      {isRevalResolved && reval.decision === "MARKS_UPHELD" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#f1f0ee] text-[#4d4a46] border border-[#dedcd8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-[#1e1e1e] dark:text-[#a8a6a2] dark:border-[#2f2f2f] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] whitespace-nowrap">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Marks Upheld
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score & Revaluation Feedback Banner */}
                  {isAbsent ? (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-lg bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40">
                      <div className="flex items-center gap-2.5">
                        <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-rose-900 dark:text-rose-200">Candidate Recorded as Absent</div>
                          <div className="text-[11px] text-rose-700 dark:text-rose-400">
                            No answer sheet was uploaded during the exam window. This paper was not evaluated.
                          </div>
                        </div>
                      </div>
                      <div className="text-left sm:text-right shrink-0">
                        <div className="text-sm font-bold text-rose-700 dark:text-rose-300 font-mono">0.0 / {sub.exam_total_marks || 25}</div>
                        <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold uppercase">Absent</div>
                      </div>
                    </div>
                  ) : isPublished ? (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2.5 sm:p-3.5 rounded-lg bg-canvas-soft border border-hairline">
                      <div className="grid grid-cols-3 sm:flex items-center gap-2 sm:gap-4">
                        <div>
                          <div className="text-[10px] sm:text-[11px] font-medium text-ink-muted leading-none">
                            Total Score
                          </div>
                          <div className="text-base sm:text-xl font-bold text-ink mt-0.5 leading-tight">
                            {sub.total_awarded_marks !== null && sub.total_awarded_marks !== undefined
                              ? Number(sub.total_awarded_marks).toFixed(1)
                              : "—"}{" "}
                            <span className="text-[10px] sm:text-xs font-normal text-ink-muted">
                              / {sub.max_marks || sub.exam_total_marks || 25}m
                            </span>
                          </div>
                        </div>

                        <div className="h-7 w-px bg-hairline hidden sm:block" />

                        <div>
                          <div className="text-[10px] sm:text-[11px] font-medium text-ink-muted leading-none">
                            Percentage
                          </div>
                          <div className="text-sm sm:text-base font-bold text-ink mt-0.5 leading-tight">
                            {sub.percentage !== null && sub.percentage !== undefined
                              ? `${Number(sub.percentage).toFixed(1)}%`
                              : "—"}
                          </div>
                        </div>

                        <div className="h-7 w-px bg-hairline hidden sm:block" />

                        <div>
                          <div className="text-[10px] sm:text-[11px] font-medium text-ink-muted leading-none">
                            Questions
                          </div>
                          <div className="text-[11px] sm:text-xs font-semibold text-ink mt-0.5 leading-tight truncate">
                            {hasAnswers ? `${sub.answers.length} Graded` : "Registered"}
                          </div>
                        </div>
                      </div>

                      {/* Revaluation Details if Resolved */}
                      {isRevalResolved && reval.reviewer_notes && (
                        <div className="sm:max-w-xs text-left bg-surface border border-hairline p-2 rounded-md">
                          <div className="text-[10px] font-semibold text-ink-secondary">
                            Faculty Feedback:
                          </div>
                          <p className="text-[11px] text-ink italic line-clamp-2">
                            "{reval.reviewer_notes}"
                          </p>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Actions Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                      {/* Primary: Inspect in PDF Viewer */}
                      <Link
                        href={`/student/submissions/${sub.id}`}
                        className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md btn-glass-primary px-4 cursor-pointer text-center shrink-0 whitespace-nowrap"
                      >
                        <Eye className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {isPublished
                            ? sub.is_document_purged
                              ? "View Archived Question Marks →"
                              : "Inspect in PDF Viewer →"
                            : "View Submitted Script →"}
                        </span>
                      </Link>

                      {/* Secondary: View Breakdown */}
                      {isPublished ? (
                        <button
                          type="button"
                          onClick={() => handleOpenBreakdownModal(sub)}
                          className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md btn-glass-utility px-3.5 cursor-pointer text-center whitespace-nowrap shrink-0"
                        >
                          <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>View Summary</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          title="Detailed breakdown will be accessible once marks are officially published by faculty."
                          className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted/80 bg-canvas-soft border border-hairline/70 px-3.5 rounded-md cursor-not-allowed select-none text-center whitespace-nowrap shrink-0 opacity-60"
                        >
                          <FileText className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                          <span>Summary Pending</span>
                        </button>
                      )}

                      {/* Class Standings & Rankings (Only visible once exam results are officially published) */}
                      {isExamPublished && (
                        <button
                          type="button"
                          onClick={() => handleOpenRankingsModal(sub)}
                          className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md btn-glass-utility px-3.5 cursor-pointer text-center whitespace-nowrap shrink-0"
                          title="View Official Class Standings & Rankings"
                        >
                          <Trophy className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>Class Standings</span>
                        </button>
                      )}

                      {/* Question Paper & Answer Key Viewer */}
                      {isPublished && (sub.has_question_paper || sub.has_answer_key) && (
                        <button
                          type="button"
                          onClick={() => {
                            setArtifactModalExam({
                              id: sub.exam_id,
                              title: sub.exam_title,
                              subject: sub.exam_subject,
                              has_question_paper: sub.has_question_paper,
                              has_answer_key: sub.has_answer_key,
                              is_document_purged: sub.exam_is_document_purged,
                            });
                            setArtifactModalInitialTab(sub.has_answer_key ? "answer-key" : "question-paper");
                            setArtifactModalOpen(true);
                          }}
                          className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium rounded-md btn-glass-utility px-3.5 cursor-pointer text-center whitespace-nowrap shrink-0"
                          title="View Question Paper & Official Answer Key"
                        >
                          <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>QP & Key</span>
                        </button>
                      )}

                      {/* Download Graded PDF */}
                      {isPublished ? (
                        sub.is_document_purged ? (
                          <button
                            type="button"
                            disabled
                            title="Graded PDF was permanently purged after 15 days to preserve storage. Question marks remain archived."
                            className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted bg-canvas-soft border border-hairline px-3.5 rounded-md opacity-60 cursor-not-allowed text-center whitespace-nowrap shrink-0"
                          >
                            <Download className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                            <span>PDF Expired</span>
                          </button>
                        ) : (
                          <a
                            href={api.getAnnotatedPdfUrl(sub.id)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() =>
                              toast.info("Opening evaluated answer sheet...", { title: "Graded Paper" })
                            }
                            className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold rounded-md btn-glass-utility px-3.5 text-center whitespace-nowrap shrink-0"
                            title={`Download before expiration (${sub.days_remaining ?? 15} days remaining)`}
                          >
                            <Download className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span>Download PDF</span>
                          </a>
                        )
                      ) : (
                        <button
                          type="button"
                          disabled
                          title="Evaluated PDF download will be enabled once faculty officially publishes results."
                          className="h-9 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted/80 bg-canvas-soft border border-hairline/70 px-3.5 rounded-md cursor-not-allowed select-none text-center whitespace-nowrap shrink-0 opacity-60"
                        >
                          <Download className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                          <span>PDF Pending</span>
                        </button>
                      )}
                    </div>

                    {/* Revaluation Appeal Status Pill (Shown only if appeal is active or resolved) */}
                    {isPublished && (hasOpenReval || isRevalResolved) && (
                      <div className="w-full sm:w-auto">
                        {hasOpenReval ? (
                          <Link
                            href={`/student/submissions/${sub.id}`}
                            className="text-[11px] font-medium text-orange-700 bg-orange-50 px-2.5 py-1.5 rounded-md border border-orange-200 inline-flex items-center justify-center gap-1 hover:bg-orange-100 transition-colors w-full sm:w-auto text-center"
                          >
                            <Clock className="h-3 w-3" />
                            Appeal In Review (View in Viewer →)
                          </Link>
                        ) : (
                          <Link
                            href={`/student/submissions/${sub.id}`}
                            className="text-[11px] font-medium text-ink-secondary bg-canvas-soft px-2.5 py-1.5 rounded-md border border-hairline inline-flex items-center justify-center gap-1 hover:bg-surface transition-colors w-full sm:w-auto text-center"
                          >
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            Revaluation Completed →
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </FeatureCard>
              );
            })}
            </div>

            {/* Link to view all past exam submissions */}
            {pastSubmissionsList.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleTabSwitch("exams", true)}
                  className="w-full flex items-center justify-center gap-2 h-11 px-4 rounded-xl btn-glass-utility text-xs font-semibold text-ink hover:text-primary transition-all group shadow-2xs text-center cursor-pointer active:scale-[0.99]"
                >
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span>
                    View All {pastSubmissionsList.length}{" "}
                    {pastSubmissionsList.length === 1 ? "Past Exam Submission" : "Past Exam Submissions"} →
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Direct Technical Support & Report Issue Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-surface border border-hairline relative overflow-hidden shadow-2xs">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-ink-muted/30" />
        <div className="flex items-start sm:items-center gap-3 pl-1">
          <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline text-ink-muted flex items-center justify-center shrink-0">
            <LifeBuoy className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-ink">Facing a technical issue?</h3>
            <p className="text-[11px] text-ink-muted leading-relaxed mt-0.5">
              If an answer sheet upload failed, marks are not appearing, or you encounter a visual glitch, send a report with screenshots directly to our technical team.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setReportModalOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-md btn-glass-utility text-xs font-semibold shrink-0 cursor-pointer"
        >
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span>Report Technical Issue</span>
        </button>
      </div>
    </div>
  ) : (
    <div
      key="exams-tab-view"
      className={`space-y-4 overflow-hidden ${
        tabDirection === "right" ? "animate-tab-slide-right" : "animate-tab-slide-left"
      }`}
    >
      {/* SECTION HEADER (Static, never re-renders or unmounts during filter updates) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pt-0.5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-ink">Past Exam Submissions</h2>
            {pastExamsTotal > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-canvas-soft border border-hairline text-ink-muted shrink-0">
                {pastExamsTotal} {pastExamsTotal === 1 ? "Paper" : "Papers"}
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted leading-relaxed mt-0.5">
            Search by title or subject. Click any exam card to expand detailed scores, verified PDF viewer, and answer keys.
          </p>
        </div>
      </div>

      {/* SEARCH & FILTER CONTROLS TOOLBAR (Collapsible, default compact) */}
      <div className="p-2 sm:p-2.5 rounded-2xl bg-surface border border-hairline shadow-2xs space-y-2">
        {/* Search Bar & Filter Toggle Row (Always Visible) */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search exams by title or subject..."
              className="w-full pl-8 pr-8 py-1.5 bg-canvas-soft/80 hover:bg-canvas-soft focus:bg-surface dark:bg-[#1a1a1a] dark:focus:bg-[#202020] text-xs sm:text-sm text-ink placeholder:text-ink-muted rounded-xl border border-hairline/70 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink rounded-md transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Filter Drawer Toggle Button */}
          <button
            type="button"
            onClick={() => setIsPastExamsFilterExpanded((prev) => !prev)}
            className={`btn-glass-utility inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0 select-none ${
              isPastExamsFilterExpanded || examSubjectFilter !== "ALL" || examStatusFilter !== "ALL"
                ? "border-primary text-primary font-bold shadow-2xs"
                : "text-ink-muted hover:text-ink"
            }`}
            title={isPastExamsFilterExpanded ? "Collapse filters" : "Expand filters"}
            aria-expanded={isPastExamsFilterExpanded}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {(examSubjectFilter !== "ALL" || examStatusFilter !== "ALL") && (
              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
            )}
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-200 ${
                isPastExamsFilterExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        {/* Collapsible Filters Drawer */}
        <div
          className={`grid transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isPastExamsFilterExpanded
              ? "grid-rows-[1fr] opacity-100 pt-2 border-t border-hairline/70"
              : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden space-y-2.5">
            {/* Quick Expand / Collapse All Controls & Paper Count */}
            {paginatedPastExams.length > 0 && !isPastExamsInitialLoading && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-medium text-ink-muted">
                  Showing {paginatedPastExams.length} of {pastExamsTotal} {pastExamsTotal === 1 ? "paper" : "papers"}
                </span>
                <div className="inline-flex items-center rounded-lg border border-hairline bg-canvas-soft/80 p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleToggleAllCards(true)}
                    className="text-[10.5px] font-medium text-ink-secondary hover:text-ink px-2 py-1 rounded hover:bg-surface transition-colors cursor-pointer whitespace-nowrap"
                    title="Expand all cards"
                  >
                    Expand All
                  </button>
                  <div className="h-2.5 w-px bg-hairline" />
                  <button
                    type="button"
                    onClick={() => handleToggleAllCards(false)}
                    className="text-[10.5px] font-medium text-ink-secondary hover:text-ink px-2 py-1 rounded hover:bg-surface transition-colors cursor-pointer whitespace-nowrap"
                    title="Collapse all cards"
                  >
                    Collapse All
                  </button>
                </div>
              </div>
            )}

            {/* Subject Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-xs">
              <span className="text-[10px] font-mono text-ink-muted uppercase tracking-wider shrink-0 mr-0.5">
                Subject:
              </span>
              <button
                type="button"
                onClick={() => setExamSubjectFilter("ALL")}
                className={`px-2 py-0.5 rounded-md text-[11px] transition-all shrink-0 cursor-pointer ${
                  examSubjectFilter === "ALL"
                    ? "bg-primary text-white font-semibold shadow-2xs"
                    : "bg-canvas-soft/80 text-ink-secondary hover:text-ink hover:bg-canvas-soft border border-hairline font-medium"
                }`}
              >
                All Subjects
              </button>
              {uniqueExamSubjects.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setExamSubjectFilter(sub)}
                  className={`px-2 py-0.5 rounded-md text-[11px] transition-all shrink-0 cursor-pointer ${
                    examSubjectFilter === sub
                      ? "bg-primary text-white font-semibold shadow-2xs"
                      : "bg-canvas-soft/80 text-ink-secondary hover:text-ink hover:bg-canvas-soft border border-hairline font-medium"
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>

            {/* Status Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-xs">
              <span className="text-[10px] font-mono text-ink-muted uppercase tracking-wider shrink-0 mr-0.5">
                Status:
              </span>
              <button
                type="button"
                onClick={() => setExamStatusFilter("ALL")}
                className={`px-2 py-0.5 rounded-md text-[11px] transition-all shrink-0 cursor-pointer ${
                  examStatusFilter === "ALL"
                    ? "bg-primary text-white font-semibold shadow-2xs"
                    : "bg-canvas-soft/80 text-ink-muted hover:text-ink hover:bg-canvas-soft border border-hairline/60 font-medium"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setExamStatusFilter("PUBLISHED")}
                className={`px-2 py-0.5 rounded-md text-[11px] transition-all shrink-0 cursor-pointer ${
                  examStatusFilter === "PUBLISHED"
                    ? "bg-primary text-white font-semibold shadow-2xs"
                    : "bg-canvas-soft/80 text-ink-muted hover:text-ink hover:bg-canvas-soft border border-hairline/60 font-medium"
                }`}
              >
                Published
              </button>
              <button
                type="button"
                onClick={() => setExamStatusFilter("IN_PROGRESS")}
                className={`px-2 py-0.5 rounded-md text-[11px] transition-all shrink-0 cursor-pointer ${
                  examStatusFilter === "IN_PROGRESS"
                    ? "bg-primary text-white font-semibold shadow-2xs"
                    : "bg-canvas-soft/80 text-ink-muted hover:text-ink hover:bg-canvas-soft border border-hairline/60 font-medium"
                }`}
              >
                In Progress
              </button>

              {(searchQuery || examSubjectFilter !== "ALL" || examStatusFilter !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setExamSubjectFilter("ALL");
                    setExamStatusFilter("ALL");
                  }}
                  className="text-[10.5px] font-semibold text-primary hover:underline ml-1 cursor-pointer shrink-0 whitespace-nowrap"
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PAST EXAMS SUBMISSION CARDS */}
      {isPastExamsInitialLoading ? (
        <PastExamsCardsSkeleton count={3} />
      ) : paginatedPastExams.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface p-10 text-center space-y-3">
          <FileText className="h-10 w-10 text-ink-faint mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-ink">
              {pastExamsTotal === 0
                ? "No exam submissions found"
                : "No matching exams found"}
            </h3>
            <p className="text-xs text-ink-muted max-w-md mx-auto">
              {pastExamsTotal === 0
                ? "When you upload your answer sheets during an active examination window, your verified submissions, AI evaluations, and faculty remarks will appear here."
                : `No past exams matched "${searchQuery || examSubjectFilter || examStatusFilter}". Try adjusting or clearing your filters.`}
            </p>
          </div>
          {pastExamsTotal > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setExamSubjectFilter("ALL");
                setExamStatusFilter("ALL");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
            >
              Reset all filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginatedPastExams.map((sub, idx) => (
              <PastExamCard
                key={sub.id}
                sub={sub}
                idx={idx}
                isExpanded={Boolean(expandedCardIds[sub.id])}
                onToggle={toggleCard}
                onOpenBreakdown={handleOpenBreakdownModal}
                onOpenRankings={handleOpenRankingsModal}
                onOpenArtifacts={handleOpenArtifacts}
                onOpenReval={handleOpenRevalModal}
              />
            ))}
          </div>

          {/* Infinite Scroll Sentinel & Inline Loader */}
          <div
            ref={sentinelCallbackRef}
            className="py-4 flex flex-col items-center justify-center min-h-[50px]"
          >
            {isLoadingMorePastExams ? (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-surface border border-hairline text-xs font-medium text-ink-muted shadow-2xs animate-in fade-in duration-200">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Loading next exams...</span>
              </div>
            ) : hasMorePastExams ? (
              <button
                type="button"
                onClick={() => fetchPastExamsPage(pastExamsPageRef.current + 1, false)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-surface hover:bg-canvas-soft border border-hairline text-xs font-semibold text-primary transition-all shadow-2xs cursor-pointer select-none active:scale-95"
              >
                <span>Load More Exams</span>
                {pastExamsTotal > paginatedPastExams.length && (
                  <span className="text-[10.5px] font-mono text-ink-muted">
                    ({pastExamsTotal - paginatedPastExams.length} remaining)
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            ) : paginatedPastExams.length > 0 ? (
              <span className="text-[11px] font-mono text-ink-faint select-none">
                • All {pastExamsTotal} past exams loaded •
              </span>
            ) : null}
          </div>
        </>
      )}

      {/* Direct Technical Support & Report Issue Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-surface border border-hairline relative overflow-hidden shadow-2xs">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-ink-muted/30" />
        <div className="flex items-start sm:items-center gap-3 pl-1">
          <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline text-ink-muted flex items-center justify-center shrink-0">
            <LifeBuoy className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-ink">Facing a technical issue?</h3>
            <p className="text-[11px] text-ink-muted leading-relaxed mt-0.5">
              If an answer sheet upload failed, marks are not appearing, or you encounter a visual glitch, send a report with screenshots directly to our technical team.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setReportModalOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-md btn-glass-utility text-xs font-semibold shrink-0 cursor-pointer"
        >
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span>Report Technical Issue</span>
        </button>
      </div>
    </div>
  )}
</div>

      {/* DETAILED QUESTION BREAKDOWN MODAL */}
      <ModalCard
        isOpen={breakdownModalOpen}
        onClose={() => setBreakdownModalOpen(false)}
        title={
          breakdownSubmission
            ? `Evaluation Breakdown • ${breakdownSubmission.exam_title || "Examination"}`
            : "Question Breakdown"
        }
      >
        {breakdownSubmission && (
          <div className="space-y-4 text-xs">
            {/* Modal Subheader */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-3.5 rounded-lg bg-canvas-soft border border-hairline">
              <div className="min-w-0">
                <div className="text-[10px] uppercase font-bold tracking-wider text-ink-muted">
                  Roll: {breakdownSubmission.roll_number}
                </div>
                <div className="text-sm font-bold text-ink leading-snug mt-0.5">
                  Total Awarded:{" "}
                  {breakdownSubmission.total_awarded_marks !== null && breakdownSubmission.total_awarded_marks !== undefined
                    ? `${Number(breakdownSubmission.total_awarded_marks).toFixed(1)} / ${breakdownSubmission.max_marks || breakdownSubmission.exam_total_marks || 25} marks (${Number(breakdownSubmission.percentage || 0).toFixed(1)}%)`
                    : "Pending Official Publication"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {Boolean(
                  breakdownSubmission &&
                  (breakdownSubmission.exam_is_published === 1 ||
                    breakdownSubmission.exam_is_published === true ||
                    breakdownSubmission.exam_lifecycle_status === "PUBLISHED" ||
                    breakdownSubmission.exam_status === "PUBLISHED")
                ) && (
                  <button
                    type="button"
                    onClick={() => {
                      setBreakdownModalOpen(false);
                      handleOpenRankingsModal(breakdownSubmission);
                    }}
                    className="self-start sm:self-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-300 dark:border-amber-700/50 transition-all shrink-0 shadow-2xs whitespace-nowrap cursor-pointer"
                    title="View Official Class Standings"
                  >
                    <Trophy className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Class Standings</span>
                  </button>
                )}

                {(breakdownSubmission.publication_status === "PUBLISHED" || breakdownSubmission.is_published) && !breakdownSubmission.is_document_purged && (
                  <a
                    href={api.getAnnotatedPdfUrl(breakdownSubmission.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="self-start sm:self-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15 border border-primary/25 transition-all shrink-0 shadow-2xs whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5 shrink-0" />
                    <span>Annotated PDF</span>
                  </a>
                )}
              </div>
            </div>

            {/* Questions List Header with Expand All / Collapse All */}
            {breakdownSubmission.answers && breakdownSubmission.answers.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-ink-muted">
                <span className="font-semibold text-ink-secondary">
                  Questions Evaluated ({breakdownSubmission.answers.length})
                </span>
                <button
                  type="button"
                  onClick={() => toggleAllQuestionsExpand(breakdownSubmission.answers)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                >
                  <Sliders className="h-3 w-3" />
                  <span>
                    {breakdownSubmission.answers.every((a: any, idx: number) =>
                      expandedQuestionIds[a.id || a.question_id || `q_${idx}`]
                    )
                      ? "Collapse All"
                      : "Expand All Details"}
                  </span>
                </button>
              </div>
            )}

            {/* Questions List */}
            {breakdownSubmission.answers && breakdownSubmission.answers.length > 0 ? (
              <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                {breakdownSubmission.answers.map((ans: any, idx: number) => {
                  const qKey = ans.id || ans.question_id || `q_${idx}`;
                  const isExpanded = Boolean(expandedQuestionIds[qKey]);
                  const qLabel = ans.question_id
                    ? ans.question_id.replace(/^q_?/i, "Q")
                    : `Q${idx + 1}`;
                  const criterionScores: any[] = ans.criterion_scores || [];
                  const hasCriteria = criterionScores.length > 0;
                  const hasExtractedText = Boolean(ans.extracted_text && ans.extracted_text.trim());
                  const hasOfficialAnswer = Boolean(ans.official_answer && ans.official_answer.trim());
                  const hasRationale = Boolean(
                    ans.grading_rationale &&
                    ans.grading_rationale.trim() &&
                    ans.grading_rationale !== ans.feedback
                  );

                  return (
                    <div
                      key={qKey}
                      className="p-3 rounded-lg border border-hairline bg-surface space-y-2.5 transition-all shadow-2xs animate-cascade-row will-change-transform"
                      style={{ animationDelay: `${Math.min(idx * 25, 300)}ms` }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="font-bold text-ink text-xs bg-canvas-soft px-2 py-0.5 rounded border border-hairline">
                            {qLabel}
                          </span>
                          {ans.is_manual_override === 1 && (
                            <span className="text-[10px] font-semibold bg-[#edf5f0] text-[#1e613b] border border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] px-1.5 py-0.5 rounded shrink-0">
                              Human Override
                            </span>
                          )}
                          {ans.page_number && (
                            <span className="text-[10px] text-ink-muted shrink-0">Page {ans.page_number}</span>
                          )}
                        </div>
                        <span className="font-mono font-bold text-ink text-xs shrink-0">
                          {Number(ans.awarded_marks || 0).toFixed(1)} / {ans.max_marks || 1} marks
                        </span>
                      </div>

                      {/* Question Text / Prompt if available or skeleton placeholder while loading */}
                      {ans.question_text ? (
                        <div className="text-[11.5px] text-ink-secondary leading-relaxed bg-canvas-soft/40 p-2 rounded border border-hairline/50 animate-cross-fade">
                          <span className="font-semibold text-ink">Prompt: </span>
                          <MathText text={ans.question_text} />
                        </div>
                      ) : isBreakdownLoadingDetails ? (
                        <div className="bg-canvas-soft/40 p-2 rounded border border-hairline/50 space-y-1.5 animate-pulse min-h-[38px] flex flex-col justify-center">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-ink-muted">Prompt:</span>
                            <div className="h-2.5 w-3/4 bg-ink-faint/25 rounded" />
                          </div>
                          <div className="h-2 w-1/2 bg-ink-faint/15 rounded ml-12" />
                        </div>
                      ) : null}

                      {/* Rubric Remarks */}
                      {ans.feedback && (
                        <div className="text-ink-secondary bg-canvas-soft/70 p-2 rounded text-[11px] leading-relaxed border border-hairline/60">
                          <span className="font-semibold text-ink">Rubric Remarks: </span>
                          {ans.feedback}
                        </div>
                      )}

                      {/* Human Override Justification */}
                      {ans.override_reason && (
                        <div className="text-[11px] bg-[#edf5f0] text-[#1e613b] border border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a] p-2 rounded">
                          <span className="font-semibold">Reviewer Justification: </span>
                          {ans.override_reason}
                        </div>
                      )}

                      {/* Accordion Toggle: Criteria Breakdown & AI Answer */}
                      <button
                        type="button"
                        onClick={() => toggleQuestionExpand(qKey)}
                        className={`w-full flex items-center justify-between gap-2 text-xs font-semibold py-2 px-3 rounded-md transition-all cursor-pointer border ${
                          isExpanded
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "bg-canvas-soft text-ink-secondary hover:text-ink hover:bg-canvas-soft/90 border-hairline"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 text-left">
                          <Sliders className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="leading-snug truncate sm:whitespace-normal">
                            {isExpanded
                              ? "Hide Evaluation Details"
                              : "View Criteria Breakdown & AI Answer"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-1">
                          {hasCriteria ? (
                            <span className="text-[10px] bg-primary/15 text-primary border border-primary/25 px-2 py-0.5 rounded-full font-bold whitespace-nowrap shrink-0 animate-cross-fade">
                              {criterionScores.length} {criterionScores.length === 1 ? "criterion" : "criteria"}
                            </span>
                          ) : isBreakdownLoadingDetails ? (
                            <span className="h-4 w-16 bg-primary/10 border border-primary/20 rounded-full animate-pulse shrink-0 inline-block" />
                          ) : null}
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                              isExpanded ? "rotate-180 text-primary" : "rotate-0 text-ink-muted"
                            }`}
                          />
                        </div>
                      </button>

                      {/* EXPANDED EVALUATION SECTION (Apple-Style Smooth CSS Grid Accordion) */}
                      <div
                        className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[grid-template-rows] ${
                          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                        }`}
                      >
                        <div className="overflow-hidden min-h-0">
                          <div
                            className={`pt-2.5 mt-2 border-t border-hairline/70 space-y-3 transition-[opacity,transform] duration-250 ease-out will-change-[opacity,transform] ${
                              isExpanded
                                ? "opacity-100 translate-y-0"
                                : "opacity-0 -translate-y-1 pointer-events-none"
                            }`}
                          >
                          {/* 1. Criteria Breakdown */}
                          {hasCriteria ? (
                            <div className="space-y-1.5">
                              <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1">
                                <CheckSquare className="h-3 w-3 text-primary" />
                                <span>Rubric Criteria Evaluation ({criterionScores.length})</span>
                              </div>

                              <div className="space-y-1.5">
                                {criterionScores.map((crit: any, cIdx: number) => {
                                  const critAwarded = Number(crit.awarded_marks || 0);
                                  const critMax = Number(crit.max_marks || 1);
                                  const isFull = critAwarded >= critMax;
                                  const isZero = critAwarded === 0;

                                  return (
                                    <div
                                      key={crit.id || crit.criterion_id || cIdx}
                                      className="p-2.5 rounded-md bg-canvas-soft/80 border border-hairline space-y-1"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="text-[11px] font-medium text-ink leading-snug">
                                          <span className="font-semibold text-ink-secondary mr-1">
                                            {crit.criterion_id ? `[${crit.criterion_id}]` : `Criterion ${cIdx + 1}:`}
                                          </span>
                                          <MathText text={crit.description} />
                                        </div>
                                        <span
                                          className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono font-bold shrink-0 border ${
                                            isFull
                                              ? "bg-[#edf5f0] text-[#1e613b] border-[#c8e2d2] dark:bg-[#13231a] dark:text-[#86d4a4] dark:border-[#1d3d2a]"
                                              : isZero
                                              ? "bg-[#fbf0f0] text-[#872323] border-[#ecd0d0] dark:bg-[#261212] dark:text-[#e87878] dark:border-[#491f1f]"
                                              : "bg-[#faf4ec] text-[#7a4e18] border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17]"
                                          }`}
                                        >
                                          {critAwarded.toFixed(1)} / {critMax}m
                                        </span>
                                      </div>

                                      {crit.evidence && (
                                        <div className="text-[10.5px] text-ink-muted bg-surface dark:bg-[#1a1a1a] p-1.5 rounded border border-hairline leading-relaxed">
                                          <span className="font-semibold text-ink-secondary">AI Finding / Evidence: </span>
                                          <MathText text={crit.evidence} />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : isBreakdownLoadingDetails ? (
                            <div className="space-y-2 py-1 animate-pulse">
                              <div className="h-3 w-36 bg-ink-faint/25 rounded" />
                              <div className="p-2.5 rounded-md bg-canvas-soft/60 border border-hairline space-y-1.5">
                                <div className="h-2.5 w-3/4 bg-ink-faint/30 rounded" />
                                <div className="h-2 w-1/2 bg-ink-faint/20 rounded" />
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px] text-ink-muted italic bg-canvas-soft/40 p-2 rounded border border-hairline">
                              Holistic question-level grading applied without sub-criteria.
                            </div>
                          )}

                          {/* 2. Side-by-Side: Student Handwriting vs Official Model Solution */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {/* Student's Transcribed Handwriting */}
                            <div className="p-2.5 rounded-md bg-blue-50/30 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 space-y-1">
                              <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider">
                                <Cpu className="h-3 w-3 text-primary shrink-0" />
                                <span>Student Answer (AI Transcribed)</span>
                              </div>
                              <div className="text-[11px] text-ink-secondary dark:text-ink leading-relaxed font-mono whitespace-pre-wrap bg-surface dark:bg-[#1a1a1a] p-2 rounded border border-blue-100 dark:border-blue-900/40 max-h-36 overflow-y-auto">
                                {hasExtractedText ? (
                                  <MathText text={ans.extracted_text} />
                                ) : (
                                  "No handwriting transcribed for this question.")}
                              </div>
                            </div>

                            {/* Official Answer Key */}
                            <div className="p-2.5 rounded-md bg-emerald-50/30 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 space-y-1">
                              <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">
                                <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>Official Model Solution</span>
                              </div>
                              <div className="text-[11px] text-ink-secondary dark:text-ink leading-relaxed whitespace-pre-wrap bg-surface dark:bg-[#1a1a1a] p-2 rounded border border-emerald-100 dark:border-emerald-900/40 max-h-36 overflow-y-auto">
                                {hasOfficialAnswer ? (
                                  <MathText text={ans.official_answer} />
                                ) : (
                                  "Model solution not published or withheld by institute policy."
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 3. AI Grading Rationale (if present and distinct) */}
                          {hasRationale && (
                            <div className="text-[11px] text-indigo-950 dark:text-[#c7d2fe] bg-indigo-50/50 dark:bg-[#13172e] p-2.5 rounded-md border border-indigo-200/60 dark:border-[#242b58] leading-relaxed">
                              <span className="font-semibold text-indigo-900 dark:text-[#e0e7ff]">AI Detailed Reasoning: </span>
                              <MathText text={ans.grading_rationale} />
                            </div>
                          )}

                          {/* 4. Handwriting Crop Link (if available) */}
                          {ans.crop_url && (
                            <div className="pt-0.5 flex items-center justify-end text-[11px]">
                              <a
                                href={ans.crop_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                              >
                                <Eye className="h-3 w-3" />
                                <span>Inspect Handwriting Crop Image →</span>
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-ink-muted">
                Detailed question annotations are being compiled.
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-hairline">
              <ButtonUtility onClick={() => setBreakdownModalOpen(false)}>
                Close Breakdown
              </ButtonUtility>
            </div>
          </div>
        )}
      </ModalCard>

      {/* EXAM RANKED STANDINGS MODAL */}
      <ModalCard
        isOpen={rankingsModalOpen}
        onClose={() => setRankingsModalOpen(false)}
        title={
          rankingsExam
            ? `Class Standings • ${rankingsExam.title || "Examination"}`
            : "Class Standings"
        }
      >
        <div className="space-y-4 pt-1 w-full max-w-full overflow-hidden">
          {isRankingsLoading ? (
            <div className="py-12 text-center space-y-3">
              <div className="inline-flex items-center justify-center p-3 rounded-full bg-amber-50 text-amber-600 animate-pulse">
                <Trophy className="h-8 w-8" />
              </div>
              <p className="text-xs text-ink-muted">Loading class standings...</p>
            </div>
          ) : rankingsData.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <Trophy className="h-8 w-8 text-ink-faint mx-auto" />
              <h4 className="text-xs font-semibold text-ink">Standings Pending Publication</h4>
              <p className="text-[11px] text-ink-muted max-w-xs mx-auto">
                Class rankings will be published once faculty concludes all evaluations for this examination.
              </p>
            </div>
          ) : (
            <ExamRankedTable
              examId={rankingsExam?.id || ""}
              examTitle={rankingsExam?.title || "Exam"}
              maxMarks={rankingsExam?.max_marks || 25}
              submissions={rankingsData}
              isStudentView={true}
              currentStudentRoll={user?.roll_number}
              currentStudentId={studentIdDisplay}
            />
          )}

          <div className="flex items-center justify-between pt-3 border-t border-hairline">
            <ButtonUtility onClick={() => setRankingsModalOpen(false)}>
              Close Standings
            </ButtonUtility>
          </div>
        </div>
      </ModalCard>

      {/* REVALUATION REQUEST MODAL */}
      <ModalCard
        isOpen={revalModalOpen}
        onClose={() => setRevalModalOpen(false)}
        title={
          revalSubmission
            ? `Submit Revaluation Request • ${revalSubmission.exam_title || "Examination"}`
            : "Submit Revaluation Request"
        }
      >
        {revalSubmission && (
          <form onSubmit={handleRevalSubmit} className="space-y-4 text-xs">
            {/* Faculty Policy Notice */}
            <StatusWell
              variant="blue"
              icon={<ShieldCheck className="h-3.5 w-3.5 text-primary" />}
              title="Institutional Standard: Human Examiner Verification"
              className="p-3"
            >
              Under faculty policy, all revaluation requests are{" "}
              <strong className="text-ink font-semibold">manually reviewed by senior human examiners</strong>. Automated AI adjustments are strictly forbidden on student grievances.
            </StatusWell>

            {/* Questions to Challenge */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-ink">
                  Select Question(s) to Challenge:
                </label>
                {revalSubmission.answers && revalSubmission.answers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = revalSubmission.answers.map(
                        (a: any, i: number) => a.question_id || `Q${i + 1}`
                      );
                      if (selectedQuestions.length === allIds.length) {
                        setSelectedQuestions([]);
                      } else {
                        setSelectedQuestions(allIds);
                      }
                    }}
                    className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                  >
                    {selectedQuestions.length === (revalSubmission.answers?.length || 0)
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                )}
              </div>

              {revalSubmission.answers && revalSubmission.answers.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {revalSubmission.answers.map((ans: any, idx: number) => {
                    const qId = ans.question_id || `Q${idx + 1}`;
                    const isSelected = selectedQuestions.includes(qId);
                    return (
                      <button
                        type="button"
                        key={qId}
                        onClick={() => {
                          setSelectedQuestions((prev) =>
                            prev.includes(qId)
                              ? prev.filter((x) => x !== qId)
                              : [...prev, qId]
                          );
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-surface border-primary ring-1 ring-primary/40 text-ink font-semibold shadow-2xs"
                            : "bg-surface border-hairline text-ink hover:bg-canvas-soft"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {isSelected ? (
                            <CheckSquare className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <Square className="h-3.5 w-3.5 text-ink-muted" />
                          )}
                          <span>{qId.replace(/^q_?/i, "Q")}</span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-canvas-soft border border-hairline text-ink-muted">
                          {Number(ans.awarded_marks || 0).toFixed(1)}/{ans.max_marks || 1}m
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"].map((qid) => (
                    <button
                      type="button"
                      key={qid}
                      onClick={() => {
                        setSelectedQuestions((prev) =>
                          prev.includes(qid) ? prev.filter((x) => x !== qid) : [...prev, qid]
                        );
                      }}
                      className={`py-1.5 px-3 rounded-md border text-center font-semibold transition-colors cursor-pointer ${
                        selectedQuestions.includes(qid)
                          ? "bg-primary text-white border-primary"
                          : "bg-surface border-hairline text-ink hover:bg-canvas-soft"
                      }`}
                    >
                      {qid}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Academic Justification */}
            <div className="space-y-1.5">
              <label className="font-semibold text-ink">
                Academic Justification / Grievance Details:
              </label>
              <textarea
                required
                rows={3}
                className="w-full rounded-md border border-hairline bg-surface p-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
                placeholder="Explain why you believe the step marks, derivation, or criteria require faculty re-verification..."
                value={revalReason}
                onChange={(e) => setRevalReason(e.target.value)}
              />
            </div>

            {revalMsg && (
              <div className="rounded-md bg-canvas-soft border border-hairline p-2 text-xs text-ink font-medium">
                {revalMsg}
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-hairline">
              <div className="text-[11px] text-ink-muted">
                Selected: <strong className="text-ink">{selectedQuestions.length}</strong> question(s)
              </div>
              <div className="flex items-center gap-2">
                <ButtonUtility type="button" onClick={() => setRevalModalOpen(false)}>
                  Cancel
                </ButtonUtility>
                <ButtonPrimary
                  type="submit"
                  isLoading={revalLoading}
                  disabled={selectedQuestions.length === 0 || !revalReason.trim()}
                >
                  Submit Appeal
                </ButtonPrimary>
              </div>
            </div>
          </form>
        )}
      </ModalCard>

      {/* Technical Support & Issue Report Modal */}
      <ReportIssueModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        userRole="STUDENT"
      />

      {/* Official Question Paper & Answer Key Modal */}
      {artifactModalExam && (
        <ArtifactViewerModal
          isOpen={artifactModalOpen}
          onClose={() => {
            setArtifactModalOpen(false);
            setArtifactModalExam(null);
          }}
          examId={artifactModalExam.id}
          examTitle={artifactModalExam.title}
          examSubject={artifactModalExam.subject}
          initialArtifact={artifactModalInitialTab}
          hasQuestionPaper={artifactModalExam.has_question_paper}
          hasAnswerKey={artifactModalExam.has_answer_key}
          isExamDocumentPurged={artifactModalExam.is_document_purged}
        />
      )}
    </div>
  );
}
