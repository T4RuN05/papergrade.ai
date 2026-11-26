"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Layers,
  Building2,
  Users,
  GraduationCap,
  RotateCcw,
  BarChart3,
  Clock,
  Sparkles,
  Home,
  ShieldAlert,
  ChevronRight,
  ExternalLink,
  X,
  FileSpreadsheet,
  LifeBuoy,
  AlertTriangle,
  BookOpen,
  Settings,
} from "lucide-react";
import { api, getAuthToken } from "@/lib/api";
import { Skeleton } from "./ui";
import { ThemeToggle } from "@/lib/ThemeContext";
import { useTenant } from "@/lib/TenantContext";
import { useToast, queueToast } from "@/lib/ToastContext";

const ReportIssueModal = dynamic(
  () => import("./ReportIssueModal").then((mod) => mod.ReportIssueModal),
  { ssr: false }
);

interface AdminSidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function AdminSidebar({ mobileOpen = false, onCloseMobile }: AdminSidebarProps) {
  const pathname = usePathname();
  const { toast } = useToast();
  const { currentUser, isRootAdmin, isInstituteDirector, isBranchManager, selectedBranch } = useTenant();
  const [mounted, setMounted] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const navigationGroups = [
    {
      group: "WORKSPACE",
      items: [
        {
          href: "/overview",
          label: "Admin Overview",
          icon: Layers,
          badge: null,
          show: isRootAdmin,
        },
        {
          href: "/admin/tenancy",
          label: "Institutes & Branches",
          icon: Building2,
          badge: "Root",
          show: isRootAdmin,
        },
        {
          href: "/admin/reports",
          label: "Issue Reports",
          icon: LifeBuoy,
          badge: "Support",
          show: isRootAdmin,
        },
      ],
    },
    {
      group: "ACADEMIC OPERATIONS",
      items: [
        {
          href: "/branch/batches",
          label: "Batches & Roster",
          icon: Users,
          badge: null,
          show: isBranchManager || isInstituteDirector || isRootAdmin,
        },
        {
          href: "/exams",
          label: "Exams & Rubrics",
          icon: GraduationCap,
          badge: null,
          show: isBranchManager || isInstituteDirector || isRootAdmin,
        },
        {
          href: "/marks",
          label: "Marks & Inspection",
          icon: FileSpreadsheet,
          badge: null,
          show: isBranchManager || isInstituteDirector || isRootAdmin,
        },
        {
          href: "/revaluation",
          label: "Revaluation Desk",
          icon: RotateCcw,
          badge: null,
          show: isBranchManager || isInstituteDirector || isRootAdmin,
        },
      ],
    },
    {
      group: "INTELLIGENCE & QUOTA",
      items: [
        {
          href: "/analytics",
          label: "Telemetry & Quota",
          icon: BarChart3,
          badge: "AI",
          show: isRootAdmin,
        },
      ],
    },
    {
      group: "STUDENT PREVIEW",
      items: [
        {
          href: "/student/portal",
          label: "Student Portal",
          icon: Clock,
          badge: "PWA",
          show: isRootAdmin,
        },
      ],
    },
    {
      group: "SUPPORT & MANUALS",
      items: [
        {
          href: "/help",
          label: "User Manual & Guides",
          icon: BookOpen,
          badge: null,
          show: true,
        },
      ],
    },
  ];

