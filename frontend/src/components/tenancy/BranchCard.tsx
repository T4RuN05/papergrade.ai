"use client";

import React from "react";
import { MapPin, Plus, ArrowRight } from "lucide-react";
import { BranchManagerRow } from "./BranchManagerRow";

export interface BranchCardProps {
  branch: {
    id: string;
    institute_id: string;
    name: string;
    code: string;
    city: string;
  };
  managers: any[];
  onAssignManager: (branchId: string) => void;
  onEditManager: (manager: any) => void;
  onDeleteManager: (manager: any) => void;
  onSelectBranch: (branchId: string) => void;
}

export const BranchCard: React.FC<BranchCardProps> = ({
  branch,
  managers,
  onAssignManager,
  onEditManager,
  onDeleteManager,
  onSelectBranch,
}) => {
  const branchManagers = managers.filter((m) => m.branch_id === branch.id);

  return (
    <div className="rounded-lg border border-hairline bg-canvas-soft p-4 space-y-4 flex flex-col justify-between min-w-0">
      <div className="space-y-3 min-w-0">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-ink flex items-center gap-1.5 min-w-0">
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">{branch.name}</span>
            </h4>
            <div className="text-xs text-ink-muted mt-0.5 truncate">
              City: <span className="font-medium text-ink-secondary">{branch.city}</span>
            </div>
          </div>
          <span className="inline-flex items-center px-2 py-0.5 rounded-xs bg-surface border border-hairline font-mono text-[11px] font-medium text-ink-secondary shrink-0">
            {branch.code}
          </span>
        </div>

        {/* Assigned Branch Managers */}
        <div className="pt-2.5 border-t border-hairline space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span className="font-medium">Assigned Branch Managers</span>
            <span className="tabular-nums font-medium">{branchManagers.length}</span>
          </div>

          {branchManagers.length === 0 ? (
            <div className="text-xs text-ink-muted bg-surface p-2.5 rounded-md border border-hairline">
              No manager credentials assigned yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {branchManagers.map((mgr) => (
                <BranchManagerRow
                  key={mgr.id}
                  manager={mgr}
                  onEdit={onEditManager}
                  onDelete={onDeleteManager}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="pt-3 border-t border-hairline grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onAssignManager(branch.id)}
          className="notion-btn-utility justify-center"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Assign Manager</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectBranch(branch.id)}
          className="notion-btn-utility justify-center text-primary"
        >
          <span className="truncate">Open Branch</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
        </button>
      </div>
    </div>
  );
};
