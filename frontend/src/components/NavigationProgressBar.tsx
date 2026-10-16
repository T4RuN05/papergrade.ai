"use client";

import React, { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";

// Global programmatic trigger for router.push calls
let globalStartNav: (() => void) | null = null;
let globalFinishNav: (() => void) | null = null;

export function startNavigationProgress() {
  if (globalStartNav) globalStartNav();
}

export function finishNavigationProgress() {
  if (globalFinishNav) globalFinishNav();
}

export function NavigationProgressBar() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const start = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setVisible(true);
    setProgress(25);

    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 85;
        }
        return prev + (prev < 50 ? 20 : 5);
      });
    }, 200);
  };

  const finish = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(100);
    setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);
  };

  useEffect(() => {
    globalStartNav = start;
    globalFinishNav = finish;
    return () => {
      globalStartNav = null;
      globalFinishNav = null;
    };
  }, []);

  // Complete progress on pathname change
  useEffect(() => {
    finish();
  }, [pathname]);

  // Intercept click on links to give INSTANT 16ms feedback
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      // Find closest anchor tag
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Ignore external, hash, or target="_blank"
      if (
        href.startsWith("http") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        target.target === "_blank" ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey
      ) {
        return;
      }

      // If pointing to a different path, start bar immediately
      const currentPath = window.location.pathname;
      if (href !== currentPath) {
        start();
      }
    };

    document.addEventListener("click", handleDocumentClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleDocumentClick, { capture: true });
    };
  }, []);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[99999] pointer-events-none transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden="true"
    >
      <div
        className="h-[2.5px] bg-gradient-to-r from-primary via-indigo-500 to-sky-400 shadow-[0_0_10px_rgba(79,70,229,0.8)] transition-all duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
