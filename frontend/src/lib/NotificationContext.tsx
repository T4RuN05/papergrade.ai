"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { api, getAuthToken } from "@/lib/api";
import { useToast } from "@/lib/ToastContext";

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  link_url?: string | null;
  is_read: number | boolean;
  created_at: string;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  isOpen: boolean;
  loading: boolean;
  permission: NotificationPermission;
  isSupported: boolean;
  requestPermission: () => Promise<boolean>;
  sendSystemNotification: (title: string, options?: NotificationOptions) => Promise<void>;
  sendTestNotification: () => Promise<void>;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  markAsRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(false);
  const isInitialMount = useRef(true);

  // Sync initial notification permission status on client mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  const sendSystemNotification = useCallback(
    async (title: string, options?: NotificationOptions) => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;

      const notifOptions: NotificationOptions = {
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        silent: false,
        ...options,
      };

      try {
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready;
          if (reg && "showNotification" in reg) {
            await reg.showNotification(title, notifOptions);
            return;
          }
        }
        new Notification(title, notifOptions);
      } catch {
        // Fallback if browser serviceWorker notification fails
        try {
          new Notification(title, notifOptions);
        } catch {}
      }
    },
    []
  );

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.warning("Push notifications are not supported in this browser environment.", {
        title: "Unsupported",
      });
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "granted") {
        toast.success("Push notifications enabled! You will receive live updates for graded papers and announcements.", {
          title: "Notifications Enabled",
        });
        sendSystemNotification("PaperGrade AI Notifications Active", {
          body: "Push alerts are successfully enabled on this device.",
          data: { url: "/student/portal" },
        });
        return true;
      } else if (result === "denied") {
        toast.info("Notifications were blocked. You can re-enable them in your browser site permissions.", {
          title: "Permission Blocked",
        });
        return false;
      }
      return false;
    } catch {
      return false;
    }
  }, [toast, sendSystemNotification]);

  const sendTestNotification = useCallback(async () => {
    if (permission !== "granted") {
      const granted = await requestPermission();
      if (!granted) return;
    }
    await sendSystemNotification("PaperGrade AI Alert", {
      body: "Test notification delivered! Real-time alerts are functioning on your PWA.",
      data: { url: "/student/portal" },
    });
    toast.success("Test notification dispatched to your system tray / notification shade.", {
      title: "Test Dispatched",
    });
  }, [permission, requestPermission, sendSystemNotification, toast]);

  const fetchNotifications = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setNotifications([]);
      return;
    }
    try {
      setLoading(true);
      const data = await api.listNotifications();
      if (Array.isArray(data)) {
        setNotifications((prev) => {
          if (!isInitialMount.current) {
            const existingIds = new Set(prev.map((n) => n.id));
            const newUnread = data.filter(
              (n) => !existingIds.has(n.id) && (!n.is_read || n.is_read === 0)
            );
            newUnread.forEach((n) => {
              toast.info(n.message, { title: n.title });
              sendSystemNotification(n.title, {
                body: n.message,
                data: { url: n.link_url || "/student/portal" },
              });
            });
          } else {
            isInitialMount.current = false;
          }
          return data;
        });
      }
    } catch {
      // Ignore background refresh errors
    } finally {
      setLoading(false);
    }
  }, [toast, sendSystemNotification]);

  useEffect(() => {
    fetchNotifications();

    // Auto-poll every 12 seconds for live updates
    const interval = setInterval(fetchNotifications, 12000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const openDrawer = () => setIsOpen(true);
  const closeDrawer = () => setIsOpen(false);
  const toggleDrawer = () => setIsOpen((prev) => !prev);

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n))
    );
    try {
      await api.markNotificationRead(id);
    } catch {
      fetchNotifications();
    }
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    try {
      await api.markAllNotificationsRead();
    } catch {
      fetchNotifications();
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read || n.is_read === 0).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isOpen,
        loading,
        permission,
        isSupported,
        requestPermission,
        sendSystemNotification,
        sendTestNotification,
        openDrawer,
        closeDrawer,
        toggleDrawer,
        markAsRead,
        markAllRead,
        refreshNotifications: fetchNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
