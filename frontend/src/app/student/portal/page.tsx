"use client";

import React, { useEffect, useState, useMemo } from "react";
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
  Cpu,
  LifeBuoy,
  AlertTriangle,
} from "lucide-react";
import { api, getAuthToken } from "@/lib/api";
import { useToast } from "@/lib/ToastContext";
import { useNotifications } from "@/lib/NotificationContext";
import { ReportIssueModal } from "@/components/ReportIssueModal";
import {
  ButtonPrimary,
  ButtonUtility,
  FeatureCard,
  BadgePill,
  ModalCard,
  FormInput,
  StudentPortalSkeleton,
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
  const [selectedSubject, setSelectedSubject] = useState<string>("ALL");

  // Extract published submissions
  const publishedSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      return (
        s.publication_status === "PUBLISHED" ||
        (s.publication_status !== "UNPUBLISHED" && Boolean(s.exam_is_published || s.is_published))
      );
    });
  }, [submissions]);

  // Unique subjects
  const subjects = useMemo(() => {
    const set = new Set<string>();
    publishedSubmissions.forEach((s) => {
      if (s.exam_subject) set.add(s.exam_subject.trim());
    });
    return Array.from(set);
  }, [publishedSubmissions]);

  // Filter and sort chronologically
  const points: TrajectoryPoint[] = useMemo(() => {
    const filtered =
      selectedSubject === "ALL"
        ? publishedSubmissions
        : publishedSubmissions.filter(
            (s) => s.exam_subject && s.exam_subject.trim() === selectedSubject
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
  const maxPct = count > 0 ? Math.max(...points.map((p) => p.percentage)).toFixed(1) : null;
  const revalUpgradesCount = points.filter((p) => p.isMarksRevised).length;

  const trendDiff =
    count >= 2
      ? Number((points[count - 1].percentage - points[0].percentage).toFixed(1))
      : null;

  const [lineAnimated, setLineAnimated] = useState(false);

  useEffect(() => {
    setLineAnimated(false);
    const t = setTimeout(() => setLineAnimated(true), 40);
    return () => clearTimeout(t);
  }, [selectedSubject, points.length]);

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
    <FeatureCard className="p-4 sm:p-5 space-y-3">
      {/* Top Header: Minimal - Metrics & Title Only */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <TrendingUp className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-sm sm:text-base font-bold text-ink">
            Marks Trajectory
          </h2>
          {revalUpgradesCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Sparkles className="h-3 w-3 text-emerald-600" />
              {revalUpgradesCount} Upgraded
            </span>
          )}
        </div>

        {/* Minimal Metrics Badges */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {trendDiff !== null && (
            <div
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${
                trendDiff > 0
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : trendDiff < 0
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-slate-50 text-slate-700 border-slate-200"
              }`}
            >
              {trendDiff > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : trendDiff < 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              <span>
                {trendDiff > 0
                  ? `+${trendDiff}%`
                  : trendDiff < 0
                  ? `${trendDiff}%`
                  : "0%"}
              </span>
            </div>
          )}

          {avgPct !== null && (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
              <Award className="h-3 w-3 text-purple-600" />
              <span>Avg: {avgPct}%</span>
            </div>
          )}

          {maxPct !== null && (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
              <Sparkles className="h-3 w-3 text-sky-600" />
              <span>Peak: {maxPct}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Subject Filter Pills (if multiple subjects exist) */}
      {subjects.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
          <button
            type="button"
            onClick={() => setSelectedSubject("ALL")}
            className={`px-2.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer shrink-0 text-[11px] ${
              selectedSubject === "ALL"
                ? "bg-primary text-white shadow-2xs"
                : "bg-canvas-soft hover:bg-surface border border-hairline text-ink-muted hover:text-ink"
            }`}
          >
            All Subjects
          </button>
          {subjects.map((subj) => {
            const isSelected = selectedSubject === subj;
            return (
              <button
                key={subj}
                type="button"
                onClick={() => setSelectedSubject(subj)}
                className={`px-2.5 py-0.5 rounded-full font-medium transition-colors cursor-pointer shrink-0 text-[11px] ${
                  isSelected
                    ? "bg-primary text-white shadow-2xs"
                    : "bg-canvas-soft hover:bg-surface border border-hairline text-ink-muted hover:text-ink"
                }`}
              >
                {subj}
              </button>
            );
          })}
        </div>
      )}

      {/* Seamless Dynamic SVG Chart Container (No letterboxing, fills container) */}
      <div className="relative w-full overflow-hidden pt-1">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto select-none overflow-visible block"
        >
          <defs>
            <linearGradient id="pgMarksTrajectoryGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
            </linearGradient>
            <filter id="pgPointGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.25" />
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
                />
                <text
                  x={padLeft - 6}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-slate-400 font-mono text-[8.5px] select-none"
                >
                  {pct}%
                </text>
              </g>
            );
          })}

          {/* Dotted Average Benchmark Line */}
          {avgPct !== null && count >= 2 && (
            <g>
              <line
                x1={padLeft}
                y1={getY(Number(avgPct))}
                x2={svgWidth - padRight}
                y2={getY(Number(avgPct))}
                stroke="#a855f7"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                strokeOpacity="0.75"
              />
              <text
                x={svgWidth - padRight + 4}
                y={getY(Number(avgPct)) + 3}
                className="fill-purple-600 font-mono text-[8.5px] font-bold"
              >
                Avg {avgPct}%
              </text>
            </g>
          )}

          {/* Area Fill with Fade In */}
          {areaD && (
            <path
              d={areaD}
              fill="url(#pgMarksTrajectoryGrad)"
              style={{
                opacity: lineAnimated ? 1 : 0,
                transition: "opacity 0.6s ease 0.3s",
              }}
            />
          )}

          {/* Line Path with Lightweight Smooth Draw Animation */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 1200,
                strokeDashoffset: lineAnimated ? 0 : 1200,
                transition: "stroke-dashoffset 1.1s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          )}

          {/* Data Nodes with Pop-in Animation */}
          {points.map((p, idx) => {
            const cx = getX(idx);
            const cy = getY(p.percentage);

            return (
              <g
                key={p.id}
                className="group transition-all"
                style={{
                  opacity: lineAnimated ? 1 : 0,
                  transform: lineAnimated ? "scale(1)" : "scale(0.3)",
                  transformOrigin: `${cx}px ${cy}px`,
                  transition: `opacity 0.35s ease ${0.25 + idx * 0.08}s, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.25 + idx * 0.08}s`,
                }}
              >
                <title>{`${p.title} (${p.subject}): ${p.marks}/${p.maxMarks} (${p.percentage}%)`}</title>

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
                      : "#2563eb"
                  }
                  stroke="#ffffff"
                  strokeWidth="2"
                  filter="url(#pgPointGlow)"
                  className="transition-all duration-150 group-hover:r-[6.5px]"
                />

                {/* Score Label above node */}
                <text
                  x={cx}
                  y={cy - 9}
                  textAnchor="middle"
                  className={`font-mono text-[9px] font-bold select-none ${
                    p.isMarksRevised ? "fill-emerald-700" : "fill-slate-700"
                  }`}
                >
                  {p.percentage}%
                </text>

                {/* X-axis Date/Exam Label */}
                <text
                  x={cx}
                  y={svgHeight - 8}
                  textAnchor="middle"
                  className="font-sans text-[8.5px] fill-slate-500 select-none"
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
    </FeatureCard>
  );
}

export default function StudentPortalPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { permission, isSupported, requestPermission } = useNotifications();
  const [hideNotifBanner, setHideNotifBanner] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [exams, setExams] = useState<any[]>([]);
  const [activeExam, setActiveExam] = useState<any>(null);
  const [windowStatus, setWindowStatus] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

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
          setSubmissions(state.submissions || []);
          setActiveExam(state.active_exam || null);
          setWindowStatus(state.window_status || null);
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
      setSubmissions(subList);

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

        const activeResult = windowResults.find((r) => r.win && r.win.is_active);
        if (activeResult) {
          setActiveExam(activeResult.exam);
          setWindowStatus(activeResult.win);
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
            });

          if (recentlyClosed.length > 0) {
            setActiveExam(recentlyClosed[0].exam);
            setWindowStatus(recentlyClosed[0].win);
          } else {
            setActiveExam(null);
            setWindowStatus(null);
          }
        }
      } else {
        setActiveExam(null);
        setWindowStatus(null);
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
      router.push("/auth/login");
      return;
    }
    loadPortalData();

    // Auto-poll portal data every 20 seconds to detect live window opens or result publications
    const pollInterval = setInterval(() => {
      loadPortalData(true);
    }, 20000);

    return () => clearInterval(pollInterval);
  }, [router]);

  // Window countdown timer effect
  useEffect(() => {
    if (!windowStatus || !windowStatus.is_active || windowStatus.seconds_remaining <= 0) return;

    const interval = setInterval(() => {
      setWindowStatus((prev: any) => {
        if (!prev) return null;
        const newSec = Math.max(0, prev.seconds_remaining - 1);
        return {
          ...prev,
          seconds_remaining: newSec,
          is_active: newSec > 0 || prev.is_in_grace,
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [windowStatus?.is_active]);

  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Upload handler (Multipart Single PDF)
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !activeExam) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("roll_number", user?.roll_number || user?.student?.roll_number || "ROLL-101");
      formData.append("student_name", user?.full_name || "Enrolled Student");

      const result = await api.uploadSingleMultipart(activeExam.id, formData);
      const successMsg = result.is_replacement
        ? "Answer sheet replaced atomically!"
        : "Answer sheet uploaded successfully!";
      setUploadSuccess(successMsg);
      toast.success(successMsg, { title: "Submission Received" });
      setSelectedFile(null);

      // Refresh submissions
      await loadPortalData();
    } catch (err: any) {
      const errorMsg = err.message || "Failed to upload answer sheet.";
      setUploadError(errorMsg);
      toast.error(errorMsg, { title: "Upload Failed" });
    } finally {
      setUploading(false);
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

  // Open Revaluation Modal for a specific submission
  const handleOpenRevalModal = async (sub: any) => {
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
  };

  // Open Breakdown Modal for a specific submission
  const handleOpenBreakdownModal = async (sub: any) => {
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
  };

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
    <div className="max-w-5xl mx-auto space-y-5 sm:space-y-7 pt-5 sm:pt-8 pb-16 px-3 sm:px-6">
      {/* Header Profile Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-3 border-b border-hairline">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              Welcome, {user?.full_name || "Student"}
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
              Active Student
            </span>
            <div className="sm:hidden">
              <BadgePill label="PWA Student Portal" color="sky" />
            </div>
          </div>
          <p className="text-xs text-ink-muted mt-1 leading-normal">
            Roll No: <strong className="text-ink font-medium">{rollNumber}</strong> • Student ID:{" "}
            <strong className="text-ink font-medium">{studentIdDisplay}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setReportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15 border border-primary/25 transition-all cursor-pointer shadow-2xs"
            title="Report a technical issue with the portal"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Report Issue</span>
          </button>
          <div className="hidden sm:block">
            <BadgePill label="PWA Student Portal" color="sky" />
          </div>
        </div>
      </div>

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
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
            {windowStatus?.is_active ? (
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div className="rounded-lg border-2 border-dashed border-hairline hover:border-primary/50 bg-canvas-soft/50 p-6 text-center transition-colors">
                  <input
                    type="file"
                    id="paper-upload"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                  />
                  <label htmlFor="paper-upload" className="cursor-pointer block space-y-2">
                    <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div className="text-sm font-semibold text-ink">
                      {selectedFile ? selectedFile.name : "Choose Single Combined PDF or Scan Pages"}
                    </div>
                    <p className="text-xs text-ink-muted max-w-sm mx-auto">
                      Single PDF document. Maximum 7 MB, up to 15 canonical pages.
                    </p>
                  </label>
                </div>

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

                {selectedFile && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-ink-muted">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB ready to upload
                    </span>
                    <ButtonPrimary
                      type="submit"
                      isLoading={uploading}
                    >
                      Submit Answer Sheet
                    </ButtonPrimary>
                  </div>
                )}
              </form>
            ) : (
              <div className="flex items-center gap-2.5 text-xs text-ink-muted py-1">
                <Info className="h-4 w-4 text-ink-faint shrink-0" />
                <span>
                  The upload window for <strong className="text-ink">{activeExam.title}</strong> is currently closed. This notice will remain visible for 2 hours post-closure. All evaluated past papers are listed below.
                </span>
              </div>
            )}
          </div>
        </FeatureCard>
      )}

      {/* SECTION: PAST EXAM SUBMISSIONS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">Past Exam Submissions</h2>
            <p className="text-xs text-ink-muted leading-relaxed">
              Review evaluated answer sheets, question-by-question marks, and faculty revaluations.
            </p>
          </div>
          <span className="text-xs font-semibold text-ink-muted bg-canvas-soft px-2.5 py-1 rounded-full border border-hairline whitespace-nowrap shrink-0">
            {submissions.length} {submissions.length === 1 ? "Paper" : "Papers"}
          </span>
        </div>

        {submissions.length === 0 ? (
          <div className="rounded-lg border border-hairline bg-surface p-8 text-center space-y-2">
            <FileText className="h-8 w-8 text-ink-faint mx-auto" />
            <h3 className="text-sm font-semibold text-ink">No exam submissions found</h3>
            <p className="text-xs text-ink-muted max-w-md mx-auto">
              When you upload your answer sheets during an active examination window, your verified submissions, AI evaluations, and faculty remarks will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {submissions.map((sub) => {
              const isPublished =
                sub.publication_status === "PUBLISHED" ||
                (sub.publication_status !== "UNPUBLISHED" && Boolean(sub.exam_is_published || sub.is_published));
              const hasAnswers = sub.answers && sub.answers.length > 0;
              const reval = sub.revaluation;
              const hasOpenReval =
                reval && (reval.status === "SUBMITTED" || reval.status === "UNDER_REVIEW");
              const isRevalResolved = reval && reval.status === "RESOLVED";

              return (
                <FeatureCard key={sub.id} className="p-5 space-y-4">
                  {/* Top Bar: Exam Title & Publication Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-ink">
                          {sub.exam_title || "Academic Examination"}
                        </span>
                        {sub.exam_subject && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-canvas-soft border border-hairline text-ink-muted">
                            {sub.exam_subject}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                        <Calendar className="h-3 w-3" />
                        <span>
                          Submitted on{" "}
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
                        <span>•</span>
                        <span>Roll: {sub.roll_number}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {isPublished ? (
                        <>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Results Published
                          </span>
                          {sub.is_document_purged ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              <AlertCircle className="h-3 w-3 text-slate-500" />
                              PDF Purged (15d TTL)
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200"
                              title="Graded PDFs are deleted 15 days post-evaluation to optimize system storage."
                            >
                              <Clock className="h-3 w-3 text-amber-600" />
                              {sub.days_remaining !== undefined && sub.days_remaining !== null
                                ? `${sub.days_remaining}d until PDF purge`
                                : "15d PDF retention"}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="h-3.5 w-3.5" />
                          Grading in Progress
                        </span>
                      )}

                      {/* Revaluation Status Pill */}
                      {hasOpenReval && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                          <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                          Revaluation In Review
                        </span>
                      )}
                      {isRevalResolved && reval.decision === "MARKS_REVISED" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Marks Revised
                        </span>
                      )}
                      {isRevalResolved && reval.decision === "MARKS_UPHELD" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Marks Upheld
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 15-Day Storage Retention Notice Banner for Published Papers */}
                  {isPublished && (
                    sub.is_document_purged ? (
                      <div className="flex items-center gap-2 p-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700">
                        <Info className="h-4 w-4 text-slate-500 shrink-0" />
                        <span>
                          <strong>Document Expired & Purged:</strong> In accordance with the 15-day retention policy, the scanned PDF pages and bounding box coordinates for this exam have been deleted to preserve storage. Your marks per question and overall evaluation record remain permanently archived.
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-md bg-amber-50/80 border border-amber-200 text-xs text-amber-900">
                        <div className="flex items-center gap-2 min-w-0">
                          <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                          <span>
                            <strong>Storage Retention Notice:</strong> This graded answer sheet will be permanently deleted in{" "}
                            <strong>{sub.days_remaining !== undefined && sub.days_remaining !== null ? `${sub.days_remaining} days` : "15 days"}</strong>. Please download your evaluated PDF now to preserve your personal copy. (Revaluation requests remain open for 7 days).
                          </span>
                        </div>
                        <a
                          href={api.getAnnotatedPdfUrl(sub.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 inline-flex items-center gap-1 font-semibold text-amber-800 hover:text-amber-950 underline text-xs"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download Copy
                        </a>
                      </div>
                    )
                  )}

                  {/* Score & Revaluation Feedback Banner */}
                  {isPublished ? (
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
                  ) : (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg bg-amber-50/60 border border-amber-200/70">
                      <div className="flex items-center gap-2.5">
                        <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-amber-900">
                            Evaluation in Progress • Marks Hidden
                          </div>
                          <div className="text-[11px] text-amber-700">
                            Your answer sheet has been recorded and is undergoing academic evaluation. Marks will be visible once published by faculty.
                          </div>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-white border border-amber-300 text-amber-800 shrink-0">
                        Pending Publication
                      </span>
                    </div>
                  )}

                  {/* Actions Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                      {/* Primary: Inspect in PDF Viewer */}
                      <Link
                        href={`/student/submissions/${sub.id}`}
                        className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover px-3.5 py-2 sm:py-1.5 rounded-md shadow-2xs transition-colors cursor-pointer w-full sm:w-auto text-center"
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

                      <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
                        {/* Secondary: View Breakdown */}
                        {isPublished ? (
                          <button
                            type="button"
                            onClick={() => handleOpenBreakdownModal(sub)}
                            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink bg-surface border border-hairline hover:bg-canvas-soft px-3 py-1.5 rounded-md transition-colors cursor-pointer text-center"
                          >
                            <FileText className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                            <span>Summary</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            title="Detailed breakdown will be accessible once marks are officially published by faculty."
                            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted bg-canvas-soft border border-hairline px-3 py-1.5 rounded-md opacity-60 cursor-not-allowed text-center"
                          >
                            <FileText className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                            <span>Summary Pending</span>
                          </button>
                        )}

                        {/* Download Graded PDF */}
                        {isPublished ? (
                          sub.is_document_purged ? (
                            <button
                              type="button"
                              disabled
                              title="Graded PDF was permanently purged after 15 days to preserve storage. Question marks remain archived."
                              className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted bg-canvas-soft border border-hairline px-3 py-1.5 rounded-md opacity-60 cursor-not-allowed text-center"
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
                              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 px-3 py-1.5 rounded-md transition-colors text-center"
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
                            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted bg-canvas-soft border border-hairline px-3 py-1.5 rounded-md opacity-60 cursor-not-allowed text-center"
                          >
                            <Download className="h-3.5 w-3.5 text-ink-faint shrink-0" />
                            <span>PDF Pending</span>
                          </button>
                        )}
                      </div>
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
        )}
      </div>

      {/* Direct Technical Support & Report Issue Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-surface border border-hairline shadow-2xs">
        <div className="flex items-start sm:items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <LifeBuoy className="h-5 w-5" />
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
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary-active transition-colors shrink-0 shadow-2xs cursor-pointer"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Report Technical Issue</span>
        </button>
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
                      className="p-3 rounded-lg border border-hairline bg-surface space-y-2.5 transition-all shadow-2xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="font-bold text-ink text-xs bg-canvas-soft px-2 py-0.5 rounded border border-hairline">
                            {qLabel}
                          </span>
                          {ans.is_manual_override === 1 && (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
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
                        <p className="text-[11.5px] text-ink-secondary leading-relaxed bg-canvas-soft/40 p-2 rounded border border-hairline/50">
                          <span className="font-semibold text-ink">Prompt: </span>
                          {ans.question_text}
                        </p>
                      ) : isBreakdownLoadingDetails ? (
                        <div className="bg-canvas-soft/40 p-2 rounded border border-hairline/50 space-y-1.5 animate-pulse">
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
                        <div className="text-[11px] text-emerald-800 bg-emerald-50/70 p-2 rounded border border-emerald-200/60">
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
                            <span className="text-[10px] bg-primary/15 text-primary border border-primary/25 px-2 py-0.5 rounded-full font-bold whitespace-nowrap shrink-0">
                              {criterionScores.length} {criterionScores.length === 1 ? "criterion" : "criteria"}
                            </span>
                          ) : isBreakdownLoadingDetails ? (
                            <span className="h-4 w-16 bg-primary/10 border border-primary/20 rounded-full animate-pulse shrink-0 inline-block" />
                          ) : null}
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                          )}
                        </div>
                      </button>

                      {/* EXPANDED EVALUATION SECTION */}
                      {isExpanded && (
                        <div className="space-y-3 pt-1 border-t border-hairline/70 animate-in fade-in duration-200">
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
                                          {crit.description}
                                        </div>
                                        <span
                                          className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono font-bold shrink-0 border ${
                                            isFull
                                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                              : isZero
                                              ? "bg-rose-50 text-rose-700 border-rose-200"
                                              : "bg-amber-50 text-amber-700 border-amber-200"
                                          }`}
                                        >
                                          {critAwarded.toFixed(1)} / {critMax}m
                                        </span>
                                      </div>

                                      {crit.evidence && (
                                        <div className="text-[10.5px] text-ink-muted bg-white/80 p-1.5 rounded border border-hairline/60 leading-relaxed">
                                          <span className="font-semibold text-ink-secondary">AI Finding / Evidence: </span>
                                          {crit.evidence}
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
                            <div className="text-[11px] text-ink-muted italic bg-canvas-soft/40 p-2 rounded border border-hairline/50">
                              Holistic question-level grading applied without sub-criteria.
                            </div>
                          )}

                          {/* 2. Side-by-Side: Student Handwriting vs Official Model Solution */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {/* Student's Transcribed Handwriting */}
                            <div className="p-2.5 rounded-md bg-blue-50/30 border border-blue-200/60 space-y-1">
                              <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-blue-900 uppercase tracking-wider">
                                <Cpu className="h-3 w-3 text-primary shrink-0" />
                                <span>Student Answer (AI Transcribed)</span>
                              </div>
                              <div className="text-[11px] text-ink-secondary leading-relaxed font-mono whitespace-pre-wrap bg-white/80 p-2 rounded border border-blue-100 max-h-36 overflow-y-auto">
                                {hasExtractedText
                                  ? ans.extracted_text
                                  : "No handwriting transcribed for this question."}
                              </div>
                            </div>

                            {/* Official Answer Key */}
                            <div className="p-2.5 rounded-md bg-emerald-50/30 border border-emerald-200/60 space-y-1">
                              <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-emerald-900 uppercase tracking-wider">
                                <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                                <span>Official Model Solution</span>
                              </div>
                              <div className="text-[11px] text-ink-secondary leading-relaxed whitespace-pre-wrap bg-white/80 p-2 rounded border border-emerald-100 max-h-36 overflow-y-auto">
                                {hasOfficialAnswer
                                  ? ans.official_answer
                                  : "Model solution not published or withheld by institute policy."}
                              </div>
                            </div>
                          </div>

                          {/* 3. AI Grading Rationale (if present and distinct) */}
                          {hasRationale && (
                            <div className="text-[11px] text-indigo-950 bg-indigo-50/50 p-2 rounded border border-indigo-200/60 leading-relaxed">
                              <span className="font-semibold text-indigo-900">AI Detailed Reasoning: </span>
                              {ans.grading_rationale}
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
                      )}
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
            <div className="flex items-start gap-2.5 p-3 rounded-md bg-blue-50/70 border border-blue-200/70 text-blue-900">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Institutional Standard:</strong> Under faculty policy, all revaluation requests are{" "}
                <strong>Manually reviewed by senior human examiners</strong>. Automated AI adjustments are strictly forbidden on student grievances.
              </div>
            </div>

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
                            ? "bg-primary/10 border-primary text-primary font-semibold"
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
                        <span className="text-[10px] opacity-75 font-mono">
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
                className="w-full rounded-md border border-[#dddddd] bg-surface p-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
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
    </div>
  );
}
