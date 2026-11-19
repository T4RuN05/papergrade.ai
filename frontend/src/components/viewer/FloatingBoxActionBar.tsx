"use client";

import React from "react";
import { Check, RotateCcw, Trash2, X, Loader2 } from "lucide-react";

interface FloatingBoxActionBarProps {
  isModified: boolean;
  isNearBottom: boolean;
  invScale: number;
  saving: boolean;
  canDelete: boolean;
  onSave: () => void;
  onRevert: () => void;
  onDelete?: () => void;
  onExit: (e: React.MouseEvent) => void;
}

export function FloatingBoxActionBar({
  isModified,
  isNearBottom,
  invScale,
  saving,
  canDelete,
  onSave,
  onRevert,
  onDelete,
  onExit,
}: FloatingBoxActionBarProps) {
  return (
    <div
      className="absolute flex items-center gap-1.5 bg-surface border border-hairline shadow-lg px-2.5 py-1 rounded-md text-xs z-50 animate-in fade-in zoom-in-95 pointer-events-auto select-none whitespace-nowrap"
      style={{
        [isNearBottom ? "bottom" : "top"]: "100%",
        left: "50%",
        transformOrigin: isNearBottom ? "bottom center" : "top center",
        transform: `translateX(-50%) translateY(${
          isNearBottom ? `-${8 * invScale}px` : `${8 * invScale}px`
        }) scale(${invScale})`,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {isModified ? (
        <>
          <span className="text-[10px] text-ink-muted font-medium">Box adjusted</span>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn-glass-primary flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Save Box
          </button>
          <button
            type="button"
            onClick={onRevert}
            className="btn-glass-utility flex items-center gap-1 px-2 py-0.5 rounded text-ink-secondary text-[11px] cursor-pointer"
            title="Revert to original AI position"
          >
            <RotateCcw className="h-3 w-3" />
            Revert
          </button>
        </>
      ) : (
        <span className="text-[10px] text-ink-muted font-medium">
          Drag handles to resize or body to move
        </span>
      )}

      {canDelete && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="btn-glass-utility flex items-center gap-1 px-2 py-0.5 rounded text-rose-600 hover:text-rose-700 transition-colors text-[11px] font-medium cursor-pointer ml-1"
          title="Delete this bounding box region"
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </button>
      )}

      <button
        type="button"
        onClick={onExit}
        className="btn-glass-utility flex items-center gap-1 px-2 py-0.5 rounded text-ink-muted hover:text-ink transition-colors text-[11px] font-medium cursor-pointer ml-1"
        title="Exit edit mode"
      >
        <X className="h-3 w-3" />
        Exit
      </button>
    </div>
  );
}
