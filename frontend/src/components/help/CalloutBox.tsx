"use client";

import React from "react";
import { AlertCircle, AlertTriangle, Info, Sparkles } from "lucide-react";

export interface CalloutBoxProps {
  type?: "tip" | "important" | "warning";
  children: React.ReactNode;
}

export function CalloutBox({ type = "tip", children }: CalloutBoxProps) {
  let containerClasses = "bg-canvas-soft border-hairline text-ink";
  let title = "Tip";
  let Icon = Sparkles;
  let iconClasses = "text-primary";

  if (type === "important") {
    containerClasses = "bg-primary/5 border-primary/20 text-ink";
    title = "Important";
    Icon = Info;
    iconClasses = "text-primary";
  } else if (type === "warning") {
    containerClasses = "bg-amber-500/10 border-amber-500/30 text-ink";
    title = "Warning";
    Icon = AlertTriangle;
    iconClasses = "text-amber-600 dark:text-amber-400";
  }

  return (
    <div className={`p-3.5 sm:p-4 rounded-xl border my-4 text-xs sm:text-[13px] leading-relaxed ${containerClasses}`}>
      <div className="flex items-center gap-2 font-bold mb-1">
        <Icon className={`h-4 w-4 shrink-0 ${iconClasses}`} />
        <span>{title}</span>
      </div>
      <div className="text-ink-secondary space-y-1">{children}</div>
    </div>
  );
}
