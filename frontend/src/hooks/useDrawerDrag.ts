"use client";

import { useRef, useCallback, useEffect } from "react";

interface UseDrawerDragOptions {
  onClose: (fromDrag?: boolean) => void;
  dismissThreshold?: number; // px drag down required to dismiss (default 95)
  velocityThreshold?: number; // px/ms speed required for quick flick dismiss (default 0.45)
  disabled?: boolean;
}

const SLOP_PX = 6;
const SCROLLABLE_OVERFLOW_RE = /(auto|scroll|overlay)/;

function findVerticalScrollerAt(
  target: EventTarget | null,
  boundary: HTMLElement
): HTMLElement | null {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== boundary) {
    if (node.scrollHeight > node.clientHeight + 2) {
      const style = window.getComputedStyle(node);
      if (SCROLLABLE_OVERFLOW_RE.test(style.overflowY)) {
        return node;
      }
    }
    node = node.parentElement;
  }
  return null;
}

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return false;
  return Boolean(
    el.closest(
      "input, textarea, select, option, [contenteditable='true'], [data-no-swipe='true'], .sortable-page-card"
    )
  );
}

export function useDrawerDrag({
  onClose,
  dismissThreshold = 95,
  velocityThreshold = 0.45,
  disabled = false,
}: UseDrawerDragOptions) {
  const onCloseRef = useRef(onClose);
  const dismissThresholdRef = useRef(dismissThreshold);
  const velocityThresholdRef = useRef(velocityThreshold);
  const disabledRef = useRef(disabled);
  onCloseRef.current = onClose;
  dismissThresholdRef.current = dismissThreshold;
  velocityThresholdRef.current = velocityThreshold;
  disabledRef.current = disabled;

  const sheetElRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const startXRef = useRef<number>(0);
  const startYRef = useRef<number | null>(null);
  const dragOriginYRef = useRef<number>(0);
  const currentYRef = useRef<number | null>(null);
  const prevYRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastVelocityRef = useRef<number>(0);

  // Touch gesture state machine: idle -> undecided -> sheet | scroll | ignore
  const gestureModeRef = useRef<"idle" | "undecided" | "sheet" | "scroll" | "ignore">("idle");
  const activeScrollerRef = useRef<HTMLElement | null>(null);
  const isPointerDraggingRef = useRef<boolean>(false);
  const isClosingRef = useRef<boolean>(false);

  const resetStyles = useCallback(() => {
    if (sheetElRef.current) {
      sheetElRef.current.style.transform = "";
      sheetElRef.current.style.transition = "";
      sheetElRef.current.style.animation = "";
    }
    if (backdropRef.current) {
      backdropRef.current.style.opacity = "";
      backdropRef.current.style.transition = "";
    }
    gestureModeRef.current = "idle";
    activeScrollerRef.current = null;
    isPointerDraggingRef.current = false;
    isClosingRef.current = false;
    startYRef.current = null;
    currentYRef.current = null;
    lastVelocityRef.current = 0;
  }, []);

  const engageSheetTransform = useCallback((originY: number) => {
    dragOriginYRef.current = originY;
    startTimeRef.current = Date.now();
    prevYRef.current = originY;
    prevTimeRef.current = startTimeRef.current;
    lastVelocityRef.current = 0;

    if (sheetElRef.current) {
      // Clear active CSS entrance animation so inline transform tracks finger 1:1
      sheetElRef.current.style.animation = "none";
      sheetElRef.current.style.transition = "none";
    }
  }, []);

  const applyDragTransform = useCallback((clientY: number) => {
    currentYRef.current = clientY;
    const now = Date.now();
    const dt = now - prevTimeRef.current;
    if (dt > 0) {
      lastVelocityRef.current = (clientY - prevYRef.current) / dt;
    }
    prevYRef.current = clientY;
    prevTimeRef.current = now;

    const rawDelta = clientY - dragOriginYRef.current;
    const deltaY = rawDelta > 0 ? rawDelta : 0;

    if (sheetElRef.current) {
      sheetElRef.current.style.transform = `translate3d(0, ${deltaY}px, 0)`;
    }
    if (backdropRef.current) {
      const progress = Math.min(1, deltaY / 350);
      backdropRef.current.style.opacity = String(Math.max(0.1, 1 - progress * 0.8));
    }
  }, []);

  const finishSheetDrag = useCallback(() => {
    if (isClosingRef.current) return;

    const deltaY = Math.max(0, (currentYRef.current ?? dragOriginYRef.current) - dragOriginYRef.current);
    const elapsed = Math.max(1, Date.now() - startTimeRef.current);
    const avgVelocity = deltaY / elapsed;
    const peakVelocity = Math.max(avgVelocity, lastVelocityRef.current);

    gestureModeRef.current = "idle";
    activeScrollerRef.current = null;
    isPointerDraggingRef.current = false;
    startYRef.current = null;
    currentYRef.current = null;

    const shouldDismiss =
      deltaY > dismissThresholdRef.current ||
      (deltaY > 40 && peakVelocity > velocityThresholdRef.current);

    if (shouldDismiss) {
      isClosingRef.current = true;
      if (sheetElRef.current) {
        sheetElRef.current.style.transition = "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
        sheetElRef.current.style.transform = "translate3d(0, 100%, 0)";
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = "opacity 0.2s ease-out";
        backdropRef.current.style.opacity = "0";
      }
      setTimeout(() => {
        onCloseRef.current(true); // fromDrag = true (bypass re-animating)
      }, 220);
    } else {
      if (sheetElRef.current) {
        sheetElRef.current.style.transition = "transform 0.26s cubic-bezier(0.16, 1, 0.3, 1)";
        sheetElRef.current.style.transform = "translate3d(0, 0, 0)";
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = "opacity 0.25s ease-out";
        backdropRef.current.style.opacity = "";
      }
      setTimeout(() => {
        if (sheetElRef.current && !isClosingRef.current) {
          sheetElRef.current.style.transform = "";
          sheetElRef.current.style.transition = "";
          sheetElRef.current.style.animation = "";
        }
      }, 280);
    }
  }, []);

  // Native non-passive touch listeners across the entire bottom-sheet element
  const cleanupTouchListenersRef = useRef<(() => void) | null>(null);

  const attachListenersToSheet = useCallback(
    (node: HTMLDivElement | null) => {
      if (cleanupTouchListenersRef.current) {
        cleanupTouchListenersRef.current();
        cleanupTouchListenersRef.current = null;
      }
      if (!node) return;

      const onTouchStart = (e: TouchEvent) => {
        if (disabledRef.current || isClosingRef.current) return;
        if (typeof window !== "undefined" && window.innerWidth >= 640) return;
        if (e.touches.length !== 1) {
          gestureModeRef.current = "ignore";
          return;
        }
        if (shouldIgnoreTarget(e.target)) {
          gestureModeRef.current = "ignore";
          return;
        }

        const t = e.touches[0];
        startXRef.current = t.clientX;
        startYRef.current = t.clientY;
        currentYRef.current = t.clientY;
        activeScrollerRef.current = findVerticalScrollerAt(e.target, node);
        gestureModeRef.current = "undecided";
      };

      const onTouchMove = (e: TouchEvent) => {
        if (disabledRef.current || isClosingRef.current || e.touches.length !== 1) return;
        const mode = gestureModeRef.current;
        if (mode === "idle" || mode === "ignore" || mode === "scroll") return;

        const t = e.touches[0];
        if (mode === "undecided") {
          if (startYRef.current === null) return;
          const dx = t.clientX - startXRef.current;
          const dy = t.clientY - startYRef.current;

          if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return;

          // Horizontal swipe -> leave alone
          if (Math.abs(dx) > Math.abs(dy) * 1.15) {
            gestureModeRef.current = "ignore";
            return;
          }

          // Swiping up to scroll down content -> allow native scroll
          if (dy <= 0) {
            gestureModeRef.current = "scroll";
            return;
          }

          // Swiping down inside a scrollable container that isn't at top -> scroll up first
          const scroller = activeScrollerRef.current;
          if (scroller && scroller.scrollTop > 1) {
            gestureModeRef.current = "scroll";
            return;
          }

          // Otherwise: either non-scrollable area OR scroller already at top (scrollTop <= 1)!
          // Smoothly pull the drawer down from anywhere inside it.
          gestureModeRef.current = "sheet";
          engageSheetTransform(t.clientY);
          if (e.cancelable) e.preventDefault();
          applyDragTransform(t.clientY);
          return;
        }

        if (mode === "sheet") {
          if (e.cancelable) e.preventDefault();
          applyDragTransform(t.clientY);
        }
      };

      const onTouchEndOrCancel = () => {
        const mode = gestureModeRef.current;
        gestureModeRef.current = "idle";
        activeScrollerRef.current = null;
        if (mode === "sheet") {
          finishSheetDrag();
        } else {
          startYRef.current = null;
          currentYRef.current = null;
        }
      };

      node.addEventListener("touchstart", onTouchStart, { passive: true });
      node.addEventListener("touchmove", onTouchMove, { passive: false });
      node.addEventListener("touchend", onTouchEndOrCancel, { passive: true });
      node.addEventListener("touchcancel", onTouchEndOrCancel, { passive: true });

      cleanupTouchListenersRef.current = () => {
        node.removeEventListener("touchstart", onTouchStart);
        node.removeEventListener("touchmove", onTouchMove);
        node.removeEventListener("touchend", onTouchEndOrCancel);
        node.removeEventListener("touchcancel", onTouchEndOrCancel);
      };
    },
    [engageSheetTransform, applyDragTransform, finishSheetDrag]
  );

  // Callback ref passed to callers (`ref={sheetRef}`) so conditional portal mounts attach cleanly every time
  const sheetRef = useCallback(
    (node: HTMLDivElement | null) => {
      sheetElRef.current = node;
      attachListenersToSheet(node);
    },
    [attachListenersToSheet]
  );

  useEffect(() => {
    return () => {
      if (cleanupTouchListenersRef.current) {
        cleanupTouchListenersRef.current();
        cleanupTouchListenersRef.current = null;
      }
      resetStyles();
    };
  }, [resetStyles]);

  // Pointer/Mouse handlers for drag handle (desktop / DevTools mouse simulation)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch" || disabledRef.current || isClosingRef.current) return;
      if (typeof window !== "undefined" && window.innerWidth >= 640) return;
      if (e.button !== 0) return;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
      isPointerDraggingRef.current = true;
      engageSheetTransform(e.clientY);
    },
    [engageSheetTransform]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch" || !isPointerDraggingRef.current) return;
      applyDragTransform(e.clientY);
    },
    [applyDragTransform]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch" || !isPointerDraggingRef.current) return;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      finishSheetDrag();
    },
    [finishSheetDrag]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch" || !isPointerDraggingRef.current) return;
      finishSheetDrag();
    },
    [finishSheetDrag]
  );

  return {
    sheetRef,
    backdropRef,
    resetStyles,
    handleProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
  };
}
