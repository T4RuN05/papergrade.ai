"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();
  const { currentUser, isLoggingOut } = useTenant();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Synchronous user & token resolution from storage (0ms latency, zero-flicker protection)
  const syncUser = useMemo(() => {
    if (typeof window === "undefined") return null;
    return currentUser || getStoredUser() || getStoredUserPayload();
  }, [currentUser]);

  const hasToken = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean(getAuthToken());
  }, []);

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

  const isAuthRoute = useMemo(() => {
    return pathname.startsWith("/auth/login") || pathname === "/auth/claim";
  }, [pathname]);

  const isPublicRoute = useMemo(() => {
    return pathname === "/" || pathname.startsWith("/help") || isAuthRoute;
  }, [pathname, isAuthRoute]);

  // Determine redirection target if user role and route mismatch
  const targetRedirect = useMemo(() => {
    if (isLoggingOut) return null;
    if (typeof window === "undefined") return null;

    // 1. Unauthenticated barrier on protected routes
    if (!hasToken) {
      if (isAdminRoute) {
        return `/auth/login?role=staff&redirect=${encodeURIComponent(pathname)}`;
      }
      if (isStudentRoute) {
        return `/auth/login?role=student&redirect=${encodeURIComponent(pathname)}`;
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

    if (role === "BRANCH_MANAGER" && pathname === "/admin/reports") {
      return "/branch/batches";
    }

    return null;
  }, [hasToken, role, isAdminRoute, isStudentRoute, pathname, isLoggingOut]);

  // Handle browser back/forward (popstate) and mobile bfcache restoration (pageshow)
  useEffect(() => {
    const handleNavigationSync = () => {
      const liveToken = getAuthToken();
      const liveUser = getStoredUser() || getStoredUserPayload();
      const liveRole = liveUser?.role;

      if (!liveToken && (isAdminRoute || isStudentRoute)) {
        window.location.replace(
          isAdminRoute
            ? `/auth/login?role=staff&redirect=${encodeURIComponent(pathname)}`
            : `/auth/login?role=student&redirect=${encodeURIComponent(pathname)}`
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
    };

    window.addEventListener("pageshow", handleNavigationSync);
    window.addEventListener("popstate", handleNavigationSync);
    return () => {
      window.removeEventListener("pageshow", handleNavigationSync);
      window.removeEventListener("popstate", handleNavigationSync);
    };
  }, [isAdminRoute, isStudentRoute, pathname]);

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
        <div className="max-w-md w-full p-8 rounded-2xl bg-surface border border-hairline shadow-lg text-center space-y-4 animate-in fade-in duration-200">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            {isStudentBounced ? (
              <GraduationCap className="h-7 w-7 animate-pulse" />
            ) : isStaffBounced ? (
              <ShieldCheck className="h-7 w-7 animate-pulse" />
            ) : (
              <Lock className="h-7 w-7 animate-pulse" />
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

  // Render Admin Layout for authenticated admin routes
  if (isAdminRoute) {
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
          <footer className="border-t border-hairline bg-surface/60 px-4 py-4 text-center text-xs text-ink-muted">
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
      {pathname !== "/" && (
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
