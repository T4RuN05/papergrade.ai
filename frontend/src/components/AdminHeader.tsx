"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  Bell,
  Sparkles,
  Database,
  ChevronRight,
  ExternalLink,
  Building2,
  Layers,
  LogOut,
} from "lucide-react";
import { api, getAuthToken } from "@/lib/api";
import { BadgePill } from "./ui";
import { useNotifications } from "@/lib/NotificationContext";
import { useTenant } from "@/lib/TenantContext";
import { useBreadcrumbs } from "@/lib/BreadcrumbContext";
import { useToast, queueToast } from "@/lib/ToastContext";

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

  useEffect(() => {
    setMounted(true);
  }, []);

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
    refreshTenancy,
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

  const handleLogout = async () => {
    api.logout();
    if (typeof window !== "undefined") {
      localStorage.removeItem("papergrade_selected_institute_id");
      localStorage.removeItem("papergrade_selected_branch_id");
    }
    toast.success("You have securely signed out of PaperGrade AI.", { title: "Logged Out" });
    await refreshTenancy();
    router.push("/auth/login");
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
            className="md:hidden p-1.5 -ml-0.5 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors shrink-0"
            aria-label="Open Sidebar Menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Mobile Page Title (< sm) */}
          <span className="sm:hidden font-bold text-ink text-xs xs:text-sm truncate max-w-[110px] xs:max-w-[140px]">
            {lastSegment?.label || "PaperGrade"}
          </span>

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
                      className="text-ink-secondary hover:text-ink hover:underline font-medium truncate max-w-[140px] sm:max-w-[200px]"
                    >
                      {seg.label}
                    </Link>
                  ) : (
                    <span
                      className={`truncate max-w-[160px] sm:max-w-[260px] ${
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

        {/* Center: Persistent Multi-Tenant Scope Pill (Responsive) */}
        <div
          suppressHydrationWarning
          className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 rounded-md bg-canvas-soft border border-hairline text-xs shadow-2xs shrink min-w-0"
        >
          <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
          {mounted && isRootAdmin ? (
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
              {/* Institute Selector - hidden on mobile, visible on sm+ */}
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                <select
                  value={selectedInstitute?.id || ""}
                  onChange={(e) => handleInstituteChange(e.target.value)}
                  className="bg-transparent font-medium text-ink focus:outline-none cursor-pointer hover:text-primary transition-colors text-xs max-w-[110px] md:max-w-[140px] truncate"
                  title="Active Institute Scope"
                >
                  {institutes.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
                    </option>
                  ))}
                </select>
                <span className="text-ink-muted">/</span>
              </div>

              {/* Branch Selector */}
              <select
                value={selectedBranch?.id || ""}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="bg-transparent font-bold text-ink focus:outline-none cursor-pointer hover:text-primary transition-colors text-xs max-w-[85px] xs:max-w-[110px] sm:max-w-[160px] truncate"
                title="Active Branch Scope"
              >
                {branches.length === 0 ? (
                  <option value="">No Branches</option>
                ) : (
                  branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          ) : mounted && isBranchManager ? (
            <div className="flex items-center gap-1 sm:gap-1.5 font-semibold text-ink text-xs min-w-0 truncate">
              <span className="hidden sm:inline font-bold text-ink truncate max-w-[100px]">
                {selectedInstitute?.name || "Institute"}
              </span>
              <span className="hidden sm:inline text-ink-muted">/</span>
              <span className="text-primary font-bold truncate max-w-[85px] xs:max-w-[110px] sm:max-w-none">
                {selectedBranch?.name || "Branch"}
              </span>
              {selectedBranch?.city && (
                <span className="hidden md:inline text-ink-muted font-normal">({selectedBranch.city})</span>
              )}
            </div>
          ) : (
            <span className="text-ink-muted text-xs truncate max-w-[80px] sm:max-w-none">PaperGrade</span>
          )}
        </div>

        {/* Right: DB Status + Notification Bell + Profile */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Supabase Status Pill */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium mr-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Supabase PostgreSQL • Online</span>
          </div>

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
    </header>
  );
}
