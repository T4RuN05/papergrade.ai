"use client";

import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  Edit3,
  X,
  Sliders,
  Flag,
  ShieldCheck,
} from "lucide-react";
import { GradedAnswer, AnswerRegion } from "@/lib/types";
import { ResizeHandles, HandleType } from "./ResizeHandles";
import { FloatingBoxActionBar } from "./FloatingBoxActionBar";

export interface RegionCoords {
  x: number;
  y: number;
  width: number;
  height: number;
  isModified?: boolean;
}

interface AnnotationBoundingBoxProps {
  region: AnswerRegion;
  answer: GradedAnswer;
  idx: number;
  regId: string;
  coords: RegionCoords;
  isSelected: boolean;
  isHovered: boolean;
  isEditing: boolean;
  isDimmed?: boolean;
  isActivelyDragging: boolean;
  isModified: boolean;
  invScale: number;
  readOnly: boolean;
  savingRegionId: string | null;
  onSelect: () => void;
  onInspect?: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onStartDrag: (e: React.MouseEvent | React.TouchEvent, handle: HandleType) => void;
  onEnterEditMode: (e: React.MouseEvent) => void;
  onExitEditMode: (e?: React.MouseEvent) => void;
  onSaveRegion: (regId: string, coords: RegionCoords, answerId: string) => void;
  onRevertRegion: (regId: string) => void;
  onDeleteRegion?: (regId: string) => Promise<void>;
}

