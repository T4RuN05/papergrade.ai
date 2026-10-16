"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";

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
    sm: "px-4 py-1.5 text-xs",
    md: "px-6 py-2.5 text-sm",
    lg: "px-8 py-3 text-base",
  }[size];

  if (href) {
    return (
      <Link
        href={href}
        className={`inline-flex items-center justify-center font-medium rounded-full bg-primary hover:bg-primary-active active:bg-primary-active text-white transition-all shadow-sm ${sizeClasses} ${className}`}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      className={`inline-flex items-center justify-center font-medium rounded-full bg-primary hover:bg-primary-active active:bg-primary-active text-white transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
  size = "sm",
  className = "",
  disabled,
  href,
  ...props
}: ButtonUtilityProps) {
  const variantClasses = {
    default: "bg-surface border border-hairline text-ink hover:bg-canvas-soft active:bg-[#eee]",
    danger: "bg-surface border border-red-200 text-red-600 hover:bg-red-50 active:bg-red-100",
    ghost: "bg-transparent text-ink-secondary hover:bg-canvas-soft",
  }[variant];

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs rounded-md",
    md: "px-4 py-2 text-sm rounded-md",
    lg: "px-5 py-2.5 text-base rounded-lg",
  }[size];

  if (href) {
    return (
      <Link
        href={href}
        className={`inline-flex items-center justify-center font-medium transition-colors ${sizeClasses} ${variantClasses} ${className}`}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${variantClasses} ${className}`}
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
        hoverable ? "hover:border-[#d0d0d0] transition-colors" : ""
      } ${className}`}
      {...props}
    >
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
  | "gray";

export interface BadgePillProps {
  label: string;
  color?: StickerColor;
  className?: string;
}

export function BadgePill({ label, color = "gray", className = "" }: BadgePillProps) {
  const colorMap: Record<StickerColor, string> = {
    green: "bg-[#eaf7ed] text-[#1aae39] border-[#c2ecd0]",
    teal: "bg-[#e6f6f6] text-[#2a9d99] border-[#bee7e5]",
    sky: "bg-[#edf5fd] text-[#0075de] border-[#bee0fc]",
    purple: "bg-[#f5eefc] text-[#793caf] border-[#dfcbf6]",
    pink: "bg-[#ffeff8] text-[#c92a95] border-[#fbcce7]",
    orange: "bg-[#fef4ea] text-[#dd5b00] border-[#fed8b8]",
    brown: "bg-[#f5efe8] text-[#523410] border-[#d8c5b0]",
    gray: "bg-[#f1f1ef] text-[#615d59] border-[#e2e1de]",
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

export function FormInput({ label, error, className = "", id, ...props }: FormInputProps) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="w-full flex flex-col space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-ink-secondary">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded-xs border border-[#dddddd] bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:shadow-notion-card transition-all ${
          error ? "border-red-400 focus:border-red-500" : ""
        } ${className}`}
        {...props}
      />
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

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll and handle Escape key while modal is open
  useEffect(() => {
    if (!isOpen || !mounted) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disableClose) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, mounted, onClose, disableClose]);

  if (!isOpen || !mounted) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (preventBackdropClose || disableClose) {
      // Prevent accidental dismissal of modal on outside click
      return;
    }
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="fixed inset-0"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />
      <div
        className={`relative w-full ${maxWidth} max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-surface rounded-xl shadow-notion-modal border border-hairline z-10 overflow-hidden ${className}`}
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
              onClick={onClose}
              className="text-ink-muted hover:text-ink p-1 rounded-md hover:bg-canvas-soft transition-colors cursor-pointer shrink-0 text-xs sm:text-sm"
              title="Close modal immediately"
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, onConfirm]);

  if (!isOpen || !mounted) return null;

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
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md bg-surface rounded-xl shadow-notion-modal border border-hairline z-10 overflow-hidden p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-150">
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
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-md border border-hairline bg-surface hover:bg-canvas-soft text-ink-secondary hover:text-ink text-xs sm:text-sm font-medium transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
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

