"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  X,
} from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info" | "loading";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title?: string;
  duration?: number; // in milliseconds; 0 or Infinity for persistent
  action?: ToastAction;
  reverse?: boolean; // reverse loading countdown (100% -> 0%, defaults to true)
  origin?: "left" | "right"; // origin anchor for progress animation (defaults to 'left')
}

export interface ToastItem extends ToastOptions {
  id: string;
  type: ToastType;
  message: string;
  createdAt: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (type: ToastType, message: string, options?: ToastOptions) => string;
  dismissToast: (id: string) => void;
  dismissAll: () => void;
  toast: {
    success: (message: string, options?: ToastOptions) => string;
    error: (message: string, options?: ToastOptions) => string;
    warning: (message: string, options?: ToastOptions) => string;
    info: (message: string, options?: ToastOptions) => string;
    loading: (message: string, options?: ToastOptions) => string;
    dismiss: (id: string) => void;
    dismissAll: () => void;
    promise: <T>(
      promise: Promise<T>,
      messages: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((err: any) => string);
      },
      options?: ToastOptions
    ) => Promise<T>;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const QUEUED_TOAST_KEY = "pg_queued_toast";

/**
 * Queue a toast to be displayed immediately after a full page redirect or reload
 * (e.g. after login / logout when using window.location.href)
 */
export function queueToast(toastData: {
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
  reverse?: boolean;
  origin?: "left" | "right";
}) {
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(QUEUED_TOAST_KEY, JSON.stringify(toastData));
      localStorage.setItem(QUEUED_TOAST_KEY, JSON.stringify(toastData));
    } catch {
      // Storage unavailable or disabled
    }
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, options?: ToastOptions): string => {
      const id = "toast_" + Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = {
        id,
        type,
        message,
        title: options?.title,
        duration: options?.duration !== undefined ? options.duration : type === "loading" ? 0 : 4000,
        action: options?.action,
        reverse: options?.reverse !== undefined ? options.reverse : true,
        origin: options?.origin || "left",
        createdAt: Date.now(),
      };

      setToasts((prev) => {
        // Keep up to 5 concurrent toasts to prevent clutter
        const filtered = prev.slice(-4);
        return [...filtered, newToast];
      });

      return id;
    },
    []
  );

  const pathname = usePathname();

  const processQueuedToast = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const queued =
        sessionStorage.getItem(QUEUED_TOAST_KEY) ||
        localStorage.getItem(QUEUED_TOAST_KEY);
      if (queued) {
        sessionStorage.removeItem(QUEUED_TOAST_KEY);
        localStorage.removeItem(QUEUED_TOAST_KEY);
        const parsed = JSON.parse(queued);
        if (parsed && parsed.message) {
          setTimeout(() => {
            showToast(parsed.type || "info", parsed.message, {
              title: parsed.title,
              duration: parsed.duration || 4500,
              reverse: parsed.reverse,
              origin: parsed.origin,
            });
          }, 80);
        }
      }
    } catch {
      // Ignore parse error
    }
  }, [showToast]);

  // Check for queued toast on initial mount, route change, and storage events
  useEffect(() => {
    processQueuedToast();
  }, [pathname, processQueuedToast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (e: StorageEvent) => {
      if (e.key === QUEUED_TOAST_KEY && e.newValue) {
        processQueuedToast();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [processQueuedToast]);

  const toast = {
    success: (message: string, options?: ToastOptions) =>
      showToast("success", message, options),
    error: (message: string, options?: ToastOptions) =>
      showToast("error", message, options),
    warning: (message: string, options?: ToastOptions) =>
      showToast("warning", message, options),
    info: (message: string, options?: ToastOptions) =>
      showToast("info", message, options),
    loading: (message: string, options?: ToastOptions) =>
      showToast("loading", message, options),
    dismiss: dismissToast,
    dismissAll,
    promise: async <T,>(
      promise: Promise<T>,
      messages: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((err: any) => string);
      },
      options?: ToastOptions
    ): Promise<T> => {
      const toastId = showToast("loading", messages.loading, {
        ...options,
        duration: 0,
      });

      try {
        const result = await promise;
        dismissToast(toastId);
        const successMsg =
          typeof messages.success === "function"
            ? messages.success(result)
            : messages.success;
        showToast("success", successMsg, options);
        return result;
      } catch (err: any) {
        dismissToast(toastId);
        const errorMsg =
          typeof messages.error === "function"
            ? messages.error(err)
            : messages.error || err?.message || "Operation failed";
        showToast("error", errorMsg, options);
        throw err;
      }
    },
  };

  const [isClientMounted, setIsClientMounted] = useState(false);
  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        dismissToast,
        dismissAll,
        toast,
      }}
    >
      {children}
      {isClientMounted && typeof document !== "undefined"
        ? createPortal(
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />,
            document.body
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

/**
 * Toast item component designed according to Notion Design System:
 * - Surface #ffffff with hairline border #e6e6e6
 * - Level-1 / Level-2 layered micro-shadow
 * - NotionInter typography and Sticker palette accents
 * - Hover pauses auto-dismiss timer
 */
function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const remainingTimeRef = useRef<number>(toast.duration || 4000);
  const startTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleDismiss = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(toast.id);
    }, 180);
  }, [isExiting, onDismiss, toast.id]);

  useEffect(() => {
    if (!toast.duration || toast.duration <= 0) return;

    if (!isHovered) {
      startTimeRef.current = Date.now();
      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, remainingTimeRef.current + 50);
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        const elapsed = Date.now() - startTimeRef.current;
        remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isHovered, toast.duration, toast.id, handleDismiss]);

  const getIconAndColors = () => {
    switch (toast.type) {
      case "success":
        return {
          icon: <CheckCircle2 className="h-4 w-4 text-[#1aae39]" />,
          badgeBg: "bg-emerald-50 border border-emerald-200/70",
          barColor: "bg-[#1aae39]",
          barGradient: "from-emerald-500 via-emerald-400 to-teal-400",
          defaultTitle: "Success",
        };
      case "error":
        return {
          icon: <AlertCircle className="h-4 w-4 text-red-600" />,
          badgeBg: "bg-red-50 border border-red-200/70",
          barColor: "bg-red-500",
          barGradient: "from-red-600 via-rose-500 to-orange-400",
          defaultTitle: "Error",
        };
      case "warning":
        return {
          icon: <AlertTriangle className="h-4 w-4 text-[#dd5b00]" />,
          badgeBg: "bg-amber-50 border border-amber-200/70",
          barColor: "bg-[#dd5b00]",
          barGradient: "from-amber-500 via-amber-400 to-yellow-400",
          defaultTitle: "Notice",
        };
      case "loading":
        return {
          icon: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
          badgeBg: "bg-blue-50 border border-primary/20",
          barColor: "bg-primary",
          barGradient: "from-primary via-blue-500 to-indigo-400",
          defaultTitle: "Processing",
        };
      case "info":
      default:
        return {
          icon: <Info className="h-4 w-4 text-primary" />,
          badgeBg: "bg-sky-50 border border-sky-200/70",
          barColor: "bg-primary",
          barGradient: "from-primary via-sky-400 to-cyan-400",
          defaultTitle: "Information",
        };
    }
  };

  const style = getIconAndColors();
  const displayTitle = toast.title || (toast.type === "info" ? undefined : style.defaultTitle);
  const isReverse = toast.reverse !== false;
  const originClass = toast.origin === "right" ? "origin-right" : "origin-left";

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="alert"
      className={`pointer-events-auto relative w-full overflow-hidden rounded-xl border border-hairline bg-surface p-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.03)] transition-all duration-200 ${
        isExiting ? "toast-slide-out" : "toast-slide-in"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Notion sticker icon pill */}
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-2xs ${style.badgeBg}`}
        >
          {style.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pt-0.5">
          {displayTitle && (
            <h4 className="text-xs font-semibold text-ink tracking-tight mb-0.5">
              {displayTitle}
            </h4>
          )}
          <p className="text-xs text-ink-secondary leading-relaxed break-words">
            {toast.message}
          </p>

          {toast.action && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  handleDismiss();
                }}
                className="text-xs font-semibold text-primary hover:text-primary-active hover:underline transition-colors"
              >
                {toast.action.label}
              </button>
            </div>
          )}
        </div>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 p-1 rounded-md text-ink-faint hover:text-ink hover:bg-canvas-soft transition-colors"
          aria-label="Dismiss toast"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Auto-dismiss reverse loading progress track */}
      {toast.duration && toast.duration > 0 ? (
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/[0.05] overflow-hidden rounded-b-xl">
          <div
            className={`h-full w-full bg-gradient-to-r ${style.barGradient} ${originClass}`}
            style={{
              animationName: isReverse ? "toastReverseProgress" : "toastForwardProgress",
              animationDuration: `${toast.duration}ms`,
              animationTimingFunction: "linear",
              animationFillMode: "forwards",
              animationPlayState: isHovered ? "paused" : "running",
            }}
            onAnimationEnd={handleDismiss}
          />
        </div>
      ) : toast.type === "loading" ? (
        /* Indeterminate loading bar for active processing toasts */
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/[0.05] overflow-hidden rounded-b-xl">
          <div
            className={`h-full w-2/5 bg-gradient-to-r ${style.barGradient} rounded-full animate-toast-loading`}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Toast viewport container, anchored at bottom-right of the screen
 */
function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-[99999] flex flex-col-reverse gap-2.5 w-full max-w-sm sm:max-w-md pointer-events-none px-3 sm:px-0"
      style={{ zIndex: 99999 }}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
