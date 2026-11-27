"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useTenant } from "@/lib/TenantContext";
import { getAuthToken, getStoredUser, getStoredUserPayload } from "@/lib/api";
import { GraduationCap, ShieldCheck, Lock, RefreshCw } from "lucide-react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AdminHeader } from "@/components/AdminHeader";
import { Navbar } from "@/components/Navbar";
import { NotificationDrawer } from "@/components/NotificationDrawer";

interface RouteGuardProps {
  children: React.ReactNode;
}

export function RouteGuard({ children }: RouteGuardProps) {
  const pathname = usePathname();
  const { currentUser, isLoggingOut } = useTenant();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // User & token resolution gated on mounted so SSR and initial hydration match cleanly
  const syncUser = useMemo(() => {
    if (!mounted) return null;
    return currentUser || getStoredUser() || getStoredUserPayload();
  }, [mounted, currentUser]);

  // Re-evaluates on mount, login/logout, or when currentUser sync changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hasToken = useMemo(() => {
    if (!mounted) return false;
    return Boolean(getAuthToken());
  }, [mounted, currentUser]);

  const role = syncUser?.role;

  // Route categorization
  const isAdminRoute = useMemo(() => {
    return (
      pathname === "/overview" ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/branch") ||
      pathname.startsWith("/batches") ||
      pathname.startsWith("/exams") ||
      pathname.startsWith("/revaluation") ||
      pathname.startsWith("/analytics") ||
      pathname.startsWith("/grading") ||
      pathname.startsWith("/marks")
    );
  }, [pathname]);

  const isStudentRoute = useMemo(() => {
    return pathname.startsWith("/student") || pathname.startsWith("/results");
  }, [pathname]);

  const isSettingsRoute = useMemo(() => {
    return pathname.startsWith("/settings");
  }, [pathname]);

  const isAuthRoute = useMemo(() => {
    return pathname.startsWith("/auth/login") || pathname === "/auth/claim";
  }, [pathname]);

  const isPublicRoute = useMemo(() => {
    return (
      pathname === "/" ||
      pathname === "/about" ||
      pathname === "/privacy" ||
      pathname === "/terms" ||
      pathname.startsWith("/help") ||
      isAuthRoute
    );
  }, [pathname, isAuthRoute]);

  const isAdminLayout = useMemo(() => {
    return isAdminRoute || (isSettingsRoute && Boolean(role && role !== "STUDENT"));
  }, [isAdminRoute, isSettingsRoute, role]);

  // Determine redirection target if user role and route mismatch
  const targetRedirect = useMemo(() => {
    if (!mounted || isLoggingOut) return null;
    if (typeof window === "undefined") return null;

    const fullCurrentPath =
      pathname + (typeof window !== "undefined" ? window.location.search : "");

    // 1. Unauthenticated barrier on protected routes
    if (!hasToken) {
      if (isAdminRoute) {
        return `/auth/login?role=staff&redirect=${encodeURIComponent(fullCurrentPath)}`;
      }
      if (isStudentRoute) {
        return `/auth/login?role=student&redirect=${encodeURIComponent(fullCurrentPath)}`;
      }
      if (isSettingsRoute) {
        return `/auth/login?redirect=${encodeURIComponent(fullCurrentPath)}`;
      }
      return null;
    }

    // 2. Student attempting to access Admin / Faculty workspace
    if (role === "STUDENT" && isAdminRoute) {
      return "/student/portal";
    }

    // 3. Staff / Faculty attempting to access Student workspace
    if (role && role !== "STUDENT" && isStudentRoute) {
      return role === "ROOT_ADMIN" ? "/overview" : "/branch/batches";
    }

    // 4. Role hierarchy barriers within Staff routes
    if (role === "BRANCH_MANAGER" || role === "INSTITUTE_DIRECTOR") {
      if (pathname === "/overview" || pathname === "/admin/tenancy") {
        return "/branch/batches";
      }
    }

    if (role === "BRANCH_MANAGER" && (pathname === "/admin/reports" || pathname.startsWith("/analytics"))) {
      return "/branch/batches";
    }

    return null;
  }, [mounted, hasToken, role, isAdminRoute, isStudentRoute, isSettingsRoute, pathname, isLoggingOut]);

  // Handle browser back/forward (popstate), mobile bfcache restoration (pageshow), and cross-tab logout (storage)
  useEffect(() => {
    const handleNavigationSync = () => {
      const liveToken = getAuthToken();
      const liveUser = getStoredUser() || getStoredUserPayload();
      const liveRole = liveUser?.role;
      const fullPath =
        pathname + (typeof window !== "undefined" ? window.location.search : "");

      if (!liveToken && (isAdminRoute || isStudentRoute || isSettingsRoute)) {
        window.location.replace(
          isAdminRoute
            ? `/auth/login?role=staff&redirect=${encodeURIComponent(fullPath)}`
            : isStudentRoute
            ? `/auth/login?role=student&redirect=${encodeURIComponent(fullPath)}`
            : `/auth/login?redirect=${encodeURIComponent(fullPath)}`
        );
        return;
      }

      if (liveRole === "STUDENT" && isAdminRoute) {
        window.location.replace("/student/portal");
        return;
      }

      if (liveRole && liveRole !== "STUDENT" && isStudentRoute) {
        window.location.replace(liveRole === "ROOT_ADMIN" ? "/overview" : "/branch/batches");
        return;
      }

      if ((liveRole === "BRANCH_MANAGER" || liveRole === "INSTITUTE_DIRECTOR") && (pathname === "/overview" || pathname === "/admin/tenancy")) {
        window.location.replace("/branch/batches");
        return;
      }

      if (liveRole === "BRANCH_MANAGER" && (pathname === "/admin/reports" || pathname.startsWith("/analytics"))) {
        window.location.replace("/branch/batches");
        return;
      }
    };

    window.addEventListener("pageshow", handleNavigationSync);
    window.addEventListener("popstate", handleNavigationSync);
    window.addEventListener("storage", handleNavigationSync);
    return () => {
      window.removeEventListener("pageshow", handleNavigationSync);
      window.removeEventListener("popstate", handleNavigationSync);
      window.removeEventListener("storage", handleNavigationSync);
    };
  }, [isAdminRoute, isStudentRoute, isSettingsRoute, pathname]);

  // Execute top-level replacement when redirection target is active
  useEffect(() => {
    if (!mounted || isLoggingOut) return;
    if (targetRedirect) {
      window.location.replace(targetRedirect);
    }
  }, [mounted, targetRedirect, isLoggingOut]);

  // Zero-flicker barrier: prevent mounting unauthorized admin or student components
  if (targetRedirect) {
    const isStudentBounced = role === "STUDENT" && isAdminRoute;
    const isStaffBounced = role && role !== "STUDENT" && isStudentRoute;

    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas-soft text-ink p-4">
        <div className="max-w-md w-full p-8 rounded-lg bg-surface border border-hairline shadow-notion-card text-center space-y-4 animate-in fade-in duration-200">
          <div className="mx-auto h-12 w-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            {isStudentBounced ? (
              <GraduationCap className="h-6 w-6" />
            ) : isStaffBounced ? (
              <ShieldCheck className="h-6 w-6" />
            ) : (
              <Lock className="h-6 w-6" />
            )}
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-base text-ink">
              {isStudentBounced
                ? "Switching to Student Workspace"
                : isStaffBounced
                ? "Switching to Staff Workspace"
                : "Authentication Required"}
            </h3>
            <p className="text-xs text-ink-muted leading-relaxed">
              {isStudentBounced
                ? "Your active session is a student account. Redirecting you to the student portal..."
                : isStaffBounced
                ? "Your active session is administrative staff. Redirecting you to your faculty desk..."
                : "Please sign in to access this protected workspace..."}
            </p>
          </div>
          <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-ink-muted">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
            <span>Redirecting automatically...</span>
          </div>
        </div>
      </div>
    );
  }

  // Render Admin Layout for authenticated admin routes & staff viewing /settings
  if (isAdminLayout) {
    return (
      <div className="flex min-h-screen bg-canvas-soft text-ink selection:bg-primary selection:text-white">
        <AdminSidebar
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <AdminHeader onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />
          <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
            {children}
          </main>
          <footer className="border-t border-hairline bg-canvas-soft px-4 py-4 text-center text-xs text-ink-muted">
            <p className="max-w-xl mx-auto leading-relaxed">
              PaperGrade AI • High-Integrity Academic Evaluation
            </p>
          </footer>
        </div>

        <NotificationDrawer />
      </div>
    );
  }

  // Render Public / Student Layout for all other routes
  return (
    <div className="min-h-screen bg-canvas-soft text-ink flex flex-col font-sans selection:bg-primary selection:text-white">
      <Navbar />
      <main className="flex-1 w-full max-w-full overflow-x-clip sm:overflow-x-visible">
        {children}
      </main>
      {pathname !== "/" && pathname !== "/about" && (
        <footer className="border-t border-hairline bg-canvas-soft px-4 py-6 text-center text-xs text-ink-muted">
          <p className="max-w-xl mx-auto leading-relaxed">
            PaperGrade AI • High-Integrity Academic Evaluation
          </p>
        </footer>
      )}

      <NotificationDrawer />
    </div>
  );
}
