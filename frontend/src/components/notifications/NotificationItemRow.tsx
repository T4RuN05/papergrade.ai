"use client";

import React from "react";
import {
  Check,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  KeyRound,
  ClipboardCheck,
  Scale,
  Wrench,
  Award,
  Cpu,
  TimerReset,
  Clock,
  BookOpen,
  GraduationCap,
  UploadCloud,
  Lock,
  FileCheck2,
} from "lucide-react";
import type { AppNotification } from "@/lib/NotificationContext";

export interface NotificationItemRowProps {
  notification: AppNotification;
  isClearing: boolean;
  cascadeDelay?: string;
  onMarkRead: (id: string) => void;
  onLinkClick: (url: string) => void;
}

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

function getNotificationIconMeta(type?: string, title = "", message = ""): {
  icon: React.ReactNode;
  containerClass: string;
} {
  const normalizedType = (type || "").toUpperCase().trim();
  const text = `${title} ${message}`.toLowerCase();

  if (
    normalizedType === "PASSWORD_RESET_SUCCESS" ||
    text.includes("password changed successfully") ||
    text.includes("password was successfully reset")
  ) {
    return {
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />,
      containerClass: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-800/60",
    };
  }

  if (
    normalizedType === "PASSWORD_RESET_APPROVED" ||
    text.includes("password reset request approved") ||
    text.includes("approved your password reset")
  ) {
    return {
      icon: <ShieldCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />,
      containerClass: "bg-blue-50 dark:bg-blue-950/40 border-blue-200/80 dark:border-blue-800/60",
    };
  }

  if (
    normalizedType === "PASSWORD_RESET_REQUEST" ||
    text.includes("password reset request") ||
    text.includes("requested a password reset")
  ) {
    return {
      icon: <KeyRound className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />,
      containerClass: "bg-amber-50 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-800/60",
    };
  }

  if (
    normalizedType === "REVALUATION_DECIDED" ||
    text.includes("revaluation resolved") ||
    text.includes("revaluation decided") ||
    text.includes("appeal has been resolved")
  ) {
    return {
      icon: <ClipboardCheck className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />,
      containerClass: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/80 dark:border-indigo-800/60",
    };
  }

  if (
    normalizedType === "REVALUATION_REQUESTED" ||
    normalizedType === "REVALUATION_REQUEST" ||
    text.includes("revaluation appeal") ||
    text.includes("submitted an appeal") ||
    text.includes("revaluation request")
  ) {
    return {
      icon: <Scale className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />,
      containerClass: "bg-orange-50 dark:bg-orange-950/40 border-orange-200/80 dark:border-orange-800/60",
    };
  }

  if (
    normalizedType === "REPORT_RESOLVED" ||
    normalizedType === "REPORT_RECEIVED" ||
    text.includes("technical issue resolved") ||
    text.includes("report has been marked resolved")
  ) {
    return {
      icon: <Wrench className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />,
      containerClass: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-800/60",
    };
  }

  if (
    normalizedType === "RESULT_PUBLISHED" ||
    text.includes("results published") ||
    text.includes("score breakdown") ||
    text.includes("revaluation window open")
  ) {
    return {
      icon: <Award className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />,
      containerClass: "bg-amber-50 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-800/60",
    };
  }

  if (
    normalizedType === "GRADING_COMPLETED" ||
    text.includes("grading complete") ||
    text.includes("ai grading completed") ||
    text.includes("evaluation complete")
  ) {
    return {
      icon: <Cpu className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />,
      containerClass: "bg-purple-50 dark:bg-purple-950/40 border-purple-200/80 dark:border-purple-800/60",
    };
  }

  if (
    normalizedType === "WINDOW_REOPENED" ||
    text.includes("window reopened") ||
    text.includes("window was reopened")
  ) {
    return {
      icon: <TimerReset className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />,
      containerClass: "bg-sky-50 dark:bg-sky-950/40 border-sky-200/80 dark:border-sky-800/60",
    };
  }

  if (
    normalizedType === "WINDOW_CLOSED" ||
    text.includes("window closed") ||
    text.includes("window was closed")
  ) {
    return {
      icon: <Lock className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />,
      containerClass: "bg-red-50 dark:bg-red-950/40 border-red-200/80 dark:border-red-800/60",
    };
  }

  if (
    normalizedType === "WINDOW_EXTENDED" ||
    text.includes("window extended") ||
    text.includes("window was extended")
  ) {
    return {
      icon: <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />,
      containerClass: "bg-amber-50 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-800/60",
    };
  }

  if (
    normalizedType === "WINDOW_OPENED" ||
    text.includes("window opened") ||
    text.includes("window was opened")
  ) {
    return {
      icon: <BookOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />,
      containerClass: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-800/60",
    };
  }

  if (
    normalizedType === "SUBMISSION_RECEIVED" ||
    text.includes("submission received") ||
    text.includes("submitted their exam")
  ) {
    return {
      icon: <UploadCloud className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />,
      containerClass: "bg-teal-50 dark:bg-teal-950/40 border-teal-200/80 dark:border-teal-800/60",
    };
  }

  return {
    icon: <FileCheck2 className="h-3.5 w-3.5 text-primary" />,
    containerClass: "bg-primary/10 border-primary/20",
  };
}

export const NotificationItemRow: React.FC<NotificationItemRowProps> = ({
  notification,
  isClearing,
  cascadeDelay,
  onMarkRead,
  onLinkClick,
}) => {
  const isUnread = !notification.is_read || notification.is_read === 0;
  const iconMeta = getNotificationIconMeta(notification.type, notification.title, notification.message);

  return (
    <div
      style={cascadeDelay ? { animationDelay: cascadeDelay } : undefined}
      className={`p-4 transition-colors relative flex gap-3 ${
        isClearing ? "animate-notification-slide-out" : ""
      } ${
        isUnread ? "bg-primary/[0.03] hover:bg-primary/[0.06]" : "hover:bg-canvas-soft/60"
      }`}
    >
      {/* Icon */}
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-2xs ${iconMeta.containerClass}`}
      >
        {iconMeta.icon}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`text-xs truncate ${
                isUnread ? "font-bold text-ink" : "font-semibold text-ink-secondary"
              }`}
            >
              {notification.title}
            </span>
            {isUnread && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
          </div>
          <span className="text-[10px] text-ink-faint shrink-0 whitespace-nowrap">
            {formatRelativeTime(notification.created_at)}
          </span>
        </div>

        <p className="text-xs text-ink-secondary mt-1 leading-relaxed break-words">
          {notification.message}
        </p>

        {/* Actions */}
        <div className="mt-2.5 flex items-center justify-between gap-2 pt-1 border-t border-hairline/40">
          {notification.link_url ? (
            <button
              type="button"
              onClick={() => onLinkClick(notification.link_url!)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-active hover:underline"
            >
              View Details <ExternalLink className="h-3 w-3" />
            </button>
          ) : (
            <span />
          )}

          {isUnread && (
            <button
              type="button"
              onClick={() => onMarkRead(notification.id)}
              disabled={isClearing}
              className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink px-2 py-0.5 rounded-sm hover:bg-canvas-soft border border-hairline transition-colors cursor-pointer disabled:opacity-50"
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
};
