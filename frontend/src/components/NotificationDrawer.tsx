"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/lib/NotificationContext";
import { NotificationDrawerSkeleton } from "./ui";
import { useToast } from "@/lib/ToastContext";
import { NotificationDrawerHeader } from "./notifications/NotificationDrawerHeader";
import { NotificationItemRow } from "./notifications/NotificationItemRow";
import { PushNotificationPermissionBanner } from "./notifications/PushNotificationPermissionBanner";
import { NotificationEmptyState } from "./notifications/NotificationEmptyState";

export function NotificationDrawer() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    notifications,
    unreadCount,
    isOpen,
    loading,
    isRealtimeActive,
    permission,
    isSupported,
    requestPermission,
    sendTestNotification,
    closeDrawer,
    markAsRead,
    markAllRead,
    refreshNotifications,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<"unread" | "all">("unread");
  const [clearingIds, setClearingIds] = useState<Set<string>>(new Set());
  const [isClearingAll, setIsClearingAll] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab("unread");
      setClearingIds(new Set());
      setIsClearingAll(false);
    }
  }, [isOpen]);

  const handleRefresh = async () => {
    try {
      await refreshNotifications();
      toast.info("Notifications refreshed.", { title: "Refreshed" });
    } catch {
      toast.error("Failed to refresh notifications", { title: "Error" });
    }
  };

  const handleMarkAll = async () => {
    if (isClearingAll) return;
    const unreadNotifications = filteredNotifications.filter(
      (n) => !n.is_read || n.is_read === 0
    );
    if (unreadNotifications.length === 0) return;

    setIsClearingAll(true);
    const unreadIds = new Set(unreadNotifications.map((n) => n.id));
    setClearingIds(unreadIds);

    const staggerStep = 55;
    const animDuration = 380;
    const totalDuration = (unreadNotifications.length - 1) * staggerStep + animDuration;

    setTimeout(async () => {
      try {
        await markAllRead();
        toast.success("All notifications marked as read.", { title: "Notifications Cleared" });
      } catch {
        toast.error("Failed to mark notifications as read", { title: "Error" });
      } finally {
        setClearingIds(new Set());
        setIsClearingAll(false);
      }
    }, Math.min(totalDuration, 950));
  };

  const handleSingleClear = (id: string) => {
    if (clearingIds.has(id)) return;
    setClearingIds((prev) => new Set(prev).add(id));
    setTimeout(async () => {
      try {
        await markAsRead(id);
      } finally {
        setClearingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }, 380);
  };

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
      className={`fixed inset-0 z-[70] transition-all duration-300 ease-in-out ${
        isOpen ? "visible pointer-events-auto" : "invisible pointer-events-none"
      }`}
      role="dialog"
      aria-label="Notifications Drawer"
      aria-hidden={!isOpen}
    >
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 transition-opacity duration-300 ease-in-out"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 right-0 w-full max-w-md h-full h-[100dvh] bg-surface shadow-notion-modal border-l border-hairline flex flex-col transition-transform duration-300 ease-in-out transform ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <NotificationDrawerHeader
          isRealtimeActive={isRealtimeActive}
          loading={loading}
          activeTab={activeTab}
          unreadCount={unreadCount}
          totalCount={notifications.length}
          isClearingAll={isClearingAll}
          onRefresh={handleRefresh}
          onClose={closeDrawer}
          onTabChange={setActiveTab}
          onMarkAll={handleMarkAll}
        />

        <PushNotificationPermissionBanner
          isSupported={isSupported}
          permission={permission}
          onRequestPermission={requestPermission}
          onSendTestNotification={sendTestNotification}
        />

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto divide-y divide-hairline">
          {loading && notifications.length === 0 ? (
            <NotificationDrawerSkeleton />
          ) : filteredNotifications.length > 0 ? (
            filteredNotifications.map((n, index) => {
              const isClearing = clearingIds.has(n.id);
              const cascadeDelay = isClearing && isClearingAll ? `${index * 55}ms` : undefined;

              return (
                <NotificationItemRow
                  key={n.id}
                  notification={n}
                  isClearing={isClearing}
                  cascadeDelay={cascadeDelay}
                  onMarkRead={handleSingleClear}
                  onLinkClick={handleLinkClick}
                />
              );
            })
          ) : (
            <NotificationEmptyState activeTab={activeTab} />
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-3 border-t border-hairline bg-surface flex items-center justify-between text-[11px] text-ink-muted">
          <span>PaperGrade AI Notification Center</span>
          <button
            type="button"
            onClick={closeDrawer}
            className="text-xs font-semibold text-ink-secondary hover:text-ink cursor-pointer"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}
export default NotificationDrawer;
