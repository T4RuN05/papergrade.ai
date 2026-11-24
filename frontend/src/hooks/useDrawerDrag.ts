"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface UseDrawerDragOptions {
  onClose: () => void;
  dismissThreshold?: number; // px drag down required to dismiss (default 70)
  velocityThreshold?: number; // px/ms speed required for quick flick dismiss (default 0.35)
  disabled?: boolean;
}

export function useDrawerDrag({
  onClose,
  dismissThreshold = 70,
  velocityThreshold = 0.35,
  disabled = false,
}: UseDrawerDragOptions) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const startYRef = useRef<number | null>(null);
  const currentYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const isClosingRef = useRef(false);

  // Reset any leftover transforms when closed or re-rendered
  const resetStyles = useCallback(() => {
    if (sheetRef.current) {
      sheetRef.current.style.transform = "";
      sheetRef.current.style.transition = "";
    }
    if (backdropRef.current) {
      backdropRef.current.style.opacity = "";
      backdropRef.current.style.transition = "";
    }
    isClosingRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      resetStyles();
    };
  }, [resetStyles]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || isClosingRef.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // Only enable drag on mobile viewports (< 640px)
      if (typeof window !== "undefined" && window.innerWidth >= 640) return;

      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Fallback if pointer capture unsupported
      }

      startYRef.current = e.clientY;
      currentYRef.current = e.clientY;
      startTimeRef.current = Date.now();
      setIsDragging(true);

      if (sheetRef.current) {
        sheetRef.current.style.transition = "none";
      }
    },
    [disabled]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (startYRef.current === null || isClosingRef.current) return;

      currentYRef.current = e.clientY;
      // Only allow dragging downwards (positive delta)
      const rawDelta = e.clientY - startYRef.current;
      const deltaY = rawDelta > 0 ? rawDelta : rawDelta * 0.15; // slight rubber band resistance upwards

      if (sheetRef.current) {
        sheetRef.current.style.transform = `translate3d(0, ${Math.max(0, deltaY)}px, 0)`;
      }

      if (backdropRef.current && deltaY > 0) {
        const progress = Math.min(1, deltaY / 300);
        backdropRef.current.style.opacity = String(Math.max(0.15, 1 - progress * 0.7));
      }
    },
    []
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (startYRef.current === null || isClosingRef.current) return;

      const deltaY = Math.max(0, (currentYRef.current ?? startYRef.current) - startYRef.current);
      const elapsed = Math.max(1, Date.now() - startTimeRef.current);
      const velocity = deltaY / elapsed;

      startYRef.current = null;
      currentYRef.current = null;
      setIsDragging(false);

      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture already released
      }

      const shouldDismiss = deltaY > dismissThreshold || (deltaY > 25 && velocity > velocityThreshold);

      if (shouldDismiss) {
        isClosingRef.current = true;
        if (sheetRef.current) {
          sheetRef.current.style.transition = "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
          sheetRef.current.style.transform = "translate3d(0, 100%, 0)";
        }
        if (backdropRef.current) {
          backdropRef.current.style.transition = "opacity 0.2s ease-out";
          backdropRef.current.style.opacity = "0";
        }
        setTimeout(() => {
          onClose();
        }, 200);
      } else {
        // Snap back smoothly
        if (sheetRef.current) {
          sheetRef.current.style.transition = "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)";
          sheetRef.current.style.transform = "translate3d(0, 0, 0)";
        }
        if (backdropRef.current) {
          backdropRef.current.style.transition = "opacity 0.2s ease-out";
          backdropRef.current.style.opacity = "";
        }
        setTimeout(() => {
          if (sheetRef.current) {
            sheetRef.current.style.transform = "";
            sheetRef.current.style.transition = "";
          }
        }, 260);
      }
    },
    [dismissThreshold, velocityThreshold, onClose]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      handlePointerUp(e);
    },
    [handlePointerUp]
  );

  return {
    sheetRef,
    backdropRef,
    isDragging,
    resetStyles,
    handleProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
  };
}
