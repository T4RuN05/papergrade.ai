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
      className="absolute flex items-center gap-1.5 bg-surface border border-hairline shadow-notion-modal px-2.5 py-1.5 rounded-lg text-xs z-50 pointer-events-auto select-none whitespace-nowrap"
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
          <span className="text-[11px] text-ink-muted font-medium">Box adjusted</span>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="notion-btn-primary min-h-0 h-6 px-2.5 text-[11px] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            <span>Save Box</span>
          </button>
          <button
            type="button"
            onClick={onRevert}
            className="notion-btn-utility min-h-0 h-6 px-2 text-[11px] text-ink-secondary"
            title="Revert to original AI position"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Revert</span>
          </button>
        </>
      ) : (
        <span className="text-[11px] text-ink-muted font-medium">
          Drag handles to resize or body to move
        </span>
      )}

      {canDelete && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="notion-btn-danger min-h-0 h-6 px-2 text-[11px] ml-0.5"
          title="Delete this bounding box region"
        >
          <Trash2 className="h-3 w-3" />
          <span>Delete</span>
        </button>
      )}

      <button
        type="button"
        onClick={onExit}
        className="notion-btn-utility min-h-0 h-6 px-2 text-[11px] text-ink-muted ml-0.5"
        title="Exit edit mode"
      >
        <X className="h-3 w-3" />
        <span>Exit</span>
      </button>
    </div>
  );
}
