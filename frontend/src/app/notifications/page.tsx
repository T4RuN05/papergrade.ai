"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, ArrowLeft, ArrowRight } from "lucide-react";
import { useNotifications } from "@/lib/NotificationContext";
import { ButtonPrimary, FeatureCard } from "@/components/ui";

export default function NotificationsPage() {
  const router = useRouter();
  const { openDrawer, unreadCount } = useNotifications();

  useEffect(() => {
    // Automatically trigger the right notification sidebar
    openDrawer();
  }, [openDrawer]);

  return (
    <div className="max-w-xl mx-auto py-12 px-4 text-center space-y-6">
      <FeatureCard className="p-8 space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bell className="h-7 w-7" />
        </div>

        <h1 className="text-lg font-bold text-ink">Notifications Moved to Sidebar</h1>
        <p className="text-xs text-ink-muted leading-relaxed max-w-sm mx-auto">
          Notifications are now integrated directly into your workspace as a fast slide-over sidebar on the right, so you never lose your place while grading or managing batches.
        </p>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <ButtonPrimary size="sm" onClick={() => openDrawer()}>
            Open Notification Sidebar {unreadCount > 0 ? `(${unreadCount} unread)` : ""}
          </ButtonPrimary>
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary hover:text-ink px-3 py-1.5 rounded-md hover:bg-canvas-soft border border-hairline transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Return to previous page
          </button>
        </div>
      </FeatureCard>
    </div>
  );
}
