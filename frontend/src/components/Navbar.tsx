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
} from "lucide-react";
import { api, getAuthToken, getStoredUser } from "@/lib/api";
import { BadgePill } from "./ui";
import { ThemeToggle } from "@/lib/ThemeContext";
import { useNotifications } from "@/lib/NotificationContext";
import { useToast, queueToast } from "@/lib/ToastContext";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { unreadCount, openDrawer } = useNotifications();

  const [currentUser, setCurrentUser] = useState<{
    id: string;
    email: string;
    role: string;
    full_name: string;
  } | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const isPastExamsTab =
    isMounted &&
    pathname.startsWith("/student") &&
    (pathname === "/student/exams" ||
      (typeof window !== "undefined" && window.location.search.includes("tab=exams")));
  const isPortalTab = isMounted && pathname === "/student/portal" && !isPastExamsTab;

  useEffect(() => {
    setIsMounted(true);
    const token = getAuthToken();
    setHasToken(Boolean(token));
    if (token) {
      // Synchronously restore cached user to prevent UI flash
      const cached = getStoredUser();
      if (cached) {
        setCurrentUser(cached);
      }
      api
        .getMe()
        .then((user) => setCurrentUser(user))
        .catch(() => {
          setCurrentUser(null);
          setHasToken(false);
        });
    } else {
      setCurrentUser(null);
    }
    // Close mobile menu on route change
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
    api.logout();
    if (typeof window !== "undefined") {
      localStorage.removeItem("papergrade_selected_institute_id");
      localStorage.removeItem("papergrade_selected_branch_id");
      queueToast({
        type: "success",
        title: "Logged Out",
        message: "You have signed out successfully.",
      });
      window.location.href = "/auth/login";
    }
  };

  const isStudent = isMounted && currentUser?.role === "STUDENT";
  const isAdminUser = isMounted && (currentUser?.role === "ROOT_ADMIN" || currentUser?.role === "BRANCH_MANAGER");

  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-hairline bg-surface shadow-xs transition-colors"
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8">
        {/* Brand & Mobile Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-canvas-soft active:bg-canvas-soft transition-colors cursor-pointer"
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
                alt="PaperGrade AI"
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
              <span className="hidden sm:inline-block ml-2 text-[10px] font-medium text-ink-muted px-1.5 py-0.5 rounded-sm bg-canvas-soft border border-hairline">
                Pilot
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Navigation (Clean, uncluttered for public/student view) */}
        <nav className="hidden md:flex items-center gap-1">
          <Link
            href="/"
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              pathname === "/"
                ? "bg-canvas-soft text-ink font-semibold"
                : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
            }`}
          >
            Home
          </Link>
          <Link
            href="/student/portal"
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isPortalTab
                ? "bg-canvas-soft text-ink font-semibold"
                : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
            }`}
          >
            <Clock className="h-3.5 w-3.5 text-ink-muted" />
            Student Portal
          </Link>
          {isMounted && currentUser && (
            <Link
              href="/student/portal?tab=exams"
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isPastExamsTab
                  ? "bg-canvas-soft text-ink font-semibold"
                  : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 text-ink-muted" />
              Past Exams
            </Link>
          )}
          {isAdminUser && (
            <Link
              href="/overview"
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/15 transition-colors border border-primary/20"
            >
              <Layers className="h-3.5 w-3.5" />
              Admin Console <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </nav>

        {/* User Role / Auth Desk */}
        <div className="flex items-center gap-1 sm:gap-2 min-h-[32px]">
          {/* Theme Toggle (Desktop) */}
          <div className="hidden sm:flex items-center mr-0.5">
            <ThemeToggle size="sm" />
          </div>

          {isMounted && currentUser ? (
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Notification Bell Button (Triggers Right Slide-Over Drawer) */}
              <button
                type="button"
                onClick={openDrawer}
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary hover:text-ink hover:bg-canvas-soft transition-colors shrink-0"
                title="Notifications"
                aria-label="Open notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white shadow-xs ring-2 ring-surface animate-in zoom-in-50 leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Role badge (Desktop) */}
              <div className="hidden sm:flex items-center gap-1.5">
                <BadgePill
                  label={
                    currentUser.role === "ROOT_ADMIN"
                      ? "Admin"
                      : currentUser.role === "BRANCH_MANAGER"
                      ? "Branch Mgr"
                      : "Student"
                  }
                  color={
                    currentUser.role === "ROOT_ADMIN"
                      ? "purple"
                      : currentUser.role === "BRANCH_MANAGER"
                      ? "teal"
                      : "sky"
                  }
                />
                <span className="text-xs font-medium text-ink truncate max-w-[120px]">
                  {currentUser.full_name}
                </span>
              </div>

              {/* Logout button */}
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                title="Logout"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : !isMounted || hasToken ? (
            /* Subtle skeleton placeholder during initial mount or while verifying token: DO NOT flash Sign In */
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-canvas-soft border border-hairline animate-pulse shrink-0" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/auth/login?role=claim"
                className="hidden sm:inline-flex items-center btn-glass-utility text-xs font-semibold text-ink px-3 h-8 rounded-md transition-all cursor-pointer active:scale-[0.98]"
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
                className="btn-glass-primary inline-flex items-center justify-center rounded-md px-3.5 h-8 text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-[0.98]"
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
          className="fixed inset-0 top-14 bg-black/30 backdrop-blur-xs z-40 md:hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] opacity-100 pointer-events-auto"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Floating Dropdown Panel (Respects Notion surface with Apple-style smooth slide & scale) */}
      <div
        className={`md:hidden absolute top-full left-0 right-0 w-full border-b border-hairline bg-surface shadow-2xl z-50 max-h-[calc(100vh-3.5rem)] overflow-y-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] origin-top ${
          mobileMenuOpen
            ? "opacity-100 translate-y-0 scale-y-100 pointer-events-auto"
            : "opacity-0 -translate-y-2 scale-y-98 pointer-events-none"
        }`}
      >
            {/* Authenticated User Status Summary */}
            {isMounted && currentUser && (
              <div
                className="px-4 py-3 border-b border-hairline flex items-center justify-between gap-3 bg-canvas-soft"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {currentUser.full_name?.charAt(0) || "U"}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-ink truncate">
                      {currentUser.full_name}
                    </div>
                    <div className="text-[11px] text-ink-muted truncate">
                      {currentUser.email}
                    </div>
                  </div>
                </div>
                <BadgePill
                  label={
                    currentUser.role === "ROOT_ADMIN"
                      ? "Admin"
                      : currentUser.role === "BRANCH_MANAGER"
                      ? "Branch Mgr"
                      : "Student"
                  }
                  color={
                    currentUser.role === "ROOT_ADMIN"
                      ? "purple"
                      : currentUser.role === "BRANCH_MANAGER"
                      ? "teal"
                      : "sky"
                  }
                />
              </div>
            )}

            {/* Navigation Links */}
            <nav className="p-3 space-y-1">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  pathname === "/"
                    ? "bg-canvas-soft text-ink font-semibold"
                    : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Home className="h-4 w-4 text-ink-muted" />
                  <span>Home</span>
                </div>
                {pathname === "/" && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </Link>

              <Link
                href="/student/portal"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  isPortalTab
                    ? "bg-canvas-soft text-ink font-semibold"
                    : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Clock className="h-4 w-4 text-ink-muted" />
                  <span>Student Portal</span>
                </div>
                {isPortalTab && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </Link>

              {isMounted && currentUser && (
                <Link
                  href="/student/portal?tab=exams"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    isPastExamsTab
                      ? "bg-canvas-soft text-ink font-semibold"
                      : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <BookOpen className="h-4 w-4 text-ink-muted" />
                    <span>Past Exams & Submissions</span>
                  </div>
                  {isPastExamsTab && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </Link>
              )}

              {isAdminUser && (
                <Link
                  href="/overview"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15 transition-colors border border-primary/20 mt-1"
                >
                  <div className="flex items-center gap-2.5">
                    <Layers className="h-4 w-4 text-primary" />
                    <span>Administrator Console</span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </nav>

            {/* Quick Actions & Account Utilities */}
            <div className="px-3 pb-3 pt-1 border-t border-hairline space-y-1">
              {/* Mobile Visual Theme Toggle */}
              <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-ink-secondary">
                <span className="flex items-center gap-2.5">
                  <span className="h-4 w-4 flex items-center justify-center text-ink-muted text-[13px]">◐</span>
                  <span>Visual Theme</span>
                </span>
                <ThemeToggle size="sm" />
              </div>

              {isMounted && currentUser ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      openDrawer();
                    }}
                    className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-ink-secondary hover:text-ink hover:bg-canvas-soft transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Bell className="h-4 w-4 text-ink-muted" />
                      <span>Notifications</span>
                    </div>
                    {unreadCount > 0 && (
                      <span className="flex h-4 min-w-4 px-1.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <LogOut className="h-4 w-4 text-red-500" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <div className="pt-1.5 space-y-2">
                  <Link
                    href="/auth/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full btn-glass-primary inline-flex items-center justify-center h-9 px-4 rounded-md text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-[0.98]"
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
                    <Link
                      href="/revaluation"
                      onClick={() => setMobileMenuOpen(false)}
                      className="hover:text-primary transition-colors underline-offset-2 hover:underline"
                    >
                      Revaluation Desk
                    </Link>
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
    </header>
  );
}