  if (!mounted) {
    return (
      <aside className="hidden md:flex flex-col w-60 h-screen sticky top-0 shrink-0 z-30 bg-surface text-ink border-r border-hairline select-none">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-hairline shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-7 w-7 items-center justify-center rounded-md overflow-hidden shrink-0">
              <Image
                src="/logo-icon.png"
                alt="PaperGrade AI"
                width={28}
                height={28}
                className="h-7 w-7 object-contain"
                priority
              />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold tracking-tight text-ink">
                PaperGrade <span className="text-primary font-semibold">AI</span>
              </span>
              <span className="text-[10px] text-ink-faint">Root Enterprise Desk</span>
            </div>
          </div>
        </div>

        {/* Navigation Groupings Skeleton (Matching real item alignment 1:1) */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Workspace */}
          <div className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
              WORKSPACE
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between rounded-md px-2.5 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Skeleton className="h-4 w-4 shrink-0" rounded="xs" />
                  <Skeleton className="h-3 w-24" rounded="xs" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md px-2.5 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Skeleton className="h-4 w-4 shrink-0" rounded="xs" />
                  <Skeleton className="h-3 w-32" rounded="xs" />
                </div>
                <Skeleton className="h-4 w-7 shrink-0" rounded="xs" />
              </div>
            </div>
          </div>

          {/* Academic Operations */}
          <div className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
              ACADEMIC OPERATIONS
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between rounded-md px-2.5 py-2 bg-canvas-soft/80 border border-hairline/80 shadow-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Skeleton className="h-4 w-4 shrink-0 bg-primary/20" rounded="xs" />
                  <Skeleton className="h-3 w-28" rounded="xs" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md px-2.5 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Skeleton className="h-4 w-4 shrink-0" rounded="xs" />
                  <Skeleton className="h-3 w-24" rounded="xs" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md px-2.5 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Skeleton className="h-4 w-4 shrink-0" rounded="xs" />
                  <Skeleton className="h-3 w-30" rounded="xs" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md px-2.5 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Skeleton className="h-4 w-4 shrink-0" rounded="xs" />
                  <Skeleton className="h-3 w-28" rounded="xs" />
                </div>
              </div>
            </div>
          </div>

          {/* Intelligence & Quota */}
          <div className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
              INTELLIGENCE & QUOTA
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between rounded-md px-2.5 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Skeleton className="h-4 w-4 shrink-0" rounded="xs" />
                  <Skeleton className="h-3 w-28" rounded="xs" />
                </div>
                <Skeleton className="h-4 w-6 shrink-0" rounded="xs" />
              </div>
            </div>
          </div>

          {/* Student Preview */}
          <div className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
              STUDENT PREVIEW
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between rounded-md px-2.5 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Skeleton className="h-4 w-4 shrink-0" rounded="xs" />
                  <Skeleton className="h-3 w-24" rounded="xs" />
                </div>
                <Skeleton className="h-4 w-8 shrink-0" rounded="xs" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom User Profile Section */}
        <div className="p-3 border-t border-hairline bg-canvas-soft/50 shrink-0">
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface border border-hairline shadow-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Skeleton className="h-7 w-7 rounded-full shrink-0" />
              <div className="flex flex-col min-w-0 space-y-1">
                <Skeleton className="h-3 w-28" rounded="xs" />
                <Skeleton className="h-2.5 w-16" rounded="xs" />
              </div>
            </div>
            <Skeleton className="h-6 w-6 rounded-md shrink-0" />
          </div>

          {/* Quick link to public landing page */}
          <div className="mt-2 flex items-center justify-between px-1 text-[11px]">
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-3 w-3 rounded-xs" />
              <Skeleton className="h-2.5 w-16 rounded-xs" />
            </div>
            <Skeleton className="h-2.5 w-12 rounded-xs" />
          </div>
        </div>
      </aside>
    );
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-surface text-ink border-r border-hairline select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-5 h-14 border-b border-hairline shrink-0">
        <Link href={isRootAdmin ? "/overview" : "/branch/batches"} className="flex items-center gap-2.5">
          <div className="relative flex h-7 w-7 items-center justify-center rounded-md overflow-hidden shrink-0">
            <Image
              src="/logo-icon.png"
              alt="PaperGrade AI"
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
              priority
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold tracking-tight text-ink">
                PaperGrade <span className="text-primary font-semibold">AI</span>
              </span>
            </div>
            <span
              suppressHydrationWarning
              className="text-[10px] text-ink-faint truncate max-w-[130px]"
            >
              {currentUser?.role === "ROOT_ADMIN"
                ? "Root Enterprise Desk"
                : currentUser?.role === "INSTITUTE_DIRECTOR"
                ? `${selectedBranch?.name ? selectedBranch.name + " • " : ""}Director Console`
                : selectedBranch?.name
                ? `${selectedBranch.name} Console`
                : "Branch Console"}
            </span>
          </div>
        </Link>

