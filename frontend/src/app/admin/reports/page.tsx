"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Image as ImageIcon,
  ExternalLink,
  Loader2,
  X,
  Search,
  User,
  Building2,
  RefreshCw,
  MessageSquare,
  Inbox,
} from "lucide-react";
import { api, getAuthToken, getStoredUser } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/TenantContext";
import { useBreadcrumbs } from "@/lib/BreadcrumbContext";
import { useToast } from "@/lib/ToastContext";
import { useTechnicalReports } from "@/lib/queries";
import { queryKeys } from "@/lib/queryKeys";
import {
  Skeleton,
  AppleSelect,
  MetricValue,
  RefetchProgressLine,
} from "@/components/ui";

export default function AdminReportsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { setTrail } = useBreadcrumbs();
  const { branches } = useTenant();

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // TanStack Query: Technical reports & stats (Cached, keepPreviousData, instant back-nav, CLS = 0.00)
  const {
    data: reportsData,
    isLoading,
    isFetching,
    refetch: refetchReports,
  } = useTechnicalReports(
    statusFilter !== "ALL" ? statusFilter : undefined,
    roleFilter !== "ALL" ? roleFilter : undefined,
    branchFilter !== "ALL" ? branchFilter : undefined
  );

  const reports = useMemo(() => reportsData?.reports || [], [reportsData?.reports]);
  const stats = useMemo(
    () =>
      reportsData?.stats || {
        total: 0,
        open: 0,
        in_progress: 0,
        resolved: 0,
      },
    [reportsData?.stats]
  );

  // Resolving state per report
  const [adminNotesMap, setAdminNotesMap] = useState<Record<string, string>>({});
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);

  // Full-size screenshot modal / lightbox
  const [activeLightboxImg, setActiveLightboxImg] = useState<string | null>(null);

  // Pre-fill admin notes when reports load
  useEffect(() => {
    if (reports.length > 0) {
      setAdminNotesMap((prev) => {
        const next = { ...prev };
        reports.forEach((r: any) => {
          if (r.admin_notes && !next[r.id]) {
            next[r.id] = r.admin_notes;
          }
        });
        return next;
      });
    }
  }, [reports]);

  // Set breadcrumb
  useEffect(() => {
    setTrail({
      group: "Workspace",
      segments: [{ label: "Issue Reports" }],
    });
  }, [setTrail]);

  // Auth guard: Root Admin only
  useEffect(() => {
    const token = getAuthToken();
    const stored = getStoredUser();
    if (!token) {
      window.location.replace("/auth/login?role=staff&redirect=/admin/reports");
      return;
    }
    if (stored && stored.role !== "ROOT_ADMIN") {
      if (stored.role === "BRANCH_MANAGER" || stored.role === "INSTITUTE_DIRECTOR") {
        window.location.replace("/branch/batches");
      } else {
        window.location.replace("/student/portal");
      }
    }
  }, []);

  const handleUpdateStatus = async (reportId: string, newStatus: string) => {
    try {
      setUpdatingReportId(reportId);
      const notes = adminNotesMap[reportId] || "";
      await api.updateTechnicalReport(reportId, {
        status: newStatus,
        admin_notes: notes,
      });

      toast.success(
        newStatus === "RESOLVED"
          ? "Report marked RESOLVED. Web Push & In-App notifications sent to reporter!"
          : `Report status updated to ${newStatus}.`,
        { title: "Status Updated", duration: 5000 }
      );

      queryClient.invalidateQueries({ queryKey: queryKeys.reports.all() });
      await refetchReports();
    } catch (err: any) {
      toast.error(err.message || "Failed to update report status.", {
        title: "Update Error",
      });
    } finally {
      setUpdatingReportId(null);
    }
  };

  // Client-side text search
  const filteredReports = useMemo(() => {
    if (!searchQuery.trim()) return reports;
    const q = searchQuery.toLowerCase();
    return reports.filter(
      (r) =>
        r.subject?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.user_name?.toLowerCase().includes(q) ||
        r.user_roll?.toLowerCase().includes(q) ||
        r.user_email?.toLowerCase().includes(q) ||
        r.branch_name?.toLowerCase().includes(q)
    );
  }, [reports, searchQuery]);

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12 cascade-group">
      {/* Page Header */}
      <header className="pb-4 border-b border-hairline flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <p className="notion-eyebrow text-ink-muted">Root Support Console</p>
          <h1 className="notion-heading-2 text-2xl sm:text-[26px] text-ink">
            Technical Support &amp; Issue Reports
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed max-w-2xl">
            Review bug reports, upload errors, and UI issues submitted by students and branch managers with instant notification dispatch.
          </p>
        </div>

        <button
          type="button"
          onClick={() => refetchReports()}
          disabled={isFetching}
          className="notion-btn-utility justify-center w-full sm:w-auto shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${isFetching ? "animate-spin" : ""}`} />
          <span>Refresh Reports</span>
        </button>
      </header>

      {/* Section 1: Summary Metrics */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-1">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
                Queue Summary
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface border border-hairline text-ink-muted tabular-nums">
                {stats.total} total
              </span>
            </div>
            <p className="text-xs sm:text-[13px] text-ink-muted leading-relaxed">
              Live support volume grouped by triage and resolution status.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 cascade-fast">
          <div className="notion-card p-3.5 sm:p-4 flex flex-col justify-between min-h-[104px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">Total Reports</span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <Inbox className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2">
              <MetricValue
                isLoading={isLoading}
                value={stats.total}
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
                width="w-12"
              />
            </div>
            <div className="text-xs text-ink-muted mt-1 truncate">All logged tickets</div>
          </div>

          <div className="notion-card p-3.5 sm:p-4 flex flex-col justify-between min-h-[104px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">Open</span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2">
              <MetricValue
                isLoading={isLoading}
                value={stats.open}
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
                width="w-10"
              />
            </div>
            <div className="text-xs text-ink-muted mt-1 flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span className="truncate">Action needed</span>
            </div>
          </div>

          <div className="notion-card p-3.5 sm:p-4 flex flex-col justify-between min-h-[104px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">In Progress</span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <RotateCcw className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2">
              <MetricValue
                isLoading={isLoading}
                value={stats.in_progress}
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
                width="w-10"
              />
            </div>
            <div className="text-xs text-ink-muted mt-1 flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              <span className="truncate">Under investigation</span>
            </div>
          </div>

          <div className="notion-card p-3.5 sm:p-4 flex flex-col justify-between min-h-[104px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-muted truncate">Resolved</span>
              <span className="h-6 w-6 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-2">
              <MetricValue
                isLoading={isLoading}
                value={stats.resolved}
                className="notion-heading-3 text-[22px] text-ink tabular-nums"
                width="w-10"
              />
            </div>
            <div className="text-xs text-ink-muted mt-1 flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate">Closed &amp; notified</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Filter & Triage Queue */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-1">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="notion-section-title text-base sm:text-[18px] text-ink">
                Issue Triage Queue
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface border border-hairline text-ink-muted tabular-nums">
                {filteredReports.length} shown
              </span>
            </div>
            <p className="text-xs sm:text-[13px] text-ink-muted leading-relaxed">
              Filter by status, reporter role, branch, or keyword and dispatch resolution feedback.
            </p>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="notion-card p-3 sm:p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 min-w-0">
            {/* Status Pills */}
            <div className="grid grid-cols-4 sm:inline-flex items-center gap-1 p-1 rounded-md bg-canvas-soft border border-hairline w-full sm:w-auto">
              {[
                { key: "ALL", label: "All" },
                { key: "OPEN", label: "Open" },
                { key: "IN_PROGRESS", label: "Active" },
                { key: "RESOLVED", label: "Resolved" },
              ].map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setStatusFilter(st.key)}
                  className={`px-2.5 py-1 rounded-sm text-xs font-medium transition-colors cursor-pointer whitespace-nowrap text-center ${
                    statusFilter === st.key
                      ? "bg-surface text-ink border border-hairline shadow-2xs"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Role & Branch Filters */}
            <div className="grid grid-cols-2 sm:flex items-center gap-2">
              <AppleSelect
                size="sm"
                value={roleFilter}
                onChange={(val) => setRoleFilter(val)}
                options={[
                  { value: "ALL", label: "All Roles" },
                  { value: "STUDENT", label: "Students Only" },
                  { value: "BRANCH_MANAGER", label: "Branch Managers" },
                ]}
              />

              <AppleSelect
                size="sm"
                value={branchFilter}
                onChange={(val) => setBranchFilter(val)}
                options={[
                  { value: "ALL", label: "All Branches" },
                  ...branches.map((b) => ({ value: b.id, label: b.name })),
                ]}
                className="sm:max-w-[180px]"
              />
            </div>
          </div>

          {/* Search Input */}
          <div className="relative w-full lg:w-64 min-w-0 shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search keyword, name, roll..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Reports List */}
        <div className="relative">
          <RefetchProgressLine isFetching={isFetching} />
          {isLoading && reports.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="notion-card p-4 sm:p-5 space-y-3">
                  <Skeleton className="h-5 w-1/3 rounded-xs" />
                  <Skeleton className="h-16 w-full rounded-md" />
                  <Skeleton className="h-8 w-1/4 rounded-md" />
                </div>
              ))}
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="notion-card py-12 px-6 text-center space-y-2.5">
              <div className="mx-auto h-10 w-10 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold text-ink">No reports match your filters</div>
              <p className="text-xs text-ink-muted max-w-sm mx-auto leading-relaxed">
                There are currently no technical issue reports matching the selected status or search term.
              </p>
            </div>
          ) : (
            <div className={`space-y-4 ${isFetching ? "opacity-75 transition-opacity" : ""}`}>
              {filteredReports.map((report) => {
                const isResolved = report.status === "RESOLVED";
                const isInProgress = report.status === "IN_PROGRESS";
                const isOpen = report.status === "OPEN";
                const isStudent = report.user_role === "STUDENT";
                const isUpdating = updatingReportId === report.id;
                const currentNotes = adminNotesMap[report.id] ?? (report.admin_notes || "");

                const dateStr = report.created_at
                  ? new Date(report.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Recent";

                const statusLabel = isResolved
                  ? "Resolved"
                  : isInProgress
                  ? "In Progress"
                  : "Open";

                const statusDotClass = isResolved
                  ? "bg-emerald-500"
                  : isInProgress
                  ? "bg-primary"
                  : "bg-amber-500";

                return (
                  <div
                    key={report.id}
                    className="notion-card p-4 sm:p-5 space-y-4"
                  >
                    {/* Header row: Reporter info + Status */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="notion-section-title text-sm sm:text-base text-ink break-words">
                            {report.subject}
                          </h3>
                          {report.category && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-ink-secondary">
                              {report.category.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>

                        {/* Reporter Metadata */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                          <span className="inline-flex items-center gap-1 font-medium text-ink">
                            <User className="h-3 w-3 text-ink-muted shrink-0" />
                            <span>{report.user_name}</span>
                          </span>

                          <span className="px-1.5 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-[11px] text-ink-secondary">
                            {isStudent ? "Student" : "Branch Manager"}
                          </span>

                          {report.user_roll && (
                            <span className="text-ink-secondary font-mono">
                              Roll: {report.user_roll}
                            </span>
                          )}

                          {report.branch_name && (
                            <span className="inline-flex items-center gap-1 text-ink-secondary">
                              <Building2 className="h-3 w-3 text-ink-muted shrink-0" />
                              <span>{report.branch_name}</span>
                            </span>
                          )}

                          <span className="text-ink-faint">•</span>
                          <span>{dateStr}</span>
                        </div>
                      </div>

                      {/* Calm Status Indicator */}
                      <div className="self-start shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs bg-canvas-soft border border-hairline text-xs font-medium text-ink-secondary">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass}`} />
                        <span>{statusLabel}</span>
                      </div>
                    </div>

                    {/* Full Description Box */}
                    <div className="p-3 rounded-md bg-canvas-soft border border-hairline text-xs sm:text-[13px] text-ink leading-relaxed whitespace-pre-wrap break-words">
                      {report.description}
                    </div>

                    {/* Screenshots Gallery */}
                    {report.screenshots && report.screenshots.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-ink-muted flex flex-wrap items-center gap-1.5">
                          <ImageIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>Attached Screenshots ({report.screenshots.length})</span>
                          <span className="text-ink-faint">• Click to inspect</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          {report.screenshots.map((imgFilename: string, imgIdx: number) => {
                            const imgUrl = api.getReportImageUrl(report.id, imgFilename);
                            return (
                              <button
                                key={imgIdx}
                                type="button"
                                onClick={() => setActiveLightboxImg(imgUrl)}
                                className="relative group rounded-md overflow-hidden border border-hairline aspect-video h-20 bg-surface hover:border-primary transition-colors cursor-pointer"
                                title="Click to view full screenshot"
                              >
                                <img
                                  src={imgUrl}
                                  alt={`Report attachment ${imgIdx + 1}`}
                                  className="h-full w-auto object-cover group-hover:scale-105 transition-transform"
                                  onError={(e) => {
                                    const target = e.currentTarget;
                                    target.style.display = "none";
                                    const parent = target.parentElement;
                                    if (parent && !parent.querySelector(".img-missing-badge")) {
                                      const fallback = document.createElement("div");
                                      fallback.className = "img-missing-badge h-full w-full flex flex-col items-center justify-center p-2 text-center bg-canvas-soft text-[10px] text-ink-muted";
                                      fallback.innerHTML = "<span class='font-semibold text-red-600'>Image Unavailable</span><span class='text-[9px] text-ink-secondary mt-0.5'>Attachment not found</span>";
                                      parent.appendChild(fallback);
                                    }
                                  }}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                  <ExternalLink className="h-4 w-4" />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Admin Resolution & Feedback Console */}
                    <div className="pt-3.5 border-t border-hairline space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-1.5 font-medium text-ink">
                          <MessageSquare className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                          <span>Admin Resolution Remarks</span>
                        </span>
                        {isResolved && report.resolved_at && (
                          <span className="text-xs text-ink-muted">
                            Resolved {new Date(report.resolved_at).toLocaleDateString()}
                            {report.resolved_by_name && ` by ${report.resolved_by_name}`}
                          </span>
                        )}
                      </div>

                      <textarea
                        value={currentNotes}
                        onChange={(e) =>
                          setAdminNotesMap((prev) => ({ ...prev, [report.id]: e.target.value }))
                        }
                        placeholder="Enter resolution notes, root cause fix, or instructions for the student/branch manager..."
                        rows={2}
                        className="w-full p-2.5 rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary leading-relaxed resize-none"
                      />

                      {/* Action Buttons */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(report.id, "OPEN")}
                            disabled={isUpdating || isOpen}
                            className={`notion-btn-utility justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                              isOpen ? "border-amber-400/60 text-ink" : ""
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                            <span>Open</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(report.id, "IN_PROGRESS")}
                            disabled={isUpdating || isInProgress}
                            className={`notion-btn-utility justify-center disabled:opacity-50 disabled:cursor-not-allowed ${
                              isInProgress ? "border-primary text-primary" : ""
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            <span>In Progress</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(report.id, "RESOLVED")}
                          disabled={isUpdating}
                          className="notion-btn-primary justify-center w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isUpdating ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span>Resolve &amp; Notify Reporter</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Lightbox Screenshot Modal */}
      {activeLightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setActiveLightboxImg(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-surface rounded-lg overflow-hidden border border-hairline shadow-notion-modal flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-hairline bg-surface">
              <span className="font-semibold text-xs text-ink flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-primary" />
                <span>Screenshot Inspection</span>
              </span>
              <button
                type="button"
                onClick={() => setActiveLightboxImg(null)}
                className="p-1 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-2 overflow-auto flex items-center justify-center bg-canvas-soft">
              <img
                src={activeLightboxImg}
                alt="Enlarged screenshot"
                className="max-h-[75vh] w-auto object-contain rounded-md"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = "none";
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector(".lightbox-error-msg")) {
                    const fallback = document.createElement("div");
                    fallback.className = "lightbox-error-msg p-8 text-center space-y-2 text-ink-secondary";
                    fallback.innerHTML = "<div class='text-sm font-semibold text-red-600'>Screenshot Unavailable</div><p class='text-xs text-ink-muted max-w-sm mx-auto'>This attachment could not be retrieved from cloud storage.</p>";
                    parent.appendChild(fallback);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
