"use client";

import React from "react";
import { Bell, RefreshCw, X, Check, Loader2 } from "lucide-react";

export interface NotificationDrawerHeaderProps {
  isRealtimeActive: boolean;
  loading: boolean;
  activeTab: "unread" | "all";
  unreadCount: number;
  totalCount: number;
  isClearingAll: boolean;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  onTabChange: (tab: "unread" | "all") => void;
  onMarkAll: () => Promise<void>;
}

export const NotificationDrawerHeader: React.FC<NotificationDrawerHeaderProps> = ({
  isRealtimeActive,
  loading,
  activeTab,
  unreadCount,
  totalCount,
  isClearingAll,
  onRefresh,
  onClose,
  onTabChange,
  onMarkAll,
}) => {
  return (
    <>
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-hairline bg-surface">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-ink">Notifications</h2>
              {isRealtimeActive && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <p className="text-[11px] text-ink-muted">
              System alerts, grading updates &amp; revaluations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
            title="Refresh notifications"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
            title="Close notifications (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-canvas-soft/70 border-b border-hairline text-xs">
        <div className="flex items-center gap-1 bg-surface p-0.5 rounded-md border border-hairline">
          <button
            type="button"
            onClick={() => onTabChange("unread")}
            className={`px-3 py-1 rounded-xs font-medium transition-colors cursor-pointer ${
              activeTab === "unread"
                ? "bg-primary text-white shadow-xs"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            Unread ({unreadCount})
          </button>
          <button
            type="button"
            onClick={() => onTabChange("all")}
            className={`px-3 py-1 rounded-xs font-medium transition-colors cursor-pointer ${
              activeTab === "all"
                ? "bg-primary text-white shadow-xs"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            All ({totalCount})
          </button>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAll}
            disabled={isClearingAll}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-active transition-colors hover:underline disabled:opacity-50 cursor-pointer"
          >
            {isClearingAll ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            <span>{isClearingAll ? "Clearing..." : "Mark all read"}</span>
          </button>
        )}
      </div>
    </>
  );
};