        {/* Mobile controls */}
        {onCloseMobile && (
          <div className="flex items-center gap-1.5 md:hidden">
            <Link
              href="/settings"
              onClick={onCloseMobile}
              className="relative inline-flex h-7 w-7 items-center justify-center rounded-full border border-hairline bg-canvas-soft hover:bg-canvas text-ink overflow-hidden shrink-0"
              title="Account & Settings"
              aria-label="Account & Settings"
            >
              {currentUser?.google_picture ? (
                <img
                  src={currentUser.google_picture}
                  alt={currentUser?.full_name || "Avatar"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[11px] font-bold uppercase text-ink select-none">
                  {currentUser?.full_name ? currentUser.full_name.charAt(0) : "U"}
                </span>
              )}
            </Link>
            <button
              onClick={onCloseMobile}
              className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Navigation Groupings */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navigationGroups.map((group) => {
          const visibleItems = group.items.filter((item) => item.show);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.group} className="space-y-1">
              <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
                {group.group}
              </div>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === "/overview"
                      ? pathname === "/overview"
                      : pathname.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => onCloseMobile?.()}
                      className={`group flex items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-all ${
                        isActive
                          ? "bg-canvas-soft text-ink font-semibold shadow-xs border border-hairline/80"
                          : "text-ink-secondary hover:text-ink hover:bg-canvas-soft/70"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            isActive ? "text-primary" : "text-ink-muted group-hover:text-ink"
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>

                      {item.badge && (
                        <span className="text-[9px] font-medium text-ink-muted bg-canvas-soft px-1.5 py-0.5 rounded-xs border border-hairline">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>


      {/* Bottom User Profile Section */}
      <div className="p-3 border-t border-hairline bg-canvas-soft/50 shrink-0">
        {/* Quick Report Issue Action (Only for Branch Managers and Staff, not Root Admin) */}
        {!isRootAdmin && (
          <button
            type="button"
            onClick={() => setReportModalOpen(true)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-semibold text-ink-secondary hover:text-ink hover:bg-surface border border-hairline transition-colors cursor-pointer mb-2.5 shadow-2xs"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Report Technical Issue</span>
            </span>
            <span className="text-[10px] text-primary font-bold">Help</span>
          </button>
        )}

        <Link
          href="/settings"
          onClick={() => onCloseMobile?.()}
          className="group flex items-center justify-between gap-2 p-2 rounded-lg bg-surface border border-hairline hover:border-primary/40 hover:bg-canvas-soft/60 shadow-xs transition-all cursor-pointer"
          title="Open Account & Profile Settings"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-hairline bg-primary/10 text-primary font-bold text-xs overflow-hidden">
              {currentUser?.google_picture ? (
                <img
                  src={currentUser.google_picture}
                  alt={currentUser?.full_name || "User Avatar"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>
                  {currentUser?.full_name ? currentUser.full_name.charAt(0).toUpperCase() : "A"}
                </span>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span suppressHydrationWarning className="text-xs font-bold text-ink truncate group-hover:text-primary transition-colors">
                {currentUser?.full_name || "Administrator"}
              </span>
              <span suppressHydrationWarning className="text-[10px] text-ink-muted truncate">
                {currentUser?.role === "ROOT_ADMIN"
                  ? "Root Admin"
                  : currentUser?.role === "INSTITUTE_DIRECTOR"
                  ? "Institute Director"
                  : currentUser?.role === "BRANCH_MANAGER"
                  ? "Branch Mgr"
                  : "Staff"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 text-ink-muted group-hover:text-primary transition-colors pr-0.5">
            <Settings className="h-3.5 w-3.5" />
          </div>
        </Link>

        {/* Quick link to public landing page & theme toggle */}
        <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-ink-muted">
          <Link
            href="/"
            className="flex items-center gap-1 text-ink-muted hover:text-primary transition-colors"
          >
            <Home className="h-3 w-3" />
            <span>Public Site</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle size="sm" />
            <span className="text-[10px] text-ink-faint">v2.4</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Left Sidebar */}
      <aside className="hidden md:flex flex-col w-60 h-screen sticky top-0 shrink-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar with Tailwind slide animation */}
      <div
        className={`fixed inset-0 z-[60] md:hidden transition-all duration-300 ease-in-out ${
          mobileOpen ? "visible pointer-events-auto" : "invisible pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
      >
        {/* Scrim — mounted only while open so an invisible backdrop-filter
            layer never lingers over the page. */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300 ease-in-out opacity-100"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
        )}
        <div
          className={`fixed inset-y-0 left-0 w-64 max-w-[80vw] h-full h-[100dvh] bg-surface shadow-2xl transition-transform duration-300 ease-in-out transform ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebarContent}
        </div>
      </div>

      {/* Technical Support & Issue Report Modal */}
      <ReportIssueModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        userRole={currentUser?.role}
      />
    </>
  );
}
