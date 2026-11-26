"use client";

import React, { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/lib/NotificationContext";

export function StudentNotificationBanner() {
  const { permission, isSupported, requestPermission } = useNotifications();
  const [hideBanner, setHideBanner] = useState(false);

  if (!isSupported || permission !== "default" || hideBanner) {
    return null;
  }

  return (
    <div className="notion-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <div className="h-8 w-8 rounded-md bg-canvas-soft border border-hairline text-primary flex items-center justify-center shrink-0">
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink tracking-[-0.005em]">
            Turn on device notifications
          </h3>
          <p className="text-xs text-ink-muted leading-relaxed mt-0.5">
            Get instant alerts when exam windows open, marks publish, or appeals update.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 shrink-0 w-full sm:w-auto">
        <button
          type="button"
          onClick={() => setHideBanner(true)}
          className="h-9 px-3.5 rounded-md text-xs notion-btn-utility cursor-pointer"
        >
          Later
        </button>
        <button
          type="button"
          onClick={async () => {
            const ok = await requestPermission();
            if (ok) setHideBanner(true);
          }}
          className="h-9 px-3.5 rounded-md text-xs notion-btn-primary cursor-pointer"
        >
          Enable Alerts
        </button>
      </div>
    </div>
  );
}
