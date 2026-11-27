"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export interface PageBackBarProps {
  /** Destination route for backing navigation. Omit if passing onBack. */
  backHref?: string;
  /** Callback handler when backing navigation uses router.back() or custom logic. */
  onBack?: () => void;
  /** Canonical "Back to <Destination>" label rendered identically on desktop & mobile. */
  backLabel: string;
  /** Optional disable state (e.g. during form submission). */
  disabled?: boolean;
  /** Optional right-hand primary or utility actions aligned cleanly across desktop & mobile. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Canonical fixed backing navigation strip shared across all roles (Admin, Faculty, Student, Legal).
 * Guarantees identical button chrome, height (32px), label formatting, and horizontal margin
 * alignment on both desktop and mobile viewports.
 */
export function PageBackBar({
  backHref,
  onBack,
  backLabel,
  disabled = false,
  actions,
  className = "",
}: PageBackBarProps) {
  const buttonClasses = `notion-btn-utility !min-h-8 h-8 px-3 text-xs font-medium shrink-0 whitespace-nowrap ${
    disabled ? "pointer-events-none opacity-50" : ""
  }`;

  const buttonContent = (
    <>
      <ArrowLeft className="h-3.5 w-3.5 text-ink-muted shrink-0" />
      <span>{backLabel}</span>
    </>
  );

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-hairline ${className}`}
    >
      {backHref ? (
        <Link href={backHref} className={buttonClasses}>
          {buttonContent}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onBack}
          disabled={disabled}
          className={buttonClasses}
        >
          {buttonContent}
        </button>
      )}

      {actions && (
        <div className="flex flex-wrap items-center gap-2 ml-auto sm:ml-0">
          {actions}
        </div>
      )}
    </div>
  );
}
