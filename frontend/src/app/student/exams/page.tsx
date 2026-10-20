"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  RotateCcw,
  ShieldCheck,
  Eye,
  FileText,
  BookOpen,
  Download,
  ArrowLeft,
  LifeBuoy,
  Info,
  Sliders,
  Sparkles,
} from "lucide-react";
import { api, getAuthToken } from "@/lib/api";
import { useToast } from "@/lib/ToastContext";
import { FeatureCard, ModalCard } from "@/components/ui";
import { ArtifactViewerModal } from "@/components/ArtifactViewerModal";
import { ReportIssueModal } from "@/components/ReportIssueModal";

export default function StudentPastExamsPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");

  // Expanded cards state (mapping submission.id -> boolean)
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});

  // Question Paper & Answer Key Viewer Modal state
  const [artifactModalOpen, setArtifactModalOpen] = useState(false);
  const [artifactModalExam, setArtifactModalExam] = useState<any>(null);
  const [artifactModalInitialTab, setArtifactModalInitialTab] = useState<"question-paper" | "answer-key">("question-paper");

  // Detailed Breakdown Modal state
  const [breakdownModalOpen, setBreakdownModalOpen] = useState(false);
  const [breakdownSubmission, setBreakdownSubmission] = useState<any>(null);
  const [isBreakdownLoadingDetails, setIsBreakdownLoadingDetails] = useState(false);
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Record<string, boolean>>({});

  // Technical issue report modal state
  const [reportModalOpen, setReportModalOpen] = useState(false);

  // Load submissions data
  const loadSubmissions = async () => {
    try {
      setLoading(true);
      try {
        const state = await api.getStudentPortalState();
        if (state && state.submissions) {
          setSubmissions(state.submissions);
          return;
        }
      } catch (err) {
        console.warn("Portal state endpoint failed, falling back to listSubmissions", err);
      }

      const list = await api.listSubmissions().catch(() => []);
      setSubmissions(list);
    } catch (err: any) {
      toast.error(err.message || "Failed to load past exams");
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
    loadSubmissions();
  }, [router]);

  // Toggle card expansion
  const toggleCard = (id: string) => {
    setExpandedCardIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Expand or collapse all cards
  const handleToggleAllCards = (expand: boolean) => {
    const nextState: Record<string, boolean> = {};
    submissions.forEach((s) => {
      nextState[s.id] = expand;
    });
    setExpandedCardIds(nextState);
  };

  // Unique subjects for filter
  const subjects = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach((s) => {
      const sub = s.exam_subject || s.subject;
      if (sub && sub.trim()) set.add(sub.trim());
    });
    return Array.from(set);
  }, [submissions]);

  // Filtered submissions based on search query and filter pills
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((sub) => {
      // Search by title or subject
      const title = (sub.exam_title || "").toLowerCase();
      const subject = (sub.exam_subject || sub.subject || "").toLowerCase();
      const query = searchQuery.trim().toLowerCase();

      const matchesSearch =
        !query || title.includes(query) || subject.includes(query);

      // Filter by subject
      const currentSubject = (sub.exam_subject || sub.subject || "").trim();
      const matchesSubject =
        selectedSubject === "ALL" || currentSubject === selectedSubject;

      // Filter by status
      const isPublished =
        sub.publication_status === "PUBLISHED" ||
        (sub.publication_status !== "UNPUBLISHED" && Boolean(sub.exam_is_published || sub.is_published));
      
      let matchesStatus = true;
      if (selectedStatus === "PUBLISHED") {
        matchesStatus = isPublished;
      } else if (selectedStatus === "IN_PROGRESS") {
        matchesStatus = !isPublished;
      } else if (selectedStatus === "PURGED") {
        matchesStatus = isPublished && Boolean(sub.is_document_purged);
      }

      return matchesSearch && matchesSubject && matchesStatus;
    });
  }, [submissions, searchQuery, selectedSubject, selectedStatus]);

  // Open Breakdown Modal for a specific submission
  const handleOpenBreakdownModal = async (sub: any) => {
    const isPub =
      sub.publication_status === "PUBLISHED" ||
      (sub.publication_status !== "UNPUBLISHED" && Boolean(sub.exam_is_published || sub.is_published));
    if (!isPub) {
      toast.info(
        "Evaluation marks and summary are undergoing faculty review and will be accessible once officially published.",
        { title: "Grading in Progress" }
      );
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

  const toggleQuestionExpand = (qKey: string) => {
    setExpandedQuestionIds((prev) => ({
      ...prev,
      [qKey]: !prev[qKey],
    }));
  };

  const toggleAllQuestionsExpand = (answers: any[]) => {
    const allExpanded = answers.every(
      (a: any, idx: number) => expandedQuestionIds[a.id || a.question_id || `q_${idx}`]
    );
    const nextState: Record<string, boolean> = {};
    answers.forEach((a: any, idx: number) => {
      const key = a.id || a.question_id || `q_${idx}`;
      nextState[key] = !allExpanded;
    });
    setExpandedQuestionIds(nextState);
  };

  return (
    <div className="min-h-screen bg-canvas pb-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Navigation Breadcrumb / Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-hairline">
          <div className="space-y-1">
            <Link
              href="/student/portal"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover transition-colors py-1.5 px-2 -ml-2 rounded-lg hover:bg-canvas-soft w-fit mb-1"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Student Portal</span>
            </Link>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
                Past Exam Submissions
              </h1>
              <span className="text-xs font-semibold text-ink-muted bg-canvas-soft px-2.5 py-1 rounded-full border border-hairline shrink-0">
                {submissions.length} {submissions.length === 1 ? "Paper" : "Papers"}
              </span>
            </div>
            <p className="text-xs text-ink-muted">
              Search by title or subject. Click any exam card to expand detailed scores, verified PDF viewer, and answer keys.
            </p>
          </div>

          {/* Quick Expand / Collapse All Controls */}
          {filteredSubmissions.length > 0 && (
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => handleToggleAllCards(true)}
                className="text-[11px] font-semibold text-ink-secondary hover:text-ink px-2.5 py-1 rounded border border-hairline bg-surface hover:bg-canvas-soft transition-colors"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={() => handleToggleAllCards(false)}
                className="text-[11px] font-semibold text-ink-secondary hover:text-ink px-2.5 py-1 rounded border border-hairline bg-surface hover:bg-canvas-soft transition-colors"
              >
                Collapse All
              </button>
            </div>
          )}
        </div>

        {/* SEARCH & FILTER CONTROLS */}
        <div className="space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search exams by title or subject (e.g. Storage Optimization, Physics, KTG)..."
              className="w-full pl-10 pr-10 py-2.5 bg-surface text-xs sm:text-sm text-ink placeholder:text-ink-muted rounded-xl border border-hairline focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink rounded-md transition-colors"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Pills (Subject & Status) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            {/* Subject Filters */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider mr-1">
                Subject:
              </span>
              <button
                type="button"
                onClick={() => setSelectedSubject("ALL")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  selectedSubject === "ALL"
                    ? "bg-primary text-white shadow-2xs font-semibold"
                    : "bg-surface text-ink-secondary hover:bg-canvas-soft border border-hairline"
                }`}
              >
                All Subjects
              </button>
              {subjects.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSelectedSubject(sub)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    selectedSubject === sub
                      ? "bg-primary text-white shadow-2xs font-semibold"
                      : "bg-surface text-ink-secondary hover:bg-canvas-soft border border-hairline"
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>

            {/* Status Filters */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider mr-1">
                Status:
              </span>
              <button
                type="button"
                onClick={() => setSelectedStatus("ALL")}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  selectedStatus === "ALL"
                    ? "bg-ink text-white font-semibold"
                    : "bg-surface text-ink-muted hover:bg-canvas-soft border border-hairline"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus("PUBLISHED")}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  selectedStatus === "PUBLISHED"
                    ? "bg-emerald-600 text-white font-semibold"
                    : "bg-surface text-ink-muted hover:bg-canvas-soft border border-hairline"
                }`}
              >
                Published
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus("IN_PROGRESS")}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  selectedStatus === "IN_PROGRESS"
                    ? "bg-amber-600 text-white font-semibold"
                    : "bg-surface text-ink-muted hover:bg-canvas-soft border border-hairline"
                }`}
              >
                In Progress
              </button>
            </div>
          </div>
        </div>

        {/* RESULTS & CARDS LIST */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-xl bg-surface border border-hairline animate-pulse p-4 flex items-center justify-between"
              >
                <div className="space-y-2 w-1/3">
                  <div className="h-4 bg-canvas-soft rounded w-3/4" />
                  <div className="h-3 bg-canvas-soft rounded w-1/2" />
                </div>
                <div className="h-6 bg-canvas-soft rounded w-24" />
              </div>
            ))}
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-surface p-10 text-center space-y-3">
            <FileText className="h-10 w-10 text-ink-faint mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-ink">
                {submissions.length === 0
                  ? "No exam submissions found"
                  : "No matching exams found"}
              </h3>
              <p className="text-xs text-ink-muted max-w-md mx-auto">
                {submissions.length === 0
                  ? "When you upload your answer sheets during an active examination window, your verified submissions, AI evaluations, and faculty remarks will appear here."
                  : `No past exams matched "${searchQuery || selectedSubject || selectedStatus}". Try adjusting or clearing your filters.`}
              </p>
            </div>
            {submissions.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedSubject("ALL");
                  setSelectedStatus("ALL");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary hover:underline"
              >
                Reset all filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSubmissions.map((sub) => {
              const isExpanded = Boolean(expandedCardIds[sub.id]);
              const isPublished =
                sub.publication_status === "PUBLISHED" ||
                (sub.publication_status !== "UNPUBLISHED" && Boolean(sub.exam_is_published || sub.is_published));
              const hasAnswers = sub.answers && sub.answers.length > 0;
              const reval = sub.revaluation;
              const hasOpenReval =
                reval && (reval.status === "SUBMITTED" || reval.status === "UNDER_REVIEW");
              const isRevalResolved = reval && reval.status === "RESOLVED";

              return (
                <FeatureCard
                  key={sub.id}
                  className={`transition-all duration-200 border ${
                    isExpanded
                      ? "p-4 sm:p-5 shadow-sm border-primary/30 ring-1 ring-primary/20"
                      : "p-3.5 sm:p-4 hover:border-hairline-strong hover:bg-canvas-soft/30 cursor-pointer"
                  }`}
                >
                  {/* COLLAPSED HEADER ROW (Always visible, acts as toggle bar) */}
                  <div
                    onClick={() => toggleCard(sub.id)}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    {/* Left: Title, Subject, Date, Roll */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-ink hover:text-primary transition-colors">
                          {sub.exam_title || "Academic Examination"}
                        </span>
                        {(sub.exam_subject || sub.subject) && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-canvas-soft border border-hairline text-ink-muted">
                            {sub.exam_subject || sub.subject}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>
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

                    {/* Right: Status Pills, Score Preview & Chevron */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
                      {isPublished ? (
                        <>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            Results Published
                          </span>
                          {sub.is_document_purged ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              <AlertCircle className="h-3 w-3 text-slate-500" />
                              PDF Purged
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200"
                              title="Graded PDFs are deleted 15 days post-evaluation to optimize system storage."
                            >
                              <Clock className="h-3 w-3 text-amber-600" />
                              {sub.days_remaining !== undefined && sub.days_remaining !== null
                                ? `${sub.days_remaining}d until purge`
                                : "15d retention"}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="h-3 w-3" />
                          Grading in Progress
                        </span>
                      )}

                      {/* Revaluation status pill */}
                      {hasOpenReval && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                          <RotateCcw className="h-3 w-3 animate-spin" />
                          In Review
                        </span>
                      )}
                      {isRevalResolved && reval.decision === "MARKS_REVISED" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <Sparkles className="h-3 w-3" />
                          Marks Revised
                        </span>
                      )}

                      {/* Score Summary Badge (Collapsed view) */}
                      {isPublished && sub.total_awarded_marks !== null && (
                        <span className="px-2 py-0.5 rounded-md bg-canvas-soft border border-hairline text-xs font-bold text-ink">
                          {Number(sub.total_awarded_marks).toFixed(1)} / {sub.max_marks || sub.exam_total_marks || 25}m
                          {sub.percentage !== null && ` (${Number(sub.percentage).toFixed(0)}%)`}
                        </span>
                      )}

                      {/* Expand / Collapse Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCard(sub.id);
                        }}
                        className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors ml-1"
                        aria-label={isExpanded ? "Collapse exam card" : "Expand exam card"}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* EXPANDED CONTENT (Full Current View) */}
                  {isExpanded && (
                    <div className="pt-4 mt-3 border-t border-hairline space-y-4 animate-in fade-in-50 duration-200">
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

                            {/* Question Paper & Answer Key Viewer */}
                            {isPublished && (sub.has_question_paper || sub.has_answer_key) && (
                              <button
                                type="button"
                                onClick={() => {
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
                                }}
                                className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink bg-surface border border-hairline hover:bg-canvas-soft px-3 py-1.5 rounded-md transition-colors cursor-pointer text-center"
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

                        {/* Revaluation Appeal Status Pill */}
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
                    </div>
                  )}
                </FeatureCard>
              );
            })}
          </div>
        )}

        {/* Technical Support Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-surface border border-hairline shadow-2xs mt-8">
          <div className="flex items-start sm:items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-ink">Facing an issue with your past paper?</h3>
              <p className="text-[11px] text-ink-muted">
                Submit an urgent system report to administrators if marks are unreadable or answer keys are missing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReportModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink bg-canvas-soft hover:bg-surface border border-hairline px-3 py-1.5 rounded-md transition-colors shrink-0"
          >
            Report Issue
          </button>
        </div>
      </div>

      {/* QUESTION PAPER & ANSWER KEY MODAL */}
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

                  return (
                    <div
                      key={qKey}
                      className="rounded-lg border border-hairline bg-surface overflow-hidden transition-all shadow-2xs"
                    >
                      <button
                        type="button"
                        onClick={() => toggleQuestionExpand(qKey)}
                        className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-canvas-soft/60 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
                            {qLabel}
                          </span>
                          <span className="text-xs font-medium text-ink truncate">
                            {ans.question_text || `Question ${qLabel}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="text-xs font-bold text-ink">
                              {ans.awarded_marks !== null && ans.awarded_marks !== undefined
                                ? Number(ans.awarded_marks).toFixed(1)
                                : "0.0"}
                            </span>
                            <span className="text-[10px] text-ink-muted">
                              {" "}
                              / {ans.max_marks ?? 5}m
                            </span>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-ink-muted" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-ink-muted" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="p-3 pt-0 border-t border-hairline/60 space-y-3 bg-canvas-soft/30 text-xs">
                          {ans.question_text && (
                            <div className="space-y-1 pt-2">
                              <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider">
                                Question Text:
                              </span>
                              <p className="text-ink text-xs font-serif leading-relaxed">
                                {ans.question_text}
                              </p>
                            </div>
                          )}

                          {hasCriteria && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider">
                                Step & Criteria Breakdown:
                              </span>
                              <div className="space-y-1.5">
                                {criterionScores.map((c: any, cIdx: number) => (
                                  <div
                                    key={cIdx}
                                    className="p-2 rounded bg-surface border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                  >
                                    <div className="space-y-0.5 min-w-0">
                                      <div className="text-[11px] font-semibold text-ink">
                                        {c.criterion_name || `Step ${cIdx + 1}`}
                                      </div>
                                      {c.feedback && (
                                        <p className="text-[10px] text-ink-muted italic">
                                          "{c.feedback}"
                                        </p>
                                      )}
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <span className="font-mono text-[11px] font-bold text-ink">
                                        {Number(c.awarded_marks ?? 0).toFixed(1)} / {Number(c.max_marks ?? 1).toFixed(1)}m
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {hasOfficialAnswer && (
                            <div className="space-y-1 pt-1">
                              <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider">
                                Official Answer Key:
                              </span>
                              <div className="p-2 rounded bg-surface border border-hairline text-ink font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                                {ans.official_answer}
                              </div>
                            </div>
                          )}

                          {hasExtractedText && (
                            <div className="space-y-1 pt-1">
                              <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider">
                                Student Script Transcription:
                              </span>
                              <div className="p-2 rounded bg-surface border border-hairline text-ink font-mono text-[11px] whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                                {ans.extracted_text}
                              </div>
                            </div>
                          )}

                          {ans.feedback && !hasCriteria && (
                            <div className="space-y-1 pt-1">
                              <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider">
                                Evaluator Feedback:
                              </span>
                              <p className="text-ink-secondary text-xs italic">
                                "{ans.feedback}"
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : isBreakdownLoadingDetails ? (
              <div className="p-8 text-center text-ink-muted space-y-2">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs">Loading detailed question marks...</p>
              </div>
            ) : (
              <div className="p-6 text-center text-ink-muted">
                No per-question evaluation breakdown available for this paper.
              </div>
            )}
          </div>
        )}
      </ModalCard>

      {/* REPORT TECHNICAL ISSUE MODAL */}
      <ReportIssueModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        userRole="STUDENT"
      />
    </div>
  );
}
