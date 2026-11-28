"use client";

import { useEffect, useState } from "react";

/**
 * Coordinates mount lifecycle and double-rAF transition frames so slide drawers
 * animate smoothly in and out without visibility cutoffs or unmounted-scrim snaps.
 */
export function useSlideDrawer(isOpen: boolean, durationMs: number = 320) {
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      let raf2: number | null = null;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2 !== null) cancelAnimationFrame(raf2);
      };
    }

    setIsVisible(false);
    const timer = setTimeout(() => {
      setIsRendered(false);
    }, durationMs);
    return () => clearTimeout(timer);
  }, [isOpen, durationMs]);

  return { isRendered, isVisible };
}
