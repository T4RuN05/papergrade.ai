"use client";

import { useRef, useCallback, useEffect } from "react";

interface UseDrawerDragOptions {
  onClose: (fromDrag?: boolean) => void;
  dismissThreshold?: number; // px drag down required to dismiss (default 100)
  velocityThreshold?: number; // px/ms speed required for quick flick dismiss (default 0.5)
  disabled?: boolean;
}

export function useDrawerDrag({
  onClose,
  dismissThreshold = 100,
  velocityThreshold = 0.5,
  disabled = false,
}: UseDrawerDragOptions) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const startYRef = useRef<number | null>(null);
  const currentYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const isClosingRef = useRef<boolean>(false);

  // Reset any leftover transforms when closed or re-rendered
  const resetStyles = useCallback(() => {
    if (sheetRef.current) {
      sheetRef.current.style.transform = "";
      sheetRef.current.style.transition = "";
      sheetRef.current.style.animation = "";
    }
    if (backdropRef.current) {
      backdropRef.current.style.opacity = "";
      backdropRef.current.style.transition = "";
    }
    isDraggingRef.current = false;
    isClosingRef.current = false;
    startYRef.current = null;
    currentYRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      resetStyles();
    };
  }, [resetStyles]);

  // Unified drag start
  const startDrag = useCallback(
    (clientY: number) => {
      if (disabled || isClosingRef.current) return;
      // Only enable drag on mobile viewports (< 640px)
      if (typeof window !== "undefined" && window.innerWidth >= 640) return;

      startYRef.current = clientY;
      currentYRef.current = clientY;
      startTimeRef.current = Date.now();
      isDraggingRef.current = true;

      if (sheetRef.current) {
        // Clear active CSS animations so inline transform has immediate, unhindered control
        sheetRef.current.style.animation = "none";
        sheetRef.current.style.transition = "none";
      }
    },
    [disabled]
  );

  // Unified drag move
  const moveDrag = useCallback((clientY: number) => {
    if (!isDraggingRef.current || startYRef.current === null || isClosingRef.current) return;

    currentYRef.current = clientY;
    const rawDelta = clientY - startYRef.current;
    // Downward drag tracks finger directly; upward drag resists with rubber-band damping
    const deltaY = rawDelta > 0 ? rawDelta : rawDelta * 0.15;

    if (sheetRef.current) {
      sheetRef.current.style.transform = `translate3d(0, ${Math.max(0, deltaY)}px, 0)`;
    }

    if (backdropRef.current && deltaY > 0) {
      const progress = Math.min(1, deltaY / 350);
      backdropRef.current.style.opacity = String(Math.max(0.1, 1 - progress * 0.8));
    }
  }, []);

  // Unified drag end / release
  const endDrag = useCallback(() => {
    if (!isDraggingRef.current || startYRef.current === null || isClosingRef.current) return;

    const deltaY = Math.max(0, (currentYRef.current ?? startYRef.current) - startYRef.current);
    const elapsed = Math.max(1, Date.now() - startTimeRef.current);
    const velocity = deltaY / elapsed;

    isDraggingRef.current = false;
    startYRef.current = null;
    currentYRef.current = null;

    // Check if user pulled down past threshold OR performed a clear downward flick
    const shouldDismiss = deltaY > dismissThreshold || (deltaY > 45 && velocity > velocityThreshold);

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
        onClose(true); // fromDrag = true (bypass re-animating)
      }, 220);
    } else {
      // Snap back smoothly to resting position
      if (sheetRef.current) {
        sheetRef.current.style.transition = "transform 0.26s cubic-bezier(0.16, 1, 0.3, 1)";
        sheetRef.current.style.transform = "translate3d(0, 0, 0)";
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = "opacity 0.25s ease-out";
        backdropRef.current.style.opacity = "";
      }
      setTimeout(() => {
        if (sheetRef.current && !isClosingRef.current) {
          sheetRef.current.style.transform = "";
          sheetRef.current.style.transition = "";
          sheetRef.current.style.animation = "";
        }
      }, 280);
    }
  }, [dismissThreshold, velocityThreshold, onClose]);

  // Touch handlers (100% reliable on mobile Safari and Chrome)
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      startDrag(e.touches[0].clientY);
    },
    [startDrag]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      moveDrag(e.touches[0].clientY);
    },
    [moveDrag]
  );

  const handleTouchEnd = useCallback(() => {
    endDrag();
  }, [endDrag]);

  const handleTouchCancel = useCallback(() => {
    endDrag();
  }, [endDrag]);

  // Pointer/Mouse handlers (for desktop mouse testing)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // If pointer is touch, TouchEvents handle it natively
      if (e.pointerType === "touch") return;
      if (e.button !== 0) return;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
      startDrag(e.clientY);
    },
    [startDrag]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      moveDrag(e.clientY);
    },
    [moveDrag]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      endDrag();
    },
    [endDrag]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return;
      endDrag();
    },
    [endDrag]
  );

  return {
    sheetRef,
    backdropRef,
    resetStyles,
    handleProps: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
  };
}
