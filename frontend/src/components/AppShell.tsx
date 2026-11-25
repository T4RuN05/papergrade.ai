"use client";

import React from "react";
import { NotificationProvider } from "@/lib/NotificationContext";
import { TenantProvider } from "@/lib/TenantContext";
import { BreadcrumbProvider } from "@/lib/BreadcrumbContext";
import { ToastProvider } from "@/lib/ToastContext";
import { ConfirmProvider } from "@/lib/ConfirmContext";
import { NavigationProgressBar } from "@/components/NavigationProgressBar";
import { RouteGuard } from "@/components/RouteGuard";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <TenantProvider>
          <NotificationProvider>
            <BreadcrumbProvider>
              <NavigationProgressBar />
              <RouteGuard>{children}</RouteGuard>
            </BreadcrumbProvider>
          </NotificationProvider>
        </TenantProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
