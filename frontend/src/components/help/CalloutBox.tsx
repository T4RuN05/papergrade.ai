"use client";

import React from "react";
import { AlertTriangle, Info, Lightbulb } from "lucide-react";

export interface CalloutBoxProps {
  type?: "tip" | "important" | "warning";
  children: React.ReactNode;
}

export function CalloutBox({ type = "tip", children }: CalloutBoxProps) {
  const config = {
    tip: {
      borderAccent: "border-l-ink-faint",
      icon: Lightbulb,
      iconClass: "text-ink-muted",
      titleClass: "text-ink",
      title: "Tip",
    },
    important: {
      borderAccent: "border-l-primary",
      icon: Info,
      iconClass: "text-primary",
      titleClass: "text-primary",
      title: "Important",
    },
    warning: {
      borderAccent: "border-l-ink-secondary",
      icon: AlertTriangle,
      iconClass: "text-ink",
      titleClass: "text-ink",
      title: "Warning",
    },
  }[type];

  const Icon = config.icon;

  return (
    <div
      className={`rounded-lg border border-hairline border-l-[3px] ${config.borderAccent} bg-surface p-3.5 sm:p-4 text-[13px] sm:text-sm leading-relaxed`}
    >
      <div className={`flex items-center gap-2 font-semibold text-xs mb-1 ${config.titleClass}`}>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${config.iconClass}`} />
        <span>{config.title}</span>
      </div>
      <div className="text-ink-secondary space-y-1">{children}</div>
    </div>
  );
}
