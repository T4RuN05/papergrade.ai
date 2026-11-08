"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  LifeBuoy,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Image as ImageIcon,
  ExternalLink,
  Filter,
  Send,
  Loader2,
  X,
  Search,
  User,
  Building2,
  RefreshCw,
  MessageSquare,
} from "lucide-react";
import { api, getAuthToken, getStoredUser } from "@/lib/api";
import { useTenant } from "@/lib/TenantContext";
import { useBreadcrumbs } from "@/lib/BreadcrumbContext";
import { useToast } from "@/lib/ToastContext";
import {
  ButtonPrimary,
  ButtonUtility,
  BadgePill,
  Skeleton,
  AppleSelect,
} from "@/components/ui";

export default function AdminReportsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { setTrail } = useBreadcrumbs();
  const { currentUser, isRootAdmin, branches } = useTenant();

  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<any[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    in_progress: 0,
    resolved: 0,
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Resolving state per report
  const [adminNotesMap, setAdminNotesMap] = useState<Record<string, string>>({});
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);

  // Full-size screenshot modal / lightbox
  const [activeLightboxImg, setActiveLightboxImg] = useState<string | null>(null);

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
      router.replace("/auth/login?role=staff&redirect=/admin/reports");
      return;
    }
    if (stored && stored.role !== "ROOT_ADMIN") {
      if (stored.role === "BRANCH_MANAGER") {
        router.replace("/branch/batches");
      } else {
        router.replace("/student/portal");
      }
    }
  }, [router]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const res = await api.listTechnicalReports(
        statusFilter !== "ALL" ? statusFilter : undefined,
        roleFilter !== "ALL" ? roleFilter : undefined,
        branchFilter !== "ALL" ? branchFilter : undefined
      );
      setReports(res.reports || []);
      setStats(
        res.stats || {
          total: 0,
          open: 0,
          in_progress: 0,
          resolved: 0,
        }
      );

      // Pre-fill existing admin notes
      const initialNotes: Record<string, string> = {};
      (res.reports || []).forEach((r: any) => {
        if (r.admin_notes) {
          initialNotes[r.id] = r.admin_notes;
        }
      });
      setAdminNotesMap(initialNotes);
    } catch (err: any) {
      toast.error(err.message || "Failed to load technical reports.", {
        title: "Load Error",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [statusFilter, roleFilter, branchFilter]);

  const handleUpdateStatus = async (reportId: string, newStatus: string) => {
    try {
      setUpdatingReportId(reportId);
      const notes = adminNotesMap[reportId] || "";
      const res = await api.updateTechnicalReport(reportId, {
        status: newStatus,
        admin_notes: notes,
      });

      toast.success(
        newStatus === "RESOLVED"
          ? "Report marked RESOLVED. Web Push & In-App notifications sent to reporter!"
          : `Report status updated to ${newStatus}.`,
        { title: "Status Updated", duration: 5000 }
      );

      // Update local state
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, ...res.report } : r))
      );

      // Refresh stats
      loadReports();
    } catch (err: any) {
      toast.error(err.message || "Failed to update report.", {
        title: "Update Failed",
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
    <div className="space-y-6">
      {/* Top Header & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              Technical Support & Issue Reports
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
              Root Console
            </span>
          </div>
          <p className="text-xs text-ink-secondary mt-1">
            Review bug reports, upload errors, and UI issues submitted by students and branch managers with instant Web Push resolution dispatch.
          </p>
        </div>

        <button
          type="button"
          onClick={loadReports}
          disabled={loading}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-surface hover:bg-canvas-soft border border-hairline transition-colors cursor-pointer text-ink shadow-2xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Reports</span>
        </button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg bg-surface border border-hairline shadow-2xs">
          <div className="text-[11px] font-semibold text-ink-muted uppercase">Total Reports</div>
          <div className="text-xl sm:text-2xl font-black text-ink font-mono mt-0.5">
            {stats.total}
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-surface border border-hairline shadow-2xs">
          <div className="text-[11px] font-semibold text-amber-600 uppercase flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            <span>Open (Action Needed)</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-600 font-mono mt-0.5">
            {stats.open}
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-surface border border-hairline shadow-2xs">
          <div className="text-[11px] font-semibold text-blue-600 uppercase flex items-center gap-1">
            <RotateCcw className="h-3 w-3" />
            <span>In Progress</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-600 font-mono mt-0.5">
            {stats.in_progress}
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-surface border border-hairline shadow-2xs">
          <div className="text-[11px] font-semibold text-emerald-600 uppercase flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            <span>Resolved</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 font-mono mt-0.5">
            {stats.resolved}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-lg bg-surface border border-hairline shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Status Pills */}
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-canvas-soft border border-hairline">
            {["ALL", "OPEN", "IN_PROGRESS", "RESOLVED"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === st
                    ? "bg-surface text-ink shadow-2xs border border-hairline"
                    : "text-ink-secondary hover:text-ink"
                }`}
              >
                {st === "ALL" ? "All Status" : st.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Role Filter (Custom Apple-Grade Dropdown) */}
          <AppleSelect
            size="sm"
            value={roleFilter}
            onChange={(val) => setRoleFilter(val)}
            options={[
              { value: "ALL", label: "All Roles" },
              { value: "STUDENT", label: "Students Only" },
              { value: "BRANCH_MANAGER", label: "Branch Managers Only" },
            ]}
          />

          {/* Branch Filter (Custom Apple-Grade Dropdown) */}
          <AppleSelect
            size="sm"
            value={branchFilter}
            onChange={(val) => setBranchFilter(val)}
            options={[
              { value: "ALL", label: "All Branches" },
              ...branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
            className="max-w-[170px]"
          />
        </div>

        {/* Search Input */}
        <div className="relative min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reports by keyword, name, roll..."
            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 rounded-lg bg-surface border border-hairline space-y-3">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-8 w-1/4" />
            </div>
          ))}
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="py-12 text-center text-ink-muted space-y-2 p-6 rounded-lg border border-hairline bg-surface">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto opacity-80" />
          <div className="font-bold text-ink text-sm">No reports match your filters</div>
          <p className="text-xs text-ink-secondary max-w-sm mx-auto">
            There are currently no technical issue reports matching the selected status or search term.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
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

            return (
              <div
                key={report.id}
                className="p-4 sm:p-5 rounded-lg border border-hairline bg-surface transition-all shadow-2xs space-y-3.5 relative overflow-hidden"
              >
                {/* Micro Left Accent Indicator */}
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 ${
                    isOpen
                      ? "bg-amber-500/80 dark:bg-amber-400/70"
                      : isInProgress
                      ? "bg-sky-500/80 dark:bg-sky-400/70"
                      : "bg-emerald-500/80 dark:bg-emerald-400/70"
                  }`}
                />

                {/* Header row: Reporter info + Status */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pl-1">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-ink text-sm sm:text-base">
                        {report.subject}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-canvas-soft border border-hairline text-ink-secondary">
                        {report.category?.replace(/_/g, " ")}
                      </span>
                    </div>

                    {/* Reporter Metadata */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <span className="inline-flex items-center gap-1 font-semibold text-ink">
                        <User className="h-3 w-3 text-primary" />
                        {report.user_name}
                      </span>

                      <BadgePill
                        label={isStudent ? "Student" : "Branch Manager"}
                        color={isStudent ? "sky" : "teal"}
                      />

                      {report.user_roll && (
                        <span className="text-ink font-mono font-medium">
                          Roll: {report.user_roll}
                        </span>
                      )}

                      {report.branch_name && (
                        <span className="inline-flex items-center gap-1 text-ink-secondary">
                          <Building2 className="h-3 w-3" />
                          {report.branch_name}
                        </span>
                      )}

                      <span>•</span>
                      <span>{dateStr}</span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="self-start sm:self-auto shrink-0">
                    {isResolved ? (
                      <BadgePill label="Resolved" color="green" />
                    ) : isInProgress ? (
                      <BadgePill label="In Progress" color="sky" />
                    ) : (
                      <BadgePill label="Open" color="orange" />
                    )}
                  </div>
                </div>

                {/* Full Description Box (1000 max chars) */}
                <div className="p-3 rounded-lg bg-canvas-soft border border-hairline text-xs text-ink leading-relaxed whitespace-pre-wrap">
                  {report.description}
                </div>

                {/* Screenshots Gallery (Thumbnails) */}
                {report.screenshots && report.screenshots.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-ink-muted flex items-center gap-1.5">
                      <ImageIcon className="h-3.5 w-3.5 text-primary" />
                      <span>Attached Screenshots ({report.screenshots.length}):</span>
                      <span className="font-normal text-[10px]">(Click to inspect full resolution)</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {report.screenshots.map((imgFilename: string, imgIdx: number) => {
                        const imgUrl = api.getReportImageUrl(report.id, imgFilename);
                        return (
                          <button
                            key={imgIdx}
                            type="button"
                            onClick={() => setActiveLightboxImg(imgUrl)}
                            className="relative group rounded-md overflow-hidden border border-hairline aspect-video h-20 bg-surface shadow-2xs hover:border-primary transition-all cursor-pointer"
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
                                  fallback.innerHTML = "<span class='font-semibold text-rose-500'>Image Unavailable</span><span class='text-[9px] text-ink-secondary mt-0.5'>Attachment not found</span>";
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
                <div className="pt-3 border-t border-hairline space-y-2.5 bg-canvas-soft/40 -mx-4 -mb-4 p-4 rounded-b-lg">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink">
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-primary" />
                      <span>Admin Resolution Remarks:</span>
                    </span>
                    {isResolved && report.resolved_at && (
                      <span className="text-[10px] font-normal text-emerald-700">
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
                    className="w-full p-2.5 rounded-md border border-hairline bg-surface text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed resize-none"
                  />

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-ink-muted">Set Status:</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(report.id, "OPEN")}
                        disabled={isUpdating || isOpen}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          isOpen
                            ? "btn-glass-amber"
                            : "btn-glass-utility text-ink-secondary"
                        }`}
                      >
                        Open
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(report.id, "IN_PROGRESS")}
                        disabled={isUpdating || isInProgress}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          isInProgress
                            ? "btn-glass-primary"
                            : "btn-glass-utility text-ink-secondary"
                        }`}
                      >
                        In Progress
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(report.id, "RESOLVED")}
                      disabled={isUpdating}
                      className="btn-glass-emerald inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {isUpdating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
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

      {/* Lightbox Screenshot Modal */}
      {activeLightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setActiveLightboxImg(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-surface rounded-lg overflow-hidden border border-hairline shadow-2xl flex flex-col"
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
            <div className="p-2 overflow-auto flex items-center justify-center bg-black/5">
              <img
                src={activeLightboxImg}
                alt="Enlarged screenshot"
                className="max-h-[75vh] w-auto object-contain rounded"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = "none";
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector(".lightbox-error-msg")) {
                    const fallback = document.createElement("div");
                    fallback.className = "lightbox-error-msg p-8 text-center space-y-2 text-ink-secondary";
                    fallback.innerHTML = "<div class='text-sm font-semibold text-rose-600'>Screenshot Unavailable</div><p class='text-xs text-ink-muted max-w-sm mx-auto'>This attachment could not be retrieved from cloud storage.</p>";
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
