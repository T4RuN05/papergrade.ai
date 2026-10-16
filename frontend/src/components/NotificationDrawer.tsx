"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  X,
  CheckCircle2,
  Check,
  ExternalLink,
  GraduationCap,
  RotateCcw,
  Clock,
  Sparkles,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { useNotifications, AppNotification } from "@/lib/NotificationContext";
import { BadgePill, NotificationDrawerSkeleton } from "./ui";
import { useToast } from "@/lib/ToastContext";

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 60) return "Just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function getNotificationIcon(title: string, message: string) {
  const text = `${title} ${message}`.toLowerCase();
  if (text.includes("revaluation") || text.includes("review")) {
    return <RotateCcw className="h-4 w-4 text-[#dd5b00]" />;
  }
  if (text.includes("publish") || text.includes("exam") || text.includes("grade")) {
    return <GraduationCap className="h-4 w-4 text-primary" />;
  }
  if (text.includes("submission") || text.includes("window")) {
    return <Clock className="h-4 w-4 text-[#2a9d99]" />;
  }
  return <Sparkles className="h-4 w-4 text-[#793caf]" />;
}

export function NotificationDrawer() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    notifications,
    unreadCount,
    isOpen,
    closeDrawer,
    markAsRead,
    markAllRead,
    refreshNotifications,
    loading,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");

  const handleRefresh = async () => {
    try {
      await refreshNotifications();
      toast.info("Notifications refreshed.", { title: "Refreshed" });
    } catch {
      toast.error("Failed to refresh notifications");
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAllRead();
      toast.success("All notifications marked as read.", { title: "Notifications Cleared" });
    } catch {
      toast.error("Failed to mark notifications as read");
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        closeDrawer();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeDrawer]);

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "unread") return !n.is_read || n.is_read === 0;
    return true;
  });

  const handleLinkClick = (url: string) => {
    closeDrawer();
    router.push(url);
  };

  return (
    <div
      className={`fixed inset-0 z-50 transition-all duration-300 ease-in-out ${
        isOpen ? "visible pointer-events-auto" : "invisible pointer-events-none"
      }`}
      role="dialog"
      aria-label="Notifications Drawer"
      aria-hidden={!isOpen}
    >
      {/* Backdrop with fade animation */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-xs transition-opacity duration-300 ease-in-out ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* Slide-over Drawer with Tailwind slide animation */}
      <aside
        className={`fixed inset-y-0 right-0 w-full max-w-md h-full h-[100dvh] bg-surface shadow-2xl border-l border-hairline flex flex-col transition-transform duration-300 ease-in-out transform ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-tight text-ink">Notifications</h2>
                {unreadCount > 0 && (
                  <BadgePill label={`${unreadCount} unread`} color="sky" />
                )}
              </div>
              <p className="text-[11px] text-ink-muted">
                System alerts, grading updates & revaluations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleRefresh}
              className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors"
              title="Refresh notifications"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={closeDrawer}
              className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors"
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
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1 rounded-xs font-medium transition-colors ${
                activeTab === "all"
                  ? "bg-primary text-white shadow-xs"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setActiveTab("unread")}
              className={`px-3 py-1 rounded-xs font-medium transition-colors ${
                activeTab === "unread"
                  ? "bg-primary text-white shadow-xs"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-active transition-colors hover:underline"
            >
              <Check className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto divide-y divide-hairline">
          {loading && notifications.length === 0 ? (
            <NotificationDrawerSkeleton />
          ) : filteredNotifications.length > 0 ? (
            filteredNotifications.map((n) => {
              const isUnread = !n.is_read || n.is_read === 0;
              return (
                <div
                  key={n.id}
                  className={`p-4 transition-colors relative flex gap-3 ${
                    isUnread ? "bg-primary/[0.03] hover:bg-primary/[0.06]" : "hover:bg-canvas-soft/60"
                  }`}
                >
                  {/* Icon */}
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface border border-hairline shadow-xs">
                    {getNotificationIcon(n.title, n.message)}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-xs truncate ${isUnread ? "font-bold text-ink" : "font-semibold text-ink-secondary"}`}>
                          {n.title}
                        </span>
                        {isUnread && (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      <span className="text-[10px] text-ink-faint shrink-0 whitespace-nowrap">
                        {formatRelativeTime(n.created_at)}
                      </span>
                    </div>

                    <p className="text-xs text-ink-secondary mt-1 leading-relaxed break-words">
                      {n.message}
                    </p>

                    {/* Actions */}
                    <div className="mt-2.5 flex items-center justify-between gap-2 pt-1 border-t border-hairline/40">
                      {n.link_url ? (
                        <button
                          onClick={() => handleLinkClick(n.link_url!)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-active hover:underline"
                        >
                          View Details <ExternalLink className="h-3 w-3" />
                        </button>
                      ) : (
                        <span />
                      )}

                      {isUnread && (
                        <button
                          onClick={() => markAsRead(n.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink px-2 py-0.5 rounded-sm hover:bg-canvas-soft border border-hairline transition-colors"
                          title="Mark as read"
                        >
                          <Check className="h-3 w-3" />
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center h-72 text-center px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-canvas-soft text-ink-muted mb-3 border border-hairline">
                <Inbox className="h-6 w-6 text-ink-faint" />
              </div>
              <h3 className="text-xs font-bold text-ink">
                {activeTab === "unread" ? "No unread notifications" : "No notifications yet"}
              </h3>
              <p className="text-[11px] text-ink-muted mt-1 max-w-xs">
                {activeTab === "unread"
                  ? "You're all caught up! Great job staying on top of all evaluations."
                  : "When exam submissions, grades, or revaluation reviews are processed, you'll see them here."}
              </p>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-3 border-t border-hairline bg-surface flex items-center justify-between text-[11px] text-ink-muted">
          <span>PaperGrade AI Notification Center</span>
          <button
            onClick={closeDrawer}
            className="text-xs font-semibold text-ink-secondary hover:text-ink"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}
