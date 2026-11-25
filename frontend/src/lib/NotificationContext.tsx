"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, getAuthToken } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/lib/ToastContext";
import { getSupabaseClient } from "@/lib/supabase";
import { useTenant } from "@/lib/TenantContext";

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

export interface NotificationStateContextType {
  notifications: AppNotification[];
  unreadCount: number;
  isOpen: boolean;
  loading: boolean;
  isRealtimeActive: boolean;
  permission: NotificationPermission;
  isSupported: boolean;
}

export interface NotificationActionsContextType {
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

export type NotificationContextType = NotificationStateContextType & NotificationActionsContextType;

const NotificationStateContext = createContext<NotificationStateContextType | undefined>(undefined);
const NotificationActionsContext = createContext<NotificationActionsContextType | undefined>(undefined);

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { currentUser, isLoggingOut } = useTenant();
  const activeUserId: string | null = !isLoggingOut
    ? (currentUser?.id || currentUser?.sub || null)
    : null;

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(false);

  const isInitialMount = useRef(true);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const isRealtimeActiveRef = useRef(false);

  useEffect(() => {
    isRealtimeActiveRef.current = isRealtimeActive;
  }, [isRealtimeActive]);

  // Reset notification state cleanly on logout or user switch
  useEffect(() => {
    if (!activeUserId) {
      knownIdsRef.current = new Set();
      isInitialMount.current = true;
      setNotifications([]);
      setIsOpen(false);
      setIsRealtimeActive(false);
      queryClient.setQueryData(queryKeys.notifications.list(), []);
    } else {
      isInitialMount.current = true;
      knownIdsRef.current = new Set();
    }
  }, [activeUserId, queryClient]);

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
    if (!token || !activeUserId || Notification.permission !== "granted") return;

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
        const mgr = reg.pushManager;
        const createPushSubscription = mgr.subscribe.bind(mgr);
        sub = await createPushSubscription({
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
  }, [activeUserId]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
      if (Notification.permission === "granted" && activeUserId) {
        syncWebPushSubscription();
      }
    }
  }, [activeUserId, syncWebPushSubscription]);

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

      if ("serviceWorker" in navigator) {
        try {
          let reg = await navigator.serviceWorker.getRegistration();
          if (!reg) {
            reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
          }

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
      await sendSystemNotification("PaperGrade AI Alert", {
        body: "Local alert delivered! Synchronizing Cloud WebPush gateway...",
        data: { url: "/student/portal" },
      });

      await syncWebPushSubscription();
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
    if (!token || !activeUserId) {
      setNotifications([]);
      queryClient.setQueryData(queryKeys.notifications.list(), []);
      return;
    }
    try {
      setLoading(true);
      const data = await api.listNotifications();
      if (Array.isArray(data)) {
        if (!isInitialMount.current) {
          const newUnread = data.filter(
            (n) => !knownIdsRef.current.has(n.id) && (!n.is_read || n.is_read === 0)
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
        knownIdsRef.current = new Set(data.map((n) => n.id));
        setNotifications(data);
        queryClient.setQueryData(queryKeys.notifications.list(), data);
      }
    } catch {
      // Ignore background refresh errors
    } finally {
      setLoading(false);
    }
  }, [activeUserId, toast, sendSystemNotification, queryClient]);

  // Realtime WebSocket subscription scoped strictly to authenticated activeUserId
  useEffect(() => {
    const supabase = getSupabaseClient();
    const token = getAuthToken();

    if (!supabase || !token || !activeUserId) {
      setIsRealtimeActive(false);
      return;
    }

    let isSubscribed = true;
    const channelName = `notifs_${activeUserId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${activeUserId}`,
        },
        (payload) => {
          if (!isSubscribed) return;
          const row = payload.new as any;
          if (!row || !row.id) return;

          // Record ID before any subsequent poll so Realtime alerts are never double-toasted
          knownIdsRef.current.add(row.id);

          const newNotif: AppNotification = {
            id: row.id,
            user_id: row.user_id,
            type: row.type,
            title: row.title,
            message: row.message,
            link_url: row.link_url,
            is_read: row.is_read || 0,
            created_at: row.created_at || new Date().toISOString(),
          };

          setNotifications((prev) => {
            const next = [newNotif, ...prev.filter((n) => n.id !== newNotif.id)];
            queryClient.setQueryData(queryKeys.notifications.list(), next);
            return next;
          });

          toast.info(newNotif.message, { title: newNotif.title });

          sendSystemNotification(newNotif.title, {
            body: newNotif.message,
            data: { url: newNotif.link_url || "/student/portal" },
          });
        }
      )
      .subscribe((status) => {
        if (!isSubscribed) return;
        if (status === "SUBSCRIBED") {
          setIsRealtimeActive(true);
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setIsRealtimeActive(false);
        }
      });

    return () => {
      isSubscribed = false;
      if (supabase && channel) {
        supabase.removeChannel(channel).catch(() => {});
      }
    };
  }, [activeUserId, toast, sendSystemNotification, queryClient]);

  // Adaptive poller: runs ONLY when authenticated; reads isRealtimeActiveRef to avoid double-fetch on connect
  useEffect(() => {
    const token = getAuthToken();
    if (!token || !activeUserId) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let isCancelled = false;

    const scheduleNextPoll = () => {
      const baseMs = isRealtimeActiveRef.current ? 60000 : 30000;
      const jitterMs = (Math.random() * 10 - 5) * 1000;
      const pollIntervalMs = Math.max(15000, Math.round(baseMs + jitterMs));

      timeoutId = setTimeout(() => {
        if (!isCancelled && typeof document !== "undefined" && !document.hidden) {
          fetchNotifications();
        }
        if (!isCancelled) {
          scheduleNextPoll();
        }
      }, pollIntervalMs);
    };

    if (typeof document === "undefined" || !document.hidden) {
      fetchNotifications();
    }
    scheduleNextPoll();

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        fetchNotifications();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [activeUserId, fetchNotifications]);

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);
  const toggleDrawer = useCallback(() => setIsOpen((prev) => !prev), []);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n));
      queryClient.setQueryData(queryKeys.notifications.list(), next);
      return next;
    });
    try {
      await api.markNotificationRead(id);
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications, queryClient]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, is_read: 1 }));
      queryClient.setQueryData(queryKeys.notifications.list(), next);
      return next;
    });
    try {
      await api.markAllNotificationsRead();
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications, queryClient]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read || n.is_read === 0).length,
    [notifications]
  );

  const stateValue = useMemo<NotificationStateContextType>(
    () => ({
      notifications,
      unreadCount,
      isOpen,
      loading,
      isRealtimeActive,
      permission,
      isSupported,
    }),
    [notifications, unreadCount, isOpen, loading, isRealtimeActive, permission, isSupported]
  );

  const actionsValue = useMemo<NotificationActionsContextType>(
    () => ({
      requestPermission,
      sendSystemNotification,
      sendTestNotification,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      markAsRead,
      markAllRead,
      refreshNotifications: fetchNotifications,
    }),
    [
      requestPermission,
      sendSystemNotification,
      sendTestNotification,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      markAsRead,
      markAllRead,
      fetchNotifications,
    ]
  );

  return (
    <NotificationActionsContext.Provider value={actionsValue}>
      <NotificationStateContext.Provider value={stateValue}>
        {children}
      </NotificationStateContext.Provider>
    </NotificationActionsContext.Provider>
  );
}

export function useNotificationState(): NotificationStateContextType {
  const ctx = useContext(NotificationStateContext);
  if (!ctx) {
    throw new Error("useNotificationState must be used within a NotificationProvider");
  }
  return ctx;
}

export function useNotificationActions(): NotificationActionsContextType {
  const ctx = useContext(NotificationActionsContext);
  if (!ctx) {
    throw new Error("useNotificationActions must be used within a NotificationProvider");
  }
  return ctx;
}

export function useNotifications(): NotificationContextType {
  const state = useNotificationState();
  const actions = useNotificationActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}
