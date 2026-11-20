"use client";

import React from "react";

export interface UIReferencePillProps {
  label: string;
  variant?: "primary" | "utility" | "danger" | "status-green" | "status-amber" | "status-orange" | "field";
}

export function UIReferencePill({ label, variant = "utility" }: UIReferencePillProps) {
  let styleClasses = "bg-surface border border-hairline text-ink";

  switch (variant) {
    case "primary":
      styleClasses = "bg-primary text-white border-transparent shadow-2xs font-semibold";
      break;
    case "danger":
      styleClasses = "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-200 dark:border-red-800 font-semibold";
      break;
    case "status-green":
      styleClasses = "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 font-semibold";
      break;
    case "status-amber":
      styleClasses = "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-semibold";
      break;
    case "status-orange":
      styleClasses = "bg-orange-50 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border-orange-300 dark:border-orange-700 font-semibold";
      break;
    case "field":
      styleClasses = "bg-canvas-soft border-hairline text-ink-secondary font-mono";
      break;
    case "utility":
    default:
      styleClasses = "bg-surface border-hairline text-ink font-semibold shadow-2xs";
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] sm:text-xs leading-none select-none tracking-tight align-middle mx-1 ${styleClasses}`}
    >
      {label}
    </span>
  );
}
