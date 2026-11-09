"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { api, getAuthToken } from "@/lib/api";
import { useToast } from "@/lib/ToastContext";

export interface AppNotification {
  id: string;
  user_id: string;
  type?: string;
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

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(false);
  const isInitialMount = useRef(true);

  // Synchronize device Web Push subscription token with backend (enables closed-app delivery)
  const syncWebPushSubscription = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }
    const token = getAuthToken();
    if (!token || Notification.permission !== "granted") return;

    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
      reg = await navigator.serviceWorker.ready;
      if (!reg || !reg.pushManager) return;

      const vapidPublicKey = await api.getVapidPublicKey();
      if (!vapidPublicKey) return;

      const expectedKey = urlBase64ToUint8Array(vapidPublicKey);
      let sub = await reg.pushManager.getSubscription();

      if (sub) {
        // If an existing subscription has mismatched applicationServerKey, unsubscribe and recreate
        const rawKey = sub.options?.applicationServerKey;
        if (rawKey) {
          const currentKey = new Uint8Array(rawKey);
          let matches = currentKey.length === expectedKey.length;
          if (matches) {
            for (let i = 0; i < currentKey.length; i++) {
              if (currentKey[i] !== expectedKey[i]) {
                matches = false;
                break;
              }
            }
          }
          if (!matches) {
            await sub.unsubscribe();
            sub = null;
          }
        } else {
          await sub.unsubscribe();
          sub = null;
        }
      }

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: expectedKey,
        });
      }

      if (sub) {
        const subJson = sub.toJSON();
        await api.savePushSubscription({
          ...subJson,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        });
      }
    } catch (err) {
      console.warn("Web Push registration notice:", err);
    }
  }, []);

  // Sync initial notification permission status & WebPush on client mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
      if (Notification.permission === "granted") {
        syncWebPushSubscription();
      }
    }
  }, [syncWebPushSubscription]);

  const sendSystemNotification = useCallback(
    async (title: string, options?: NotificationOptions) => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;

      const origin = window.location.origin;
      const notifOptions: any = {
        icon: new URL("/icon-192.png", origin).href,
        badge: new URL("/badge.png", origin).href,
        vibrate: [200, 100, 200],
        tag: `papergrade-${Date.now()}`,
        renotify: true,
        silent: false,
        ...options,
      };

      // 1. Mobile PWA / Android ServiceWorker approach (MANDATORY for Android Chrome & WebAPKs)
      if ("serviceWorker" in navigator) {
        try {
          let reg = await navigator.serviceWorker.getRegistration();
          if (!reg) {
            reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
          }

          // If the service worker is installing, wait up to 1.5s for it to become ready
          if (reg && reg.installing) {
            await Promise.race([
              new Promise<void>((resolve) => {
                reg!.installing?.addEventListener("statechange", function (this: ServiceWorker) {
                  if (this.state === "activated") resolve();
                });
              }),
              new Promise<void>((resolve) => setTimeout(resolve, 1500)),
            ]);
          }

          if (reg && "showNotification" in reg) {
            await reg.showNotification(title, notifOptions);
            return;
          }

          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: "SHOW_NOTIFICATION",
              title,
              options: notifOptions,
            });
            return;
          }
        } catch (swErr) {
          console.warn("ServiceWorker showNotification encountered an error:", swErr);
        }
      }

      // 2. Desktop Fallback (PC Chrome, Edge, Safari, Firefox)
      try {
        new Notification(title, notifOptions);
      } catch (err) {
        console.warn("Desktop Notification constructor fallback failed:", err);
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
        await syncWebPushSubscription();
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
  }, [toast, sendSystemNotification, syncWebPushSubscription]);

  const sendTestNotification = useCallback(async () => {
    try {
      if (permission !== "granted") {
        const granted = await requestPermission();
        if (!granted) return;
      }
      // 1. Immediate local confirmation notification
      await sendSystemNotification("PaperGrade AI Alert", {
        body: "Local alert delivered! Synchronizing Cloud WebPush gateway...",
        data: { url: "/student/portal" },
      });

      // 2. Register Web Push with browser push gateway (Google/Apple)
      await syncWebPushSubscription();

      // 3. Trigger true server-side cloud push test
      await api.testClosedAppPush().catch(() => {});

      toast.success("Cloud WebPush test dispatched! Alerts will trigger even when closed.", {
        title: "Test Dispatched",
      });
    } catch (err: any) {
      console.error("Test notification error:", err);
      toast.error(err.message || "Failed to dispatch notification", {
        title: "Notification Error",
      });
    }
  }, [permission, requestPermission, sendSystemNotification, syncWebPushSubscription, toast]);

  const fetchNotifications = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setNotifications([]);
      return;
    }
    // Automatically keep device Web Push registration bound to the active user session
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      syncWebPushSubscription().catch(() => {});
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
  }, [toast, sendSystemNotification, syncWebPushSubscription]);

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
