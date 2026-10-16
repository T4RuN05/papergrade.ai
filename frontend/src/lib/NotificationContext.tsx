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
  const isInitialMount = useRef(true);

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
            const newUnread = data.filter((n) => !existingIds.has(n.id) && (!n.is_read || n.is_read === 0));
            newUnread.forEach((n) => {
              toast.info(n.message, { title: n.title });
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
  }, [toast]);

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
    // Optimistic UI update
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
    // Optimistic UI update
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
