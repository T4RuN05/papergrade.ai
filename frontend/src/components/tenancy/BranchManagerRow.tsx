"use client";

import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { StaffAvatar } from "./StaffAvatar";

export interface BranchManagerRowProps {
  manager: {
    id: string;
    full_name?: string;
    email?: string;
    is_active?: number;
    branch_id?: string;
    google_picture?: string | null;
    google_email?: string | null;
  };
  onEdit: (manager: any) => void;
  onDelete: (manager: any) => void;
}

export const BranchManagerRow: React.FC<BranchManagerRowProps> = ({ manager, onEdit, onDelete }) => {
  const isActive = manager.is_active !== 0;

  return (
    <div className="flex items-center justify-between gap-2 bg-surface p-2.5 rounded-md border border-hairline text-xs min-w-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <StaffAvatar
          name={manager.full_name}
          pictureUrl={manager.google_picture}
          fallback="M"
          size="sm"
        />
        <div className="min-w-0">
          <div className="font-semibold text-ink truncate">{manager.full_name}</div>
          <div className="text-[11px] text-ink-muted truncate">{manager.email}</div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs bg-canvas-soft border border-hairline text-[11px] font-medium text-ink-secondary mr-0.5">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isActive ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          <span className="hidden sm:inline">{isActive ? "Active" : "Inactive"}</span>
        </span>
        <button
          type="button"
          onClick={() => onEdit(manager)}
          className="p-1.5 hover:bg-canvas-soft text-ink-muted hover:text-ink rounded-md transition-colors cursor-pointer"
          title="Edit Manager"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(manager)}
          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 text-ink-muted hover:text-red-600 rounded-md transition-colors cursor-pointer"
          title="Delete Manager"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
