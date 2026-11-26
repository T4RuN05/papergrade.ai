"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, ArrowLeft } from "lucide-react";
import { useNotifications } from "@/lib/NotificationContext";

export default function NotificationsPage() {
  const router = useRouter();
  const { openDrawer, unreadCount } = useNotifications();

  useEffect(() => {
    // Automatically trigger the right notification sidebar
    openDrawer();
  }, [openDrawer]);

  return (
    <div className="max-w-lg mx-auto py-10 sm:py-16 px-4">
      <div className="notion-card p-6 sm:p-8 text-center space-y-5">
        <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-canvas-soft border border-hairline text-ink-secondary">
          <Bell className="h-5 w-5 text-ink" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-surface"
              aria-hidden="true"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <p className="notion-eyebrow text-ink-muted">Notifications</p>
          <h1 className="notion-heading-3 text-ink">Notifications Moved to Sidebar</h1>
          <p className="text-[13px] text-ink-muted leading-relaxed max-w-sm mx-auto">
            Notifications are integrated into your workspace as a slide-over sidebar on the right, so you never lose your place while grading or managing batches.
          </p>
        </div>

        <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => openDrawer()}
            className="notion-btn-primary w-full justify-center text-xs"
          >
            <Bell className="h-3.5 w-3.5 shrink-0" />
            <span>
              Open Sidebar{unreadCount > 0 ? ` (${unreadCount})` : ""}
            </span>
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="notion-btn-utility w-full justify-center text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
            <span>Return Back</span>
          </button>
        </div>
      </div>
    </div>
  );
}
