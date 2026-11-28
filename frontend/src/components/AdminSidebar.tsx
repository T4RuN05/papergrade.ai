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
  KeyRound,
  LogOut,
  Loader2,
} from "lucide-react";
import { api, getAuthToken, setStoredUser } from "@/lib/api";
import { Skeleton } from "./ui";
import { ThemeToggle } from "@/lib/ThemeContext";
import { useTenant } from "@/lib/TenantContext";
import { useToast, queueToast } from "@/lib/ToastContext";
import { useSlideDrawer } from "@/hooks/useSlideDrawer";
import { ChangePasswordModal } from "./ChangePasswordModal";

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
  const { currentUser, isRootAdmin, isInstituteDirector, isBranchManager, selectedBranch, logout, refreshTenancy } = useTenant();
  const [mounted, setMounted] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { isRendered: drawerRendered, isVisible: drawerVisible } = useSlideDrawer(mobileOpen, 300);

  const handleLogout = () => {
    if (signingOut) return;
    setSigningOut(true);
    logout();
  };

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
              <div className="flex items-center justify-between rounded-md px-2.5 py-2 bg-canvas-soft border border-hairline">
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
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface border border-hairline">
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
          <div className="flex items-center md:hidden">
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
                      className={`group flex items-center justify-between rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-canvas-soft text-ink font-semibold border border-hairline"
                          : "text-ink-secondary hover:text-ink hover:bg-canvas-soft/70 border border-transparent"
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


      {/* Bottom Drawer Utilities (Zero duplicate account block — Profile Avatar sits in AdminHeader) */}
      <div className="p-3 border-t border-hairline bg-canvas-soft/50 shrink-0 space-y-2">
        {/* Quick Report Issue Action (Only for Branch Managers and Staff, not Root Admin) */}
        {!isRootAdmin && (
          <button
            type="button"
            onClick={() => setReportModalOpen(true)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-ink-secondary hover:text-ink hover:bg-surface border border-hairline transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>Report Technical Issue</span>
            </span>
            <span className="text-[10px] text-primary font-semibold">Help</span>
          </button>
        )}

        {/* Initial Password Setup (Moved out of Header into Drawer) */}
        {currentUser && currentUser.role !== "STUDENT" && currentUser.role !== "ROOT_ADMIN" && !currentUser.has_changed_password && (
          <button
            type="button"
            onClick={() => setChangePasswordOpen(true)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-ink-secondary hover:text-ink hover:bg-surface border border-hairline transition-colors cursor-pointer"
          >
            <KeyRound className="h-3.5 w-3.5 text-ink-muted shrink-0" />
            <span>One-Time Password Setup</span>
          </button>
        )}

        {/* Visual Theme + Public Link */}
        <div className="flex items-center justify-between px-1.5 py-1 text-[11px] text-ink-muted">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-ink-muted hover:text-primary transition-colors"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Public Site</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle size="sm" />
            <span className="text-[10px] text-ink-faint">v2.4</span>
          </div>
        </div>

        {/* Sign Out with Loading State */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-md notion-btn-danger text-xs font-medium transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
        >
          {signingOut ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LogOut className="h-3.5 w-3.5" />
          )}
          <span>{signingOut ? "Signing Out..." : "Sign Out"}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Left Sidebar */}
      <aside className="hidden md:flex flex-col w-60 h-screen sticky top-0 shrink-0 z-30">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar with synchronized slide-in/slide-out & scrim fade */}
      {drawerRendered && (
        <div
          className="fixed inset-0 z-[60] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Sidebar"
        >
          <div
            className={`fixed inset-0 bg-black/40 transition-opacity duration-300 ease-in-out ${
              drawerVisible ? "opacity-100" : "opacity-0"
            }`}
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside
            className={`fixed inset-y-0 left-0 w-64 max-w-[80vw] h-full h-[100dvh] bg-surface shadow-notion-modal border-r border-hairline transition-transform duration-300 ease-in-out will-change-transform ${
              drawerVisible ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* One-Time Password Setup Modal */}
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
    </>
  );
}
