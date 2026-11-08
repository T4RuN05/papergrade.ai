"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AdminHeader } from "@/components/AdminHeader";
import { NotificationDrawer } from "@/components/NotificationDrawer";
import { NotificationProvider } from "@/lib/NotificationContext";
import { TenantProvider } from "@/lib/TenantContext";
import { BreadcrumbProvider } from "@/lib/BreadcrumbContext";
import { ToastProvider } from "@/lib/ToastContext";
import { ConfirmProvider } from "@/lib/ConfirmContext";
import { NavigationProgressBar } from "@/components/NavigationProgressBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Check if current route is an administrative / faculty workflow
  const isAdminRoute =
    pathname === "/overview" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/branch") ||
    pathname.startsWith("/batches") ||
    pathname.startsWith("/exams") ||
    pathname.startsWith("/revaluation") ||
    pathname.startsWith("/analytics") ||
    pathname.startsWith("/grading") ||
    pathname.startsWith("/marks");

  return (
    <ToastProvider>
      <ConfirmProvider>
        <NotificationProvider>
          <TenantProvider>
            <BreadcrumbProvider>
            <NavigationProgressBar />
          {isAdminRoute ? (
        <div className="flex min-h-screen bg-canvas-soft text-ink selection:bg-primary selection:text-white">
          {/* Left Admin Sidebar */}
          <AdminSidebar
            mobileOpen={mobileSidebarOpen}
            onCloseMobile={() => setMobileSidebarOpen(false)}
          />

          {/* Right Main Content Area */}
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

          {/* Right-Side Notification Slide-Over Drawer */}
          <NotificationDrawer />
        </div>
      ) : (
        <div className="min-h-screen bg-canvas-soft text-ink flex flex-col font-sans selection:bg-primary selection:text-white">
          {/* Public / Student Navbar */}
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

          {/* Right-Side Notification Slide-Over Drawer */}
          <NotificationDrawer />
        </div>
      )}
          </BreadcrumbProvider>
        </TenantProvider>
      </NotificationProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
