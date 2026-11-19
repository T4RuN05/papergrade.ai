"use client";

import React from "react";
import { Bell, BellRing } from "lucide-react";

export interface PushNotificationPermissionBannerProps {
  isSupported: boolean;
  permission: NotificationPermission;
  onRequestPermission: () => Promise<boolean>;
  onSendTestNotification: () => Promise<void>;
}

export const PushNotificationPermissionBanner: React.FC<PushNotificationPermissionBannerProps> = ({
  isSupported,
  permission,
  onRequestPermission,
  onSendTestNotification,
}) => {
  if (!isSupported) return null;

  return (
    <div>
      {permission === "default" && (
        <div className="m-3 p-3 rounded-lg border border-primary/25 bg-primary/5 flex items-start gap-3">
          <div className="h-7 w-7 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
            <Bell className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-ink">Enable Device Notifications</h4>
            <p className="text-[11px] text-ink-muted leading-tight mt-0.5">
              Receive instant system alerts when papers are graded, marks released, or revaluations update.
            </p>
            <button
              type="button"
              onClick={() => onRequestPermission()}
              className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary text-white text-[11px] font-semibold hover:bg-primary-active transition-colors shadow-2xs cursor-pointer"
            >
              <BellRing className="h-3 w-3" />
              Allow Notifications
            </button>
          </div>
        </div>
      )}

      {permission === "granted" && (
        <div className="px-5 py-2 bg-emerald-50/70 border-b border-emerald-100 flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-emerald-800 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            Device Notifications Active
          </span>
          <button
            type="button"
            onClick={() => onSendTestNotification()}
            className="text-emerald-700 hover:text-emerald-900 font-semibold hover:underline cursor-pointer"
          >
            Send Test Alert
          </button>
        </div>
      )}

      {permission === "denied" && (
        <div className="px-5 py-2 bg-amber-50/70 border-b border-amber-100 text-[11px] text-amber-800 flex items-center justify-between">
          <span>Notifications are blocked in your browser site settings.</span>
        </div>
      )}
    </div>
  );
};
