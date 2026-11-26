"use client";

import React from "react";

export interface UIReferencePillProps {
  label: string;
  variant?:
    | "primary"
    | "utility"
    | "danger"
    | "status-green"
    | "status-amber"
    | "status-orange"
    | "field";
}

export function UIReferencePill({ label, variant = "utility" }: UIReferencePillProps) {
  let styleClasses = "bg-surface border-hairline text-ink font-medium";
  let dotClass: string | null = null;

  switch (variant) {
    case "primary":
      styleClasses = "bg-primary text-on-primary border-transparent font-medium";
      break;
    case "field":
      styleClasses = "bg-canvas-soft border-hairline text-ink-secondary font-mono";
      break;
    case "danger":
      styleClasses = "bg-surface border-hairline text-ink font-medium";
      dotClass = "bg-red-500";
      break;
    case "status-green":
      styleClasses = "bg-surface border-hairline text-ink font-medium";
      dotClass = "bg-accent-green";
      break;
    case "status-amber":
      styleClasses = "bg-surface border-hairline text-ink font-medium";
      dotClass = "bg-amber-500";
      break;
    case "status-orange":
      styleClasses = "bg-surface border-hairline text-ink font-medium";
      dotClass = "bg-accent-orange";
      break;
    case "utility":
    default:
      styleClasses = "bg-surface border-hairline text-ink font-medium";
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs border text-xs leading-tight select-none align-middle ${styleClasses}`}
    >
      {dotClass && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />}
      <span>{label}</span>
    </span>
  );
}
