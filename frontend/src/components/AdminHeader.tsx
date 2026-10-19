"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  Bell,
  Sparkles,
  Database,
  ChevronRight,
  ChevronDown,
  Check,
  ExternalLink,
  Building2,
  Layers,
  LogOut,
  LifeBuoy,
} from "lucide-react";
import { api, getAuthToken } from "@/lib/api";
import { BadgePill } from "./ui";
import { useNotifications } from "@/lib/NotificationContext";
import { useTenant } from "@/lib/TenantContext";
import { useBreadcrumbs } from "@/lib/BreadcrumbContext";
import { useToast, queueToast } from "@/lib/ToastContext";
import { ReportIssueModal } from "./ReportIssueModal";

interface AdminHeaderProps {
  onOpenMobileSidebar: () => void;
}

export function AdminHeader({ onOpenMobileSidebar }: AdminHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { unreadCount, openDrawer } = useNotifications();
  const { trail } = useBreadcrumbs();
  const [mounted, setMounted] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const branchDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(event.target as Node)) {
        setBranchDropdownOpen(false);
      }
    }
    if (branchDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [branchDropdownOpen]);

  const {
    currentUser,
    selectedInstitute,
    selectedBranch,
    institutes,
    branches,
    isRootAdmin,
    isBranchManager,
    setInstituteId,
    setBranchId,
    logout,
  } = useTenant();

  const handleInstituteChange = (instId: string) => {
    setInstituteId(instId);
    const inst = institutes.find((i) => i.id === instId);
    if (inst) {
      toast.info(`Switched institute context to ${inst.name}`, { title: "Institution Changed" });
    }
  };

  const handleBranchChange = (branchId: string) => {
    setBranchId(branchId);
    const b = branches.find((item) => item.id === branchId);
    if (b) {
      toast.info(`Switched operational branch to ${b.name} (${b.city})`, { title: "Branch Changed" });
    }
  };

  const handleLogout = () => {
    logout();
  };

  // Determine canonical 1:1 breadcrumb trail matching sidebar groups
  const getDefaultTrail = () => {
    if (pathname === "/overview") {
      return { group: "Workspace", segments: [{ label: "Admin Overview" }] };
    }
    if (pathname.startsWith("/admin/tenancy")) {
      return { group: "Workspace", segments: [{ label: "Institutes & Branches" }] };
    }
    if (pathname.startsWith("/branch/batches")) {
      return { group: "Academic Operations", segments: [{ label: "Batches & Roster" }] };
    }
    if (pathname.startsWith("/batches")) {
      return {
        group: "Academic Operations",
        segments: [
          { label: "Batches & Roster", href: "/branch/batches" },
          { label: "Batch Roster" },
        ],
      };
    }
    if (pathname.startsWith("/exams")) {
      if (pathname.includes("/new")) {
        return {
          group: "Academic Operations",
          segments: [
            { label: "Exams & Rubrics", href: "/exams" },
            { label: "New Exam Setup" },
          ],
        };
      }
      return { group: "Academic Operations", segments: [{ label: "Exams & Rubrics" }] };
    }
    if (pathname.startsWith("/marks")) {
      return { group: "Academic Operations", segments: [{ label: "Marks & Inspection" }] };
    }
    if (pathname.startsWith("/revaluation")) {
      return { group: "Academic Operations", segments: [{ label: "Revaluation Desk" }] };
    }
    if (pathname.startsWith("/analytics")) {
      return { group: "Intelligence & Quota", segments: [{ label: "Telemetry & Quota" }] };
    }
    if (pathname.startsWith("/student/portal")) {
      return { group: "Student Preview", segments: [{ label: "Student Portal" }] };
    }
    return { group: "Workspace", segments: [{ label: "PaperGrade AI" }] };
  };

  const activeTrail = trail || getDefaultTrail();
  const lastSegment = activeTrail.segments[activeTrail.segments.length - 1];

  return (
    <header className="sticky top-0 z-20 w-full border-b border-hairline bg-surface/90 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-3 sm:px-6 gap-2">
        {/* Left: Mobile hamburger & Unified Canonical Breadcrumbs */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="md:hidden p-1.5 -ml-0.5 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors shrink-0 cursor-pointer"
            aria-label="Open Sidebar Menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Unified Navigation Trail (Desktop sm+) */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs truncate">
            <span className="text-ink-muted font-medium shrink-0">
              {activeTrail.group}
            </span>
            {activeTrail.segments.map((seg, idx) => {
              const isLast = idx === activeTrail.segments.length - 1;
              return (
                <React.Fragment key={idx}>
                  <ChevronRight className="h-3 w-3 text-ink-faint shrink-0" />
                  {seg.href && !isLast ? (
                    <Link
                      href={seg.href}
                      title={seg.label}
                      className="text-ink-secondary hover:text-ink hover:underline font-medium truncate max-w-[140px] sm:max-w-[220px] md:max-w-[340px] lg:max-w-[480px]"
                    >
                      {seg.label}
                    </Link>
                  ) : (
                    <span
                      title={seg.label}
                      className={`truncate max-w-[180px] sm:max-w-[280px] md:max-w-[420px] lg:max-w-[650px] ${
                        isLast ? "font-bold text-ink" : "text-ink-secondary font-medium"
                      }`}
                    >
                      {seg.label}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Center: Custom Responsive Multi-Tenant Scope Dropdown */}
        <div ref={branchDropdownRef} className="relative shrink min-w-0">
          <button
            type="button"
            onClick={() => setBranchDropdownOpen((prev) => !prev)}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-md bg-canvas-soft hover:bg-surface border border-hairline hover:border-hairline/80 text-xs shadow-2xs transition-all cursor-pointer max-w-[170px] xs:max-w-[210px] sm:max-w-[280px]"
            title="Click to switch active branch context"
          >
            <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="font-bold text-ink truncate text-xs">
              {mounted ? (selectedBranch?.name || selectedInstitute?.name || "Select Branch") : "PaperGrade"}
            </span>
            <ChevronDown
              className={`h-3 w-3 text-ink-muted shrink-0 transition-transform duration-150 ${
                branchDropdownOpen ? "rotate-180 text-primary" : ""
              }`}
            />
          </button>

          {/* Styled Notion Floating Dropdown Menu */}
          {branchDropdownOpen && mounted && (
            <div className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-0 w-64 sm:w-72 bg-surface rounded-lg border border-hairline shadow-notion-modal p-2 z-50 animate-in fade-in zoom-in-95">
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted flex items-center justify-between border-b border-hairline/60 pb-1.5 mb-1">
                <span>Operational Branch</span>
                {isRootAdmin && <span className="text-[10px] text-primary font-semibold lowercase">root admin</span>}
              </div>

              {isRootAdmin && institutes.length > 1 && (
                <div className="mb-2 px-1">
                  <label className="text-[10px] font-semibold text-ink-muted block mb-1">Coaching Institute:</label>
                  <select
                    value={selectedInstitute?.id || ""}
                    onChange={(e) => handleInstituteChange(e.target.value)}
                    className="w-full text-xs font-semibold text-ink bg-canvas-soft border border-hairline rounded p-1.5 focus:outline-none"
                  >
                    {institutes.map((inst) => (
                      <option key={inst.id} value={inst.id}>{inst.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="max-h-52 overflow-y-auto space-y-0.5">
                {branches.length === 0 ? (
                  <p className="text-xs text-ink-muted p-2 text-center">No branches found</p>
                ) : (
                  branches.map((b) => {
                    const isSelected = b.id === selectedBranch?.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          handleBranchChange(b.id);
                          setBranchDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs transition-colors cursor-pointer text-left ${
                          isSelected
                            ? "bg-primary/10 text-primary font-bold"
                            : "text-ink hover:bg-canvas-soft font-medium"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="truncate font-semibold">{b.name}</p>
                          {b.city && <p className="text-[10px] text-ink-muted truncate">{b.city}</p>}
                        </div>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: DB Status + Notification Bell + Profile */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Supabase Status Pill */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium mr-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Supabase PostgreSQL • Online</span>
          </div>

          {/* Technical Support / Bug Report Button (Only for Branch Managers and Staff, not Root Admin) */}
          {!isRootAdmin && (
            <button
              type="button"
              onClick={() => setReportModalOpen(true)}
              className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary hover:text-ink hover:bg-canvas-soft transition-colors shrink-0 cursor-pointer"
              title="Report Technical Issue"
              aria-label="Report Technical Issue"
            >
              <LifeBuoy className="h-4 w-4" />
            </button>
          )}

          {/* Notification Bell Button (Triggers Right Sidebar Drawer) */}
          <button
            type="button"
            onClick={openDrawer}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary hover:text-ink hover:bg-canvas-soft transition-colors shrink-0"
            title="Open Notifications Sidebar"
            aria-label="Open Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white shadow-xs ring-2 ring-surface animate-in zoom-in-50 leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Role Pill & User Name */}
          {mounted && currentUser && (
            <div suppressHydrationWarning className="hidden sm:flex items-center gap-2 pl-2 border-l border-hairline">
              <BadgePill
                label={currentUser.role === "ROOT_ADMIN" ? "Admin" : "Branch Mgr"}
                color={currentUser.role === "ROOT_ADMIN" ? "purple" : "teal"}
              />
              <span className="text-xs font-semibold text-ink truncate max-w-[130px]">
                {currentUser.full_name}
              </span>
            </div>
          )}

          {/* Quick Sign Out Button (always accessible in mobile & desktop headers) */}
          {mounted && currentUser && (
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
              title="Sign Out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Technical Support & Issue Report Modal */}
      <ReportIssueModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        userRole={currentUser?.role}
      />
    </header>
  );
}
