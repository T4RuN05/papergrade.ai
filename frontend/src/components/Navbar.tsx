"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Sparkles,
  Menu,
  X,
  Bell,
  LogOut,
  Clock,
  Layers,
  ArrowRight,
  BookOpen,
  Home,
  ChevronRight,
  KeyRound,
  RotateCcw,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { getAuthToken, setStoredUser } from "@/lib/api";
import { ThemeToggle } from "@/lib/ThemeContext";
import { useNotifications } from "@/lib/NotificationContext";
import { useTenant } from "@/lib/TenantContext";
import { ChangePasswordModal } from "./ChangePasswordModal";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { unreadCount, openDrawer } = useNotifications();
  const { currentUser, isMounted, loading: tenantLoading, refreshTenancy, logout } = useTenant();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [activeStudentTab, setActiveStudentTab] = useState<"dashboard" | "exams">("dashboard");
  const hasToken = isMounted && Boolean(currentUser || getAuthToken() || tenantLoading);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isExams = window.location.search.includes("tab=exams") || pathname === "/student/exams";
      setActiveStudentTab(isExams ? "exams" : "dashboard");
    }
    const handlePortalTabSync = (e: Event) => {
      const ce = e as CustomEvent<"dashboard" | "exams">;
      if (ce.detail) {
        setActiveStudentTab(ce.detail);
      }
    };
    window.addEventListener("papergrade:tab-changed", handlePortalTabSync);
    return () => window.removeEventListener("papergrade:tab-changed", handlePortalTabSync);
  }, [pathname]);

  const isPastExamsTab =
    isMounted &&
    pathname.startsWith("/student") &&
    (pathname === "/student/exams" || (pathname === "/student/portal" && activeStudentTab === "exams"));
  const isPortalTab = isMounted && pathname === "/student/portal" && activeStudentTab === "dashboard";
  const isRevalTab = isMounted && pathname === "/student/revaluation";

  const handleStudentNavClick = (tab: "dashboard" | "exams", e: React.MouseEvent) => {
    setMobileMenuOpen(false);
    if (pathname === "/student/portal") {
      e.preventDefault();
      setActiveStudentTab(tab);
      const newUrl = tab === "exams" ? "/student/portal?tab=exams" : "/student/portal";
      window.history.pushState(null, "", newUrl);
      window.dispatchEvent(new CustomEvent("papergrade:switch-tab", { detail: tab }));
    } else {
      setActiveStudentTab(tab);
      router.push(tab === "exams" ? "/student/portal?tab=exams" : "/student/portal");
    }
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is active to prevent awkward background scrolling
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // Close on Escape key press
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    if (signingOut) return;
    setSigningOut(true);
    logout();
  };

  const isStudent = isMounted && currentUser?.role === "STUDENT";
  const isAdminUser = isMounted && (currentUser?.role === "ROOT_ADMIN" || currentUser?.role === "INSTITUTE_DIRECTOR" || currentUser?.role === "BRANCH_MANAGER");
  const isMarketingPage = pathname === "/" || pathname === "/about";

  const handleOpenContact = () => {
    setMobileMenuOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("papergrade:open-pilot"));
    }
  };

  return (
    <header
      className="sticky top-0 z-50 w-full border-b border-hairline bg-surface transition-colors"
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8 gap-4">
        {/* Brand & Navigation Drawer Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft active:bg-canvas-soft transition-colors cursor-pointer ${
              isMarketingPage ? "md:hidden" : ""
            }`}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
          >
            <span className="relative block h-5 w-5">
              <span
                className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  mobileMenuOpen ? "opacity-100 rotate-90 scale-100" : "opacity-0 -rotate-90 scale-75"
                }`}
              >
                <X className="h-5 w-5" />
              </span>
              <span
                className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  mobileMenuOpen ? "opacity-0 rotate-90 scale-75" : "opacity-100 rotate-0 scale-100"
                }`}
              >
                <Menu className="h-5 w-5" />
              </span>
            </span>
          </button>

          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2"
          >
            <div className="relative flex h-7 w-7 items-center justify-center rounded-md overflow-hidden shrink-0">
              <Image
                src="/logo-icon.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 object-contain"
                priority
              />
            </div>
            <div className="flex items-center">
              <span className="text-sm font-bold tracking-tight text-ink whitespace-nowrap">
                PaperGrade <span className="text-primary font-semibold">AI</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-medium text-ink-muted px-1.5 py-0.5 rounded-xs bg-canvas-soft border border-hairline">
                Pilot
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Public Landing Navigation Links (Restrained Horizontal Strip) */}
        {isMarketingPage && (
          <nav
            aria-label="Primary landing navigation"
            className="hidden md:flex items-center gap-5 lg:gap-7 text-xs font-medium text-ink-secondary"
          >
            <Link
              href="/#evaluation-cycle"
              className="hover:text-ink transition-colors whitespace-nowrap"
            >
              Workflow
            </Link>
            <Link
              href="/#institutes"
              className="hover:text-ink transition-colors whitespace-nowrap"
            >
              Institutes
            </Link>
            <Link
              href="/#pilot"
              className="hover:text-ink transition-colors whitespace-nowrap"
            >
              Pilot
            </Link>
            <Link
              href="/about"
              className={`hover:text-ink transition-colors whitespace-nowrap ${
                pathname === "/about" ? "text-ink font-semibold" : ""
              }`}
            >
              About
            </Link>
            <Link
              href="/help"
              className="hover:text-ink transition-colors whitespace-nowrap"
            >
              Manual
            </Link>
            <button
              type="button"
              onClick={handleOpenContact}
              className="hover:text-ink transition-colors whitespace-nowrap cursor-pointer"
            >
              Contact
            </button>
          </nav>
        )}

        {/* Minimal Header Right Desk: Bell + Profile Avatar (or Sign In when logged out) */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-h-[32px] shrink-0">
          {isMarketingPage && (!isMounted || !currentUser) && (
            <div className="hidden sm:flex items-center mr-1">
              <ThemeToggle size="sm" />
            </div>
          )}
          {isMounted && currentUser ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Notification Bell Button (Triggers Right Slide-Over Drawer) */}
              <button
                type="button"
                onClick={openDrawer}
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-canvas-soft transition-colors shrink-0 cursor-pointer"
                title="Notifications"
                aria-label="Open notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white ring-2 ring-surface animate-in zoom-in-50 leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {/* User Avatar Placeholder (Navigates to Profile & Account Settings Page) */}
              <Link
                href="/settings"
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-canvas-soft hover:bg-surface text-ink hover:border-primary transition-colors shrink-0 cursor-pointer overflow-hidden"
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
            </div>
          ) : !isMounted || hasToken ? (
            /* Subtle skeleton placeholder during initial mount or while verifying token: DO NOT flash Sign In */
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline animate-shimmer shrink-0" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/auth/login?role=claim"
                className="hidden sm:inline-flex items-center btn-glass-utility text-xs font-medium text-ink px-3 h-8 rounded-md transition-colors cursor-pointer"
              >
                Claim Student ID
              </Link>
              <Link
                href={
                  pathname.startsWith("/student")
                    ? "/auth/login?role=student"
                    : pathname.startsWith("/admin") ||
                      pathname.startsWith("/branch") ||
                      pathname.startsWith("/overview")
                    ? "/auth/login?role=staff"
                    : "/auth/login"
                }
                className="btn-glass-primary inline-flex items-center justify-center rounded-md px-3.5 h-8 text-xs font-medium transition-colors cursor-pointer"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* 
        ========================================================================
        MOBILE OVERLAY NAVIGATION DRAWER
        Positioned as an absolute overlay directly beneath the sticky header.
        Does NOT push the main content down, preventing layout shifts.
        Apple-style smooth spring slide and fade for both opening and closing.
        ========================================================================
      */}
      {/* Ambient Backdrop - Clicking closes the menu (only mounted while open) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 top-14 bg-black/30 z-50 transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] opacity-100 pointer-events-auto"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Navigation Drawer Panel (Works on mobile & desktop, zero redundant profile displays) */}
      <div
        className={`absolute top-full left-0 right-0 md:right-auto md:w-80 w-full border-b md:border-r border-hairline bg-surface shadow-notion-modal z-[55] max-h-[calc(100vh-3.5rem)] overflow-y-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] origin-top ${
          mobileMenuOpen
            ? "opacity-100 translate-y-0 scale-y-100 pointer-events-auto"
            : "opacity-0 -translate-y-2 scale-y-98 pointer-events-none"
        }`}
      >

            {/* Navigation Links */}
            {isMarketingPage && (!isMounted || !currentUser) ? (
              <nav className="p-3 space-y-1">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                    pathname === "/"
                      ? "bg-canvas-soft text-ink font-semibold"
                      : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Home className={`h-4 w-4 ${pathname === "/" ? "text-primary" : "text-ink-muted"}`} />
                    <span>Home</span>
                  </div>
                  {pathname === "/" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </Link>
                <Link
                  href="/#evaluation-cycle"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-ink-secondary hover:text-ink hover:bg-canvas-soft transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Layers className="h-4 w-4 text-ink-muted" />
                    <span>Workflow &amp; Evaluation</span>
                  </div>
                </Link>
                <Link
                  href="/#institutes"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-ink-secondary hover:text-ink hover:bg-canvas-soft transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Clock className="h-4 w-4 text-ink-muted" />
                    <span>For Coaching Institutes</span>
                  </div>
                </Link>
                <Link
                  href="/#pilot"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-ink-secondary hover:text-ink hover:bg-canvas-soft transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4 text-ink-muted" />
                    <span>Pilot Program</span>
                  </div>
                </Link>
                <Link
                  href="/about"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                    pathname === "/about"
                      ? "bg-canvas-soft text-ink font-semibold"
                      : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <BookOpen className={`h-4 w-4 ${pathname === "/about" ? "text-primary" : "text-ink-muted"}`} />
                    <span>About PaperGrade</span>
                  </div>
                  {pathname === "/about" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </Link>
                <Link
                  href="/help"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-ink-secondary hover:text-ink hover:bg-canvas-soft transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <HelpCircle className="h-4 w-4 text-ink-muted" />
                    <span>User Manual &amp; Guides</span>
                  </div>
                </Link>
              </nav>
            ) : (
            <nav className="p-3 space-y-1">
              {(!currentUser || currentUser.role !== "STUDENT") && (
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                    pathname === "/"
                      ? "bg-canvas-soft text-ink font-semibold"
                      : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Home className={`h-4 w-4 ${pathname === "/" ? "text-primary" : "text-ink-muted"}`} />
                    <span>Home</span>
                  </div>
                  {pathname === "/" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </Link>
              )}

              <Link
                href="/student/portal"
                onClick={(e) => {
                  if (isStudent) {
                    handleStudentNavClick("dashboard", e);
                  } else {
                    setMobileMenuOpen(false);
                  }
                }}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                  isPortalTab
                    ? "bg-canvas-soft text-ink font-semibold"
                    : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Clock className={`h-4 w-4 ${isPortalTab ? "text-primary" : "text-ink-muted"}`} />
                  <span>Dashboard</span>
                </div>
                {isPortalTab && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </Link>

              {isMounted && currentUser && (
                <>
                  <Link
                    href="/student/portal?tab=exams"
                    onClick={(e) => {
                      if (isStudent) {
                        handleStudentNavClick("exams", e);
                      } else {
                        setMobileMenuOpen(false);
                      }
                    }}
                    className={`flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                      isPastExamsTab
                        ? "bg-canvas-soft text-ink font-semibold"
                        : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <BookOpen className={`h-4 w-4 ${isPastExamsTab ? "text-primary" : "text-ink-muted"}`} />
                      <span>Past Exams & Submissions</span>
                    </div>
                    {isPastExamsTab && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </Link>

                  <Link
                    href="/student/revaluation"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                      isRevalTab
                        ? "bg-canvas-soft text-ink font-semibold"
                        : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <RotateCcw className={`h-4 w-4 ${isRevalTab ? "text-primary" : "text-ink-muted"}`} />
                      <span>Revaluations & Appeals</span>
                    </div>
                    {isRevalTab && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </Link>
                </>
              )}

              <Link
                href="/help"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                  pathname.startsWith("/help")
                    ? "bg-canvas-soft text-ink font-semibold"
                    : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <HelpCircle className={`h-4 w-4 ${pathname.startsWith("/help") ? "text-primary" : "text-ink-muted"}`} />
                  <span>User Manual & Guides</span>
                </div>
                {pathname.startsWith("/help") && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </Link>

              {isAdminUser && (
                <Link
                  href="/overview"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15 transition-colors border border-primary/20 mt-1"
                >
                  <div className="flex items-center gap-2.5">
                    <Layers className="h-4 w-4 text-primary" />
                    <span>Administrator Console</span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </nav>
            )}

            {/* Quick Actions & Utilities */}
            <div className="px-3 pb-3 pt-1 border-t border-hairline space-y-1">
              {/* Visual Theme Toggle */}
              <div className="flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium text-ink-secondary">
                <span className="flex items-center gap-2.5">
                  <span className="h-4 w-4 flex items-center justify-center text-ink-muted text-[13px]">◐</span>
                  <span>Visual Theme</span>
                </span>
                <ThemeToggle size="sm" />
              </div>

              {isMounted && currentUser ? (
                <>
                  {currentUser.role !== "STUDENT" && currentUser.role !== "ROOT_ADMIN" && !currentUser.has_changed_password && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setChangePasswordOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-ink-secondary hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
                    >
                      <KeyRound className="h-4 w-4 text-ink-muted" />
                      <span>One-Time Password Setup</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={signingOut}
                    className="w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-[#c93b3b] dark:text-[#f28b82] hover:bg-red-50/70 dark:hover:bg-red-950/30 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                  >
                    {signingOut ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogOut className="h-4 w-4" />
                    )}
                    <span>{signingOut ? "Signing Out..." : "Sign Out"}</span>
                  </button>
                </>
              ) : (
                <div className="pt-1.5 space-y-2">
                  <Link
                    href="/auth/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full btn-glass-primary inline-flex items-center justify-center h-9 px-4 rounded-md text-xs font-medium transition-colors cursor-pointer"
                  >
                    <span>Sign In to Portal</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                  <div className="flex items-center justify-between text-[11px] px-1 text-ink-muted">
                    <Link
                      href="/auth/login?role=claim"
                      onClick={() => setMobileMenuOpen(false)}
                      className="hover:text-primary transition-colors underline-offset-2 hover:underline"
                    >
                      Claim Student ID
                    </Link>
                    {isMarketingPage ? (
                      <button
                        type="button"
                        onClick={handleOpenContact}
                        className="hover:text-primary transition-colors underline-offset-2 hover:underline cursor-pointer"
                      >
                        Request Pilot
                      </button>
                    ) : (
                      <Link
                        href="/help"
                        onClick={() => setMobileMenuOpen(false)}
                        className="hover:text-primary transition-colors underline-offset-2 hover:underline"
                      >
                        Help Center
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Status Pill */}
            <div
              className="px-4 py-2.5 border-t border-hairline flex items-center justify-between text-[11px] text-ink-muted bg-canvas-soft"
            >
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
                <span>PaperGrade AI Platform</span>
              </div>
              <span className="font-mono text-[10px]">Academic Pilot</span>
            </div>
          </div>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        onSuccess={() => {
          try {
            if (currentUser) {
              const updated = { ...currentUser, has_changed_password: 1 };
              setStoredUser(updated);
              refreshTenancy(updated);
            }
          } catch {}
        }}
        userEmail={currentUser?.email}
      />
    </header>
  );
}
