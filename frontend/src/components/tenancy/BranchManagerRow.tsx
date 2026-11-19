"use client";

import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { BadgePill } from "@/components/ui";

export interface BranchManagerRowProps {
  manager: {
    id: string;
    full_name?: string;
    email?: string;
    is_active?: number;
    branch_id?: string;
  };
  onEdit: (manager: any) => void;
  onDelete: (manager: any) => void;
}

export const BranchManagerRow: React.FC<BranchManagerRowProps> = ({ manager, onEdit, onDelete }) => {
  return (
    <div className="flex items-center justify-between gap-2 bg-surface p-2 rounded-md border border-hairline text-xs">
      <div className="flex items-center gap-2 truncate">
        <div className="h-6 w-6 rounded-full bg-canvas-soft border border-hairline text-primary flex items-center justify-center font-bold text-[11px] shrink-0 font-mono">
          {manager.full_name?.charAt(0) || "M"}
        </div>
        <div className="truncate">
          <div className="font-bold text-ink truncate">{manager.full_name}</div>
          <div className="text-[11px] text-ink-muted truncate">{manager.email}</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <BadgePill
          label={manager.is_active === 0 ? "Inactive" : "Active"}
          color={manager.is_active === 0 ? "orange" : "green"}
        />
        <button
          type="button"
          onClick={() => onEdit(manager)}
          className="p-1.5 hover:bg-canvas-soft text-ink-muted hover:text-ink rounded transition-colors"
          title="Edit Manager"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(manager)}
          className="p-1.5 hover:bg-red-50 text-ink-muted hover:text-red-600 rounded transition-colors"
          title="Delete Manager"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