export function AnnotationBoundingBox({
  region,
  answer,
  idx,
  regId,
  coords,
  isSelected,
  isHovered,
  isEditing,
  isDimmed = false,
  isActivelyDragging,
  isModified,
  invScale,
  readOnly,
  savingRegionId,
  onSelect,
  onInspect,
  onMouseEnter,
  onMouseLeave,
  onStartDrag,
  onEnterEditMode,
  onExitEditMode,
  onSaveRegion,
  onRevertRegion,
  onDeleteRegion,
}: AnnotationBoundingBoxProps) {
  // Compute status colors
  const getStatusColor = (ans: GradedAnswer) => {
    if (ans.needs_review) {
      return {
        border: "border-purple-600 dark:border-purple-400",
        bg: "bg-purple-600/15 dark:bg-purple-950/30",
        badge: "bg-purple-600 text-white dark:bg-purple-500",
        icon: Eye,
      };
    }
    const ratio = ans.max_marks > 0 ? ans.awarded_marks / ans.max_marks : 0;
    if (ratio >= 0.99) {
      return {
        border: "border-emerald-600 dark:border-emerald-400",
        bg: "bg-emerald-600/15 dark:bg-emerald-950/30",
        badge: "bg-emerald-600 text-white dark:bg-emerald-500",
        icon: CheckCircle2,
      };
    }
    if (ratio > 0) {
      return {
        border: "border-amber-500 dark:border-amber-400",
        bg: "bg-amber-500/15 dark:bg-amber-950/30",
        badge: "bg-amber-500 text-white dark:bg-amber-400",
        icon: AlertTriangle,
      };
    }
    return {
      border: "border-rose-600 dark:border-rose-400",
      bg: "bg-rose-600/15 dark:bg-rose-950/30",
      badge: "bg-rose-600 text-white dark:bg-rose-500",
      icon: XCircle,
    };
  };

  const style = getStatusColor(answer);
  const StatusIcon = style.icon;

  const allRegions = answer.regions || [];
  const regionIndex = allRegions.findIndex(
    (r) =>
      r.id === region.id ||
      (r.page_number === region.page_number && r.x === region.x && r.y === region.y)
  );
  const isMultiRegion = allRegions.length > 1;
  const isNearPageTop = coords.y < 0.035;
  const isNearRightEdge = coords.x + coords.width > 0.95;
  const isNearBottom = coords.y + coords.height > 0.85;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (isEditing || isDimmed) return;
        if (onInspect) {
          onInspect();
        } else {
          onSelect();
        }
      }}
      onMouseEnter={isDimmed ? undefined : onMouseEnter}
      onMouseLeave={isDimmed ? undefined : onMouseLeave}
      className={`absolute rounded-xs box-border transition-all duration-150 ${
        isDimmed
          ? "border-zinc-400/50 dark:border-zinc-600/50 bg-zinc-400/5 dark:bg-zinc-800/10 grayscale opacity-30 pointer-events-none border-dashed"
          : isModified
          ? "border-dashed border-primary bg-primary/10 shadow-sm"
          : `${style.border} ${style.bg}`
      } ${
        isEditing
          ? "z-30 cursor-move"
          : isDimmed
          ? "z-0 pointer-events-none"
          : isSelected
          ? "z-20 cursor-pointer"
          : "z-10 hover:z-20 cursor-pointer"
      }`}
      style={{
        left: `${coords.x * 100}%`,
        top: `${coords.y * 100}%`,
        width: `${coords.width * 100}%`,
        height: `${coords.height * 100}%`,
        borderWidth: `${Math.max(1, Number((2 * invScale).toFixed(2)))}px`,
        boxShadow: isEditing
          ? `0 0 0 ${Math.max(1, Number((2 * invScale).toFixed(2)))}px #2563eb`
          : isSelected && !isDimmed
          ? `0 0 0 ${Math.max(1, Number((1.5 * invScale).toFixed(2)))}px rgba(37, 99, 235, 0.6)`
          : undefined,
      }}
      onMouseDown={(e) => {
        if (isEditing) {
          onStartDrag(e, "move");
        }
      }}
    >
      {/* Score badge at top-left of box */}
      <div
        className={`absolute flex items-center gap-1.5 whitespace-nowrap rounded-xs px-2 py-0.5 text-[10px] font-bold shadow-xs transition-all pointer-events-none select-none ${
          isDimmed
            ? "bg-zinc-500/70 text-white dark:bg-zinc-700/70 opacity-40 grayscale"
            : style.badge
        }`}
        style={{
          bottom: isNearPageTop ? undefined : "100%",
          top: isNearPageTop ? 0 : undefined,
          left: 0,
          transformOrigin: isNearPageTop ? "top left" : "bottom left",
          transform: `scale(${invScale}) translateY(${isNearPageTop ? "2px" : "-2px"})`,
        }}
      >
        <StatusIcon className="h-3 w-3" />
        <span>
          {answer.question_id} — {answer.awarded_marks}/{answer.max_marks}
          {isMultiRegion && (
            <span className="ml-1 opacity-90 font-normal">
              (Part {regionIndex >= 0 ? regionIndex + 1 : idx + 1}/{allRegions.length})
            </span>
          )}
        </span>
      </div>

      {/* Revaluation Flag on Question */}
      {answer.revaluation && (
        <div
          className={`absolute flex items-center gap-1 whitespace-nowrap rounded-xs px-2 py-0.5 text-[10px] font-bold shadow-xs select-none ${
            isDimmed ? "z-0 opacity-25 grayscale pointer-events-none" : "z-30"
          } ${
            answer.revaluation.status === "SUBMITTED" || answer.revaluation.status === "UNDER_REVIEW"
              ? "bg-amber-500 text-white animate-pulse border border-amber-600"
              : answer.revaluation.decision === "MARKS_REVISED"
              ? "bg-emerald-600 text-white border border-emerald-700"
              : "bg-slate-600 text-white border border-slate-700"
          }`}
          style={{
            bottom: isNearPageTop ? undefined : "100%",
            top: isNearPageTop ? 0 : undefined,
            right: 0,
            transformOrigin: isNearPageTop ? "top right" : "bottom right",
            transform: `scale(${invScale}) translateY(${isNearPageTop ? "2px" : "-2px"})`,
          }}
        >
          {answer.revaluation.status === "SUBMITTED" || answer.revaluation.status === "UNDER_REVIEW" ? (
            <>
              <Flag className="h-3 w-3 fill-current" />
              <span>REVALUATION APPEAL</span>
            </>
          ) : answer.revaluation.decision === "MARKS_REVISED" ? (
            <>
              <CheckCircle2 className="h-3 w-3" />
              <span>MARKS REVISED</span>
            </>
          ) : (
            <>
              <ShieldCheck className="h-3 w-3" />
              <span>MARKS UPHELD</span>
            </>
          )}
        </div>
      )}

      {/* Live Dimensions Tooltip during Drag */}
      {isActivelyDragging && (
        <div
          className="absolute top-1/2 left-1/2 pointer-events-none bg-black/80 text-white font-mono text-[10px] px-2 py-0.5 rounded-full shadow-md z-50 whitespace-nowrap"
          style={{
            transformOrigin: "center",
            transform: `translate(-50%, -50%) scale(${invScale})`,
          }}
        >
          {Math.round(coords.width * 100)}% × {Math.round(coords.height * 100)}%
        </div>
      )}

      {/* Action Buttons Cluster (Inspect & Edit Buttons) */}
      {!readOnly && !isDimmed && (
        <div
          className="absolute z-40 flex items-center"
          style={{
            top: 0,
            right: 0,
            transformOrigin: "top right",
            transform: `scale(${invScale}) translate(${
              isNearRightEdge ? "-2px" : "6px"
            }, ${isNearPageTop ? "4px" : "-6px"})`,
          }}
          onMouseEnter={onMouseEnter}
        >
          <div
            className={`flex items-center gap-0.5 rounded-full p-0.5 border shadow-xs transition-all ${
              isEditing
                ? "bg-surface border-primary shadow-md ring-2 ring-primary/20 scale-105"
                : "bg-surface border-hairline hover:border-[#b0b0b0]"
            }`}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {isEditing ? (
              <>
                <span className="text-[10px] font-bold text-primary pl-1.5 pr-0.5 flex items-center gap-1 select-none">
                  <Sliders className="h-2.5 w-2.5" />
                  Editing
                </span>
                <button
                  type="button"
                  onClick={(e) => onExitEditMode(e)}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 hover:text-rose-700 transition-colors cursor-pointer shadow-2xs"
                  title="Exit edit mode (remove handles)"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onInspect) {
                      onInspect();
                    } else {
                      onSelect();
                    }
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-ink-muted hover:text-primary hover:bg-canvas-soft transition-colors cursor-pointer"
                  title="Inspect answer in modal"
                >
                  <Eye className="h-3 w-3" />
                </button>

                <button
                  type="button"
                  onClick={onEnterEditMode}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-ink-muted hover:text-primary hover:bg-canvas-soft transition-colors cursor-pointer"
                  title="Adjust & resize bounding box"
                >
                  <Edit3 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 8 Interactive Resize Handles */}
      {!readOnly && isEditing && (
        <ResizeHandles invScale={invScale} onStartDrag={onStartDrag} />
      )}

      {/* Floating Save / Revert / Exit Action Bar */}
      {!readOnly && (isModified || isEditing) && (
        <FloatingBoxActionBar
          isModified={isModified}
          isNearBottom={isNearBottom}
          invScale={invScale}
          saving={savingRegionId === (region.id || answer.id)}
          canDelete={Boolean(onDeleteRegion && region.id && !region.id.startsWith("draft-"))}
          onSave={() => onSaveRegion(region.id || answer.id, coords, answer.id)}
          onRevert={() => onRevertRegion(regId)}
          onDelete={
            onDeleteRegion && region.id && !region.id.startsWith("draft-")
              ? async () => {
                  if (confirm(`Remove this bounding box region for ${answer.question_id}?`)) {
                    await onDeleteRegion(region.id!);
                    onExitEditMode();
                  }
                }
              : undefined
          }
          onExit={(e) => onExitEditMode(e)}
        />
      )}
    </div>
  );
}
