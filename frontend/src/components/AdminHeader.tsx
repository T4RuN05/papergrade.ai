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
  ExternalLink,
  Layers,
  LogOut,
  LifeBuoy,
  KeyRound,
} from "lucide-react";
import { api, getAuthToken, getStoredUser, setStoredUser } from "@/lib/api";
import { BadgePill } from "./ui";
import { ThemeToggle } from "@/lib/ThemeContext";
import { useNotifications } from "@/lib/NotificationContext";
import { useTenant } from "@/lib/TenantContext";
import { useBreadcrumbs } from "@/lib/BreadcrumbContext";
import { useToast, queueToast } from "@/lib/ToastContext";
import { ReportIssueModal } from "./ReportIssueModal";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { TenancySwitchDropdown } from "./tenancy/TenancySwitchDropdown";

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
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    currentUser,
    isRootAdmin,
    logout,
    refreshTenancy,
  } = useTenant();

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
    if (pathname.startsWith("/student/revaluation")) {
      return { group: "Student", segments: [{ label: "Revaluation Appeals" }] };
    }
    if (pathname.startsWith("/student/portal")) {
      return { group: "Student Preview", segments: [{ label: "Student Portal" }] };
    }
    return { group: "Workspace", segments: [{ label: "PaperGrade AI" }] };
  };

  const activeTrail = trail || getDefaultTrail();
  const lastSegment = activeTrail.segments[activeTrail.segments.length - 1];

  // Solid (non-blurred) surface on touch/small screens — see the Mobile GPU
  // Rasterization Guard in globals.css for why backdrop blur is banned there.
  return (
    <header className="sticky top-0 z-50 w-full border-b border-hairline bg-surface lg:bg-surface/90 lg:backdrop-blur-md">
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
                      className={`truncate max-w-[180px] sm:max-w-[280px] md:max-w-[420px] lg:max-w-[650px] ${isLast ? "font-bold text-ink" : "text-ink-secondary font-medium"
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

        {/* Center: Custom Responsive Multi-Tenant Scope Dropdown with Apple-style Fluid Popover */}
        <TenancySwitchDropdown />

        {/* Right: Notification Bell + Profile */}
        <div className="flex items-center gap-1 sm:gap-2">

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

          {/* Theme Toggle (Light/Dark Mode) */}
          <ThemeToggle />

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
                label={
                  currentUser.role === "ROOT_ADMIN"
                    ? "Admin"
                    : currentUser.role === "INSTITUTE_DIRECTOR"
                      ? "Director"
                      : currentUser.role === "BRANCH_MANAGER"
                        ? "Branch Mgr"
                        : "Staff"
                }
                color={
                  currentUser.role === "ROOT_ADMIN"
                    ? "purple"
                    : currentUser.role === "INSTITUTE_DIRECTOR"
                      ? "indigo"
                      : currentUser.role === "BRANCH_MANAGER"
                        ? "teal"
                        : "gray"
                }
              />
              <span className="text-xs font-semibold text-ink truncate max-w-[130px]">
                {currentUser.full_name}
              </span>
            </div>
          )}

          {/* Change Password Button (One-time initial password change only) */}
          {mounted && currentUser && currentUser.role !== "STUDENT" && currentUser.role !== "ROOT_ADMIN" && !currentUser.has_changed_password && (
            <button
              type="button"
              onClick={() => setChangePasswordOpen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors shrink-0"
              title="One-Time Initial Password Change"
              aria-label="One-Time Initial Password Change"
            >
              <KeyRound className="h-4 w-4" />
            </button>
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

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        onSuccess={() => {
          try {
            const updated = currentUser ? { ...currentUser, has_changed_password: 1 } : null;
            if (updated) {
              setStoredUser(updated);
              refreshTenancy(updated);
            }
          } catch {}
        }}
        userEmail={currentUser?.email}
      />

      {/* Technical Support & Issue Report Modal */}
      <ReportIssueModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        userRole={currentUser?.role}
      />
    </header>
  );
}
