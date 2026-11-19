"use client";

import React from "react";

export type HandleType = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface ResizeHandlesProps {
  invScale: number;
  onStartDrag: (
    e: React.MouseEvent | React.TouchEvent,
    handle: HandleType
  ) => void;
}

export function ResizeHandles({ invScale, onStartDrag }: ResizeHandlesProps) {
  return (
    <>
      {/* NW Corner */}
      <div
        data-handle="nw"
        onMouseDown={(e) => onStartDrag(e, "nw")}
        onTouchStart={(e) => onStartDrag(e, "nw")}
        className="absolute w-3.5 h-3.5 bg-white border-2 border-primary rounded-xs shadow-xs cursor-nwse-resize z-40 before:absolute before:-inset-2 before:content-['']"
        style={{
          top: 0,
          left: 0,
          transformOrigin: "center",
          transform: `translate(-50%, -50%) scale(${invScale})`,
        }}
        title="Drag to resize top-left"
      />

      {/* N Edge */}
      <div
        data-handle="n"
        onMouseDown={(e) => onStartDrag(e, "n")}
        onTouchStart={(e) => onStartDrag(e, "n")}
        className="absolute w-4 h-2.5 bg-white border-2 border-primary rounded-xs shadow-xs cursor-ns-resize z-40 before:absolute before:-inset-2 before:content-[''] hidden sm:block"
        style={{
          top: 0,
          left: "50%",
          transformOrigin: "center",
          transform: `translate(-50%, -50%) scale(${invScale})`,
        }}
        title="Drag to resize top"
      />

      {/* NE Corner */}
      <div
        data-handle="ne"
        onMouseDown={(e) => onStartDrag(e, "ne")}
        onTouchStart={(e) => onStartDrag(e, "ne")}
        className="absolute w-3.5 h-3.5 bg-white border-2 border-primary rounded-xs shadow-xs cursor-nesw-resize z-40 before:absolute before:-inset-2 before:content-['']"
        style={{
          top: 0,
          right: 0,
          transformOrigin: "center",
          transform: `translate(50%, -50%) scale(${invScale})`,
        }}
        title="Drag to resize top-right"
      />

      {/* E Edge */}
      <div
        data-handle="e"
        onMouseDown={(e) => onStartDrag(e, "e")}
        onTouchStart={(e) => onStartDrag(e, "e")}
        className="absolute w-2.5 h-4 bg-white border-2 border-primary rounded-xs shadow-xs cursor-ew-resize z-40 before:absolute before:-inset-2 before:content-[''] hidden sm:block"
        style={{
          top: "50%",
          right: 0,
          transformOrigin: "center",
          transform: `translate(50%, -50%) scale(${invScale})`,
        }}
        title="Drag to resize right"
      />

      {/* SE Corner */}
      <div
        data-handle="se"
        onMouseDown={(e) => onStartDrag(e, "se")}
        onTouchStart={(e) => onStartDrag(e, "se")}
        className="absolute w-3.5 h-3.5 bg-white border-2 border-primary rounded-xs shadow-xs cursor-nwse-resize z-40 before:absolute before:-inset-2 before:content-['']"
        style={{
          bottom: 0,
          right: 0,
          transformOrigin: "center",
          transform: `translate(50%, 50%) scale(${invScale})`,
        }}
        title="Drag to resize bottom-right"
      />

      {/* S Edge */}
      <div
        data-handle="s"
        onMouseDown={(e) => onStartDrag(e, "s")}
        onTouchStart={(e) => onStartDrag(e, "s")}
        className="absolute w-4 h-2.5 bg-white border-2 border-primary rounded-xs shadow-xs cursor-ns-resize z-40 before:absolute before:-inset-2 before:content-[''] hidden sm:block"
        style={{
          bottom: 0,
          left: "50%",
          transformOrigin: "center",
          transform: `translate(-50%, 50%) scale(${invScale})`,
        }}
        title="Drag to resize bottom"
      />

      {/* SW Corner */}
      <div
        data-handle="sw"
        onMouseDown={(e) => onStartDrag(e, "sw")}
        onTouchStart={(e) => onStartDrag(e, "sw")}
        className="absolute w-3.5 h-3.5 bg-white border-2 border-primary rounded-xs shadow-xs cursor-nesw-resize z-40 before:absolute before:-inset-2 before:content-['']"
        style={{
          bottom: 0,
          left: 0,
          transformOrigin: "center",
          transform: `translate(-50%, 50%) scale(${invScale})`,
        }}
        title="Drag to resize bottom-left"
      />

      {/* W Edge */}
      <div
        data-handle="w"
        onMouseDown={(e) => onStartDrag(e, "w")}
        onTouchStart={(e) => onStartDrag(e, "w")}
        className="absolute w-2.5 h-4 bg-white border-2 border-primary rounded-xs shadow-xs cursor-ew-resize z-40 before:absolute before:-inset-2 before:content-[''] hidden sm:block"
        style={{
          top: "50%",
          left: 0,
          transformOrigin: "center",
          transform: `translate(-50%, -50%) scale(${invScale})`,
        }}
        title="Drag to resize left"
      />
    </>
  );
}
