"use client";

import React from "react";
import { Users, RefreshCw, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui";

interface BatchItem {
  id: string;
  name: string;
  academic_year?: string;
  total_submissions?: number;
}

interface BatchSidebarListProps {
  batches: BatchItem[];
  selectedBatch: BatchItem | null;
  loadingBatches: boolean;
  onSelectBatch: (batch: BatchItem) => void;
  onDeleteBatch: (batchId: string, batchName: string) => void;
  onRefresh: () => void;
}

export function BatchSidebarList({
  batches,
  selectedBatch,
  loadingBatches,
  onSelectBatch,
  onDeleteBatch,
  onRefresh,
}: BatchSidebarListProps) {
  return (
    <div className="space-y-3 min-w-0 w-full">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-ink-secondary">
            Batches
          </h3>
          <span className="font-mono tabular-nums bg-surface border border-hairline px-2 py-0.5 rounded-full text-[11px] font-medium text-ink-muted">
            {batches.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="notion-btn-utility min-h-[28px] h-7 px-2 text-xs"
          title="Refresh Batches"
        >
          <RefreshCw className="h-3.5 w-3.5 text-ink-muted shrink-0" />
        </button>
      </div>

      {/* Batches Container: horizontal scroll on mobile (< md), vertical stack on desktop (md+) */}
      <div className="flex md:flex-col gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-0">
        {loadingBatches ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="notion-card rounded-lg min-w-[180px] md:min-w-0 md:w-full shrink-0 md:shrink p-3 space-y-2"
            >
              <Skeleton className="h-4 w-28 sm:w-32" />
              <Skeleton className="h-3 w-36 sm:w-40" />
            </div>
          ))
        ) : batches.length === 0 ? (
          <div className="notion-card rounded-lg w-full p-6 text-center text-xs text-ink-muted space-y-2">
            <Users className="h-6 w-6 text-ink-faint mx-auto" />
            <p className="font-semibold text-ink">No batches in this branch.</p>
            <p className="text-xs">
              Click &quot;Create Batch&quot; above to initialize a new student batch.
            </p>
          </div>
        ) : (
          batches.map((b) => {
            const isSelected = selectedBatch?.id === b.id;
            return (
              <div
                key={b.id}
                className={`group flex items-center justify-between p-3 sm:p-3.5 rounded-lg border transition-colors cursor-pointer min-w-[196px] md:min-w-0 md:w-full shrink-0 md:shrink ${
                  isSelected
                    ? "bg-surface border-primary ring-1 ring-primary/20 shadow-notion-card"
                    : "bg-surface border-hairline hover:bg-canvas-soft/60"
                }`}
                onClick={() => onSelectBatch(b)}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="text-xs font-semibold text-ink truncate flex items-center gap-1.5">
                    {isSelected && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    )}
                    <span className="truncate">{b.name}</span>
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5 truncate">
                    Academic Year:{" "}
                    <span className="font-medium text-ink-secondary tabular-nums">
                      {b.academic_year || "2026"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-full bg-canvas-soft border border-hairline text-ink-muted">
                    {b.total_submissions || 0}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteBatch(b.id, b.name);
                    }}
                    className="p-1.5 rounded-md text-ink-muted hover:text-red-600 dark:hover:text-[#f28b82] hover:bg-red-50/70 dark:hover:bg-[#2a1313] md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Delete Batch"
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
