"use client";

import React, { useState } from "react";
import { Bell, Sparkles } from "lucide-react";
import { useNotifications } from "@/lib/NotificationContext";

export function StudentNotificationBanner() {
  const { permission, isSupported, requestPermission } = useNotifications();
  const [hideBanner, setHideBanner] = useState(false);

  if (!isSupported || permission !== "default" || hideBanner) {
    return null;
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-primary/25 bg-primary/5 shadow-2xs animate-in fade-in">
      <div className="flex items-start sm:items-center gap-3">
        <div className="h-8 w-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
          <Bell className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-xs font-bold text-ink">Turn on Push Notifications</h3>
          <p className="text-[11px] text-ink-muted leading-tight mt-0.5">
            Get real-time device alerts the moment your answer sheets are graded, rubrics scored, or revaluations published.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        <button
          type="button"
          onClick={() => setHideBanner(true)}
          className="px-2.5 py-1 text-[11px] font-medium text-ink-secondary hover:text-ink transition-colors cursor-pointer"
        >
          Later
        </button>
        <button
          type="button"
          onClick={async () => {
            const ok = await requestPermission();
            if (ok) setHideBanner(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary-active transition-colors shadow-2xs cursor-pointer"
        >
          <Sparkles className="h-3 w-3" />
          Enable Alerts
        </button>
      </div>
    </div>
  );
}
