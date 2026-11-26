"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  Bell,
  ChevronRight,
} from "lucide-react";
import { useNotifications } from "@/lib/NotificationContext";
import { useTenant } from "@/lib/TenantContext";
import { useBreadcrumbs } from "@/lib/BreadcrumbContext";
import { TenancySwitchDropdown } from "./tenancy/TenancySwitchDropdown";

interface AdminHeaderProps {
  onOpenMobileSidebar: () => void;
}

export function AdminHeader({ onOpenMobileSidebar }: AdminHeaderProps) {
  const pathname = usePathname();
  const { unreadCount, openDrawer } = useNotifications();
  const { trail } = useBreadcrumbs();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { currentUser } = useTenant();

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
    if (pathname.startsWith("/settings")) {
      return { group: "Account", segments: [{ label: "Profile & Settings" }] };
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

        {/* Right: Notification Bell + User Profile Avatar ONLY */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Notification Bell Button (Triggers Right Sidebar Drawer) */}
          <button
            type="button"
            onClick={openDrawer}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary hover:text-ink hover:bg-canvas-soft transition-colors shrink-0 cursor-pointer"
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

          {/* User Avatar Button (Navigates to Profile & Account Settings Page) */}
          {mounted && currentUser && (
            <Link
              href="/settings"
              className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-canvas-soft hover:bg-canvas text-ink hover:ring-2 hover:ring-primary/40 transition-all shrink-0 cursor-pointer overflow-hidden shadow-2xs"
              title="Account & Settings"
              aria-label="Open account settings"
            >
              {currentUser.google_picture ? (
                <img
                  src={currentUser.google_picture}
                  alt={currentUser.full_name || "User Avatar"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs font-bold uppercase text-ink select-none">
                  {currentUser.full_name ? currentUser.full_name.charAt(0) : "U"}
                </span>
              )}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
