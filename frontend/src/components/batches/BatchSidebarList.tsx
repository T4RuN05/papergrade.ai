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
    <div className="space-y-2.5 sm:space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
          <span>Batches</span>
          <span className="font-mono bg-canvas-soft border border-hairline px-1.5 py-0.2 rounded text-[10px] text-ink">
            {batches.length}
          </span>
        </h2>
        <button
          onClick={onRefresh}
          className="p-1 rounded text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
          title="Refresh Batches"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Batches Container: horizontal scroll on mobile (< md), vertical stack on desktop (md+) */}
      <div className="flex md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none -mx-1 px-1">
        {loadingBatches ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="min-w-[170px] md:min-w-0 md:w-full shrink-0 md:shrink p-3 rounded-lg bg-surface border border-hairline space-y-2"
            >
              <Skeleton className="h-4 w-28 sm:w-32" />
              <Skeleton className="h-3 w-36 sm:w-40" />
            </div>
          ))
        ) : batches.length === 0 ? (
          <div className="w-full p-6 rounded-lg bg-surface border border-hairline text-center text-xs text-ink-muted space-y-2">
            <Users className="h-6 w-6 text-ink-faint mx-auto" />
            <p className="font-semibold text-ink">No batches in this branch.</p>
            <p className="text-[11px]">
              Click &quot;Create Batch&quot; above to initialize a new student batch.
            </p>
          </div>
        ) : (
          batches.map((b) => {
            const isSelected = selectedBatch?.id === b.id;
            return (
              <div
                key={b.id}
                className={`group flex items-center justify-between p-3 sm:p-3.5 rounded-lg border transition-all cursor-pointer min-w-[180px] xs:min-w-[200px] md:min-w-0 md:w-full shrink-0 md:shrink ${
                  isSelected
                    ? "bg-surface border-primary shadow-xs ring-1 ring-primary/20"
                    : "bg-surface border-hairline hover:border-[#d0d0d0]"
                }`}
                onClick={() => onSelectBatch(b)}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="text-xs font-bold text-ink truncate flex items-center gap-1.5">
                    <span>{b.name}</span>
                    {isSelected && (
                      <span className="md:hidden h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5 truncate">
                    Academic Year:{" "}
                    <span className="font-medium text-ink-secondary">
                      {b.academic_year || "2026"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-canvas-soft border border-hairline text-ink-muted">
                    {b.total_submissions || 0}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteBatch(b.id, b.name);
                    }}
                    className="p-1 rounded text-ink-faint hover:text-red-600 hover:bg-red-50 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    title="Delete Batch"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
