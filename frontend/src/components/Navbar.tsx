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
} from "lucide-react";
import { api, getAuthToken } from "@/lib/api";
import { BadgePill } from "./ui";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const token = getAuthToken();
    if (token) {
      api
        .getMe()
        .then((user) => setCurrentUser(user))
        .catch(() => setCurrentUser(null));
    } else {
      setCurrentUser(null);
    }
  }, [pathname]);

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    toast.success("You have signed out successfully.", { title: "Logged Out" });
    router.push("/auth/login");
  };

  const isStudent = isMounted && currentUser?.role === "STUDENT";
  const isAdminUser = isMounted && (currentUser?.role === "ROOT_ADMIN" || currentUser?.role === "BRANCH_MANAGER");

  return (
    <header className="sticky top-0 z-40 w-full border-b border-hairline bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8">
        {/* Brand & Mobile Toggle */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

          <Link href="/" className="flex items-center gap-2">
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
              pathname.startsWith("/student")
                ? "bg-canvas-soft text-ink font-semibold"
                : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
            }`}
          >
            <Clock className="h-3.5 w-3.5 text-ink-muted" />
            Student Portal
          </Link>
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
        <div className="flex items-center gap-2">
          {isMounted && currentUser ? (
            <div className="flex items-center gap-2">
              {/* Notification Bell Button (Triggers Right Slide-Over Drawer) */}
              <button
                type="button"
                onClick={openDrawer}
                className="p-1.5 rounded-md text-ink-secondary hover:text-ink hover:bg-canvas-soft transition-colors"
                title="Notifications"
                aria-label="Open notifications"
              >
                <span className="relative inline-flex items-center justify-center">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1.5 left-2.5 flex h-3.5 min-w-3.5 px-1 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white shadow-xs ring-2 ring-surface animate-in zoom-in-50">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </span>
              </button>

              {/* Role badge */}
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
                onClick={handleLogout}
                className="p-1.5 rounded-md text-ink-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/auth/claim"
                className="hidden sm:inline-flex items-center text-xs font-medium text-ink-secondary hover:text-primary px-2.5 py-1 rounded-md hover:bg-canvas-soft transition-colors"
              >
                Claim Student ID
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center rounded-full bg-primary hover:bg-primary-active text-white px-3.5 py-1 text-xs font-medium transition-colors shadow-xs"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-hairline bg-surface px-4 pt-3 pb-5 shadow-sm animate-in slide-in-from-top-1 duration-150">
          <nav className="flex flex-col space-y-1">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-ink-secondary hover:bg-canvas-soft"
            >
              Home
            </Link>
            <Link
              href="/student/portal"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-ink-secondary hover:bg-canvas-soft"
            >
              <Clock className="h-4 w-4 text-ink-muted" />
              Student Portal
            </Link>
            {isAdminUser && (
              <Link
                href="/overview"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-semibold text-primary bg-primary/10"
              >
                <Layers className="h-4 w-4 text-primary" />
                Admin Console
              </Link>
            )}
          </nav>

          <div className="mt-3 pt-3 border-t border-hairline flex items-center justify-between text-xs text-ink-muted">
            <span>PaperGrade AI Pilot</span>
            {(!isMounted || !currentUser) && (
              <Link
                href="/auth/claim"
                onClick={() => setMobileMenuOpen(false)}
                className="text-primary font-medium hover:underline"
              >
                Claim Account →
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
