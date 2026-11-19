"use client";

import React from "react";
import { Inbox } from "lucide-react";

export interface NotificationEmptyStateProps {
  activeTab: "unread" | "all";
}

export const NotificationEmptyState: React.FC<NotificationEmptyStateProps> = ({ activeTab }) => {
  return (
    <div className="flex flex-col items-center justify-center h-72 text-center px-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-canvas-soft text-ink-muted mb-3 border border-hairline">
        <Inbox className="h-6 w-6 text-ink-faint" />
      </div>
      <h3 className="text-xs font-bold text-ink">
        {activeTab === "unread" ? "No unread notifications" : "No notifications yet"}
      </h3>
      <p className="text-[11px] text-ink-muted mt-1 max-w-xs">
        {activeTab === "unread"
          ? "You're all caught up! Great job staying on top of all evaluations."
          : "When exam submissions, grades, or revaluation reviews are processed, you'll see them here."}
      </p>
    </div>
  );
};
