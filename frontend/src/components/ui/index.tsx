"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertTriangle, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";

export interface ButtonPrimaryProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  href?: string;
}

export function ButtonPrimary({
  children,
  size = "md",
  isLoading = false,
  className = "",
  disabled,
  href,
  ...props
}: ButtonPrimaryProps) {
  const sizeClasses = {
    sm: "h-8 px-3.5 text-xs font-medium rounded-md",
    md: "h-9 sm:h-10 px-4 text-xs sm:text-sm font-semibold rounded-md",
    lg: "h-11 sm:h-12 px-5 text-sm sm:text-base font-semibold rounded-lg",
  }[size];

  if (href) {
    return (
      <Link
        href={href}
        className={`inline-flex items-center justify-center font-medium btn-glass-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${className}`}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      className={`inline-flex items-center justify-center font-medium btn-glass-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${sizeClasses} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg
          className="animate-spin -ml-0.5 mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-white"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      )}
      {children}
    </button>
  );
}

export interface ButtonUtilityProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: "default" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  href?: string;
}

export function ButtonUtility({
  children,
  variant = "default",
  size = "md",
  className = "",
  disabled,
  href,
  ...props
}: ButtonUtilityProps) {
  const variantClasses = {
    default: "btn-glass-utility",
    danger: "bg-surface border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 active:bg-red-100",
    ghost: "bg-transparent text-ink-secondary hover:bg-canvas-soft",
  }[variant];

  const sizeClasses = {
    sm: "h-8 px-3.5 text-xs font-medium rounded-md",
    md: "h-9 sm:h-10 px-4 text-xs sm:text-sm font-semibold rounded-md",
    lg: "h-11 sm:h-12 px-5 text-sm sm:text-base font-semibold rounded-lg",
  }[size];

  if (href) {
    return (
      <Link
        href={href}
        className={`inline-flex items-center justify-center font-medium transition-all ${sizeClasses} ${variantClasses} ${className}`}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export interface FeatureCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hoverable?: boolean;
}

export function FeatureCard({
  children,
  hoverable = false,
  className = "",
  ...props
}: FeatureCardProps) {
  return (
    <div
      className={`bg-surface border border-hairline rounded-lg shadow-notion-card p-6 ${
        hoverable ? "hover:border-[#d0d0d0] dark:hover:border-[#444444] transition-colors" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export interface StatusWellProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: "amber" | "blue" | "green" | "rose" | "purple" | "neutral";
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  children?: React.ReactNode;
}

export function StatusWell({
  variant = "neutral",
  icon,
  title,
  description,
  badge,
  children,
  className = "",
  ...props
}: StatusWellProps) {
  const accentBorder = {
    amber: "border-amber-500/30 bg-amber-500/[0.04] dark:bg-amber-500/[0.06] dark:border-amber-500/20",
    blue: "border-blue-500/30 bg-blue-500/[0.04] dark:bg-blue-500/[0.06] dark:border-blue-500/20",
    green: "border-emerald-500/30 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06] dark:border-emerald-500/20",
    rose: "border-rose-500/30 bg-rose-500/[0.04] dark:bg-rose-500/[0.06] dark:border-rose-500/20",
    purple: "border-purple-500/30 bg-purple-500/[0.04] dark:bg-purple-500/[0.06] dark:border-purple-500/20",
    neutral: "border-hairline bg-surface",
  }[variant];

  return (
    <div
      className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-lg border ${accentBorder} shadow-2xs ${className}`}
      {...props}
    >
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        {icon && (
          <div className="h-7 w-7 rounded-md bg-canvas-soft border border-hairline flex items-center justify-center text-ink-secondary shrink-0 mt-0.5 sm:mt-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-xs font-semibold text-ink flex flex-wrap items-center gap-2">
            {title}
          </div>
          {description && (
            <div className="text-[11px] text-ink-muted mt-0.5 leading-relaxed">
              {description}
            </div>
          )}
          {children && (
            <div className="text-[11px] text-ink-muted mt-0.5 leading-relaxed">
              {children}
            </div>
          )}
        </div>
      </div>
      {badge && <div className="shrink-0 self-start sm:self-auto">{badge}</div>}
    </div>
  );
}

export interface CascadeContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  speed?: "normal" | "fast";
}

export function CascadeContainer({
  children,
  speed = "normal",
  className = "",
  ...props
}: CascadeContainerProps) {
  const groupClass = speed === "fast" ? "cascade-fast" : "cascade-group";
  return (
    <div className={`${groupClass} ${className}`} {...props}>
      {children}
    </div>
  );
}

export type StickerColor =
  | "green"
  | "teal"
  | "sky"
  | "purple"
  | "pink"
  | "orange"
  | "brown"
  | "gray"
  | "red";

export interface BadgePillProps {
  label: string;
  color?: StickerColor;
  className?: string;
}

export function BadgePill({ label, color = "gray", className = "" }: BadgePillProps) {
  const colorMap: Record<StickerColor, string> = {
    green: "bg-emerald-50 text-emerald-800 border-emerald-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    teal: "bg-teal-50 text-teal-800 border-teal-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/20 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    sky: "bg-sky-50 text-sky-800 border-sky-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    purple: "bg-purple-50 text-purple-800 border-purple-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    pink: "bg-pink-50 text-pink-800 border-pink-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-pink-500/10 dark:text-pink-300 dark:border-pink-500/20 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    orange: "bg-amber-50 text-amber-800 border-amber-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    brown: "bg-[#f4f1ec] text-[#594532] border-[#ded5c7] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-stone-500/10 dark:text-stone-300 dark:border-stone-500/20 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    gray: "bg-zinc-100 text-zinc-700 border-zinc-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-white/[0.05] dark:text-zinc-300 dark:border-white/[0.08] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    red: "bg-rose-50 text-rose-800 border-rose-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${colorMap[color]} ${className}`}
    >
      {label}
    </span>
  );
}

export interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function FormInput({ label, error, className = "", id, type, ...props }: FormInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const actualType = isPassword ? (showPassword ? "text" : "password") : type;
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="w-full flex flex-col space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-ink-secondary">
          {label}
        </label>
      )}
      <div className="relative w-full">
        <input
          id={inputId}
          type={actualType}
          className={`w-full rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface dark:bg-[#1a1a1a] focus:dark:bg-[#202020] px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:shadow-notion-card transition-all ${
            isPassword ? "pr-10" : ""
          } ${error ? "border-red-400 focus:border-red-500" : ""} ${className}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            tabIndex={-1}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink transition-colors cursor-pointer rounded-xs focus:outline-hidden"
            title={showPassword ? "Hide password" : "Show password"}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 text-ink-muted hover:text-ink" />
            ) : (
              <Eye className="h-4 w-4 text-ink-muted hover:text-ink" />
            )}
          </button>
        )}
      </div>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

export interface ModalCardProps {
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
  preventBackdropClose?: boolean;
  disableClose?: boolean;
}

export function ModalCard({
  isOpen = true,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
  className = "",
  preventBackdropClose = false,
  disableClose = false,
}: ModalCardProps) {
  const [mounted, setMounted] = useState(false);
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      setIsExiting(false);
    } else if (isRendered) {
      setIsExiting(true);
      const timer = setTimeout(() => {
        setIsRendered(false);
        setIsExiting(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isRendered]);

  const handleRequestClose = useCallback(() => {
    if (disableClose || isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      onClose();
      setIsRendered(false);
      setIsExiting(false);
    }, 200);
  }, [disableClose, isExiting, onClose]);

  // Lock body scroll and handle Escape key while modal is open
  useEffect(() => {
    if (!isRendered || !mounted) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disableClose) {
        handleRequestClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRendered, mounted, disableClose, handleRequestClose]);

  if (!isRendered || !mounted) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (preventBackdropClose || disableClose || isExiting) {
      // Prevent accidental dismissal of modal on outside click
      return;
    }
    handleRequestClose();
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-xs ${
        isExiting ? "animate-modal-backdrop-out" : "animate-modal-backdrop-in"
      }`}
    >
      <div
        className="fixed inset-0"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />
      <div
        className={`relative w-full ${maxWidth} max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-surface rounded-xl shadow-notion-modal border border-hairline z-10 overflow-hidden ${
          isExiting ? "animate-modal-content-out" : "animate-modal-content-in"
        } ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-card-title"
      >
        {/* Sticky Header */}
        <div className="flex items-center justify-between px-3.5 py-2.5 sm:px-5 sm:py-3.5 border-b border-hairline bg-surface shrink-0">
          <h2 id="modal-card-title" className="text-xs sm:text-sm md:text-base font-bold text-ink truncate pr-2">
            {title}
          </h2>
          {!disableClose && (
            <button
              type="button"
              onClick={handleRequestClose}
              className="text-ink-muted hover:text-ink p-1 rounded-md hover:bg-canvas-soft transition-colors cursor-pointer shrink-0 text-xs sm:text-sm"
              title="Close modal"
            >
              ✕
            </button>
          )}
        </div>
        {/* Scrollable Content Body */}
        <div className="overflow-y-auto px-3.5 py-3 sm:px-5 sm:py-4 flex-1 overscroll-contain">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export * from "./Skeleton";
export { useConfirm, ConfirmProvider } from "@/lib/ConfirmContext";
export type { ConfirmOptions, ConfirmVariant } from "@/lib/ConfirmContext";

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "primary" | "info";
  destructive?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirmation",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "primary",
  destructive = false,
}: ConfirmModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      setIsExiting(false);
    } else if (isRendered) {
      setIsExiting(true);
      const timer = setTimeout(() => {
        setIsRendered(false);
        setIsExiting(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isRendered]);

  const handleRequestClose = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      onClose();
      setIsRendered(false);
      setIsExiting(false);
    }, 200);
  }, [isExiting, onClose]);

  const handleRequestConfirm = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    setTimeout(() => {
      onConfirm();
      setIsRendered(false);
      setIsExiting(false);
    }, 200);
  }, [isExiting, onConfirm]);

  useEffect(() => {
    if (!isRendered || !mounted) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleRequestClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleRequestConfirm();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRendered, mounted, handleRequestClose, handleRequestConfirm]);

  if (!isRendered || !mounted) return null;

  const isDanger = variant === "danger" || destructive;
  const isWarning = variant === "warning";

  let icon = <AlertCircle className="h-5 w-5 text-primary" />;
  let iconBgClass = "bg-[#edf5fd] text-primary border border-primary/20";
  let confirmBtnClass = "bg-primary hover:bg-primary-active text-white";

  if (isDanger) {
    icon = <AlertTriangle className="h-5 w-5 text-red-600" />;
    iconBgClass = "bg-red-50 text-red-600 border border-red-200/60";
    confirmBtnClass = "bg-red-600 hover:bg-red-700 text-white";
  } else if (isWarning) {
    icon = <AlertTriangle className="h-5 w-5 text-amber-600" />;
    iconBgClass = "bg-amber-50 text-amber-600 border border-amber-200/60";
    confirmBtnClass = "bg-amber-600 hover:bg-amber-700 text-white";
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 ${
        isExiting ? "animate-modal-backdrop-out" : "animate-modal-backdrop-in"
      }`}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity"
        onClick={handleRequestClose}
        aria-hidden="true"
      />
      <div
        className={`relative w-full max-w-md bg-surface rounded-xl shadow-notion-modal border border-hairline z-10 overflow-hidden p-5 sm:p-6 space-y-4 ${
          isExiting ? "animate-modal-content-out" : "animate-modal-content-in"
        }`}
      >
        <div className="flex items-start gap-3.5">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${iconBgClass}`}>
            {icon}
          </div>
          <div className="space-y-1.5 min-w-0 flex-1">
            <h3 className="text-base font-bold text-ink leading-tight">{title}</h3>
            <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-hairline">
          <button
            type="button"
            onClick={handleRequestClose}
            className="px-3.5 py-1.5 rounded-md border border-hairline bg-surface hover:bg-canvas-soft text-ink-secondary hover:text-ink text-xs sm:text-sm font-medium transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleRequestConfirm}
            autoFocus
            className={`px-4 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors shadow-xs ${confirmBtnClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

