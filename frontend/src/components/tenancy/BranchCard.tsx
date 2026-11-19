"use client";

import React from "react";
import { MapPin, Plus, ArrowRight } from "lucide-react";
import { BadgePill, ButtonUtility } from "@/components/ui";
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
    <div className="rounded-lg border border-hairline bg-canvas-soft p-4 sm:p-5 space-y-4 flex flex-col justify-between">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              {branch.name}
            </h3>
            <div className="text-xs text-ink-muted mt-0.5">
              City: <span className="font-medium text-ink-secondary">{branch.city}</span> • Code:{" "}
              <span className="font-mono font-semibold text-ink">{branch.code}</span>
            </div>
          </div>
          <BadgePill label="Branch" color="teal" />
        </div>

        {/* Assigned Branch Managers */}
        <div className="pt-2 border-t border-hairline space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted block">
            Assigned Branch Managers ({branchManagers.length})
          </span>

          {branchManagers.length === 0 ? (
            <div className="text-xs text-ink-muted italic bg-surface p-2 rounded-md border border-hairline">
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

      <div className="pt-3 border-t border-hairline flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <ButtonUtility
          size="sm"
          onClick={() => onAssignManager(branch.id)}
          className="w-full sm:w-auto justify-center"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Assign Manager
        </ButtonUtility>

        <ButtonUtility
          size="sm"
          onClick={() => onSelectBranch(branch.id)}
          className="w-full sm:w-auto justify-center text-primary hover:text-primary-active font-semibold"
        >
          <span>Switch to Branch &amp; View</span>
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </ButtonUtility>
      </div>
    </div>
  );
};
