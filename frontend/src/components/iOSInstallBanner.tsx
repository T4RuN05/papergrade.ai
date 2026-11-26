"use client";

import React, { useState, useEffect } from "react";
import { Share, PlusSquare, X, Smartphone } from "lucide-react";

export function IOSInstallBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if running on iOS Safari and NOT already in standalone mode
    if (typeof window === "undefined") return;

    const ua = window.navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    // Check if dismissed in this session
    const isDismissed = sessionStorage.getItem("ios_install_banner_dismissed");

    if (isIOS && !isStandalone && !isDismissed) {
      // Delay slightly for smooth page entrance
      const timer = setTimeout(() => setShowBanner(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setShowBanner(false);
    sessionStorage.setItem("ios_install_banner_dismissed", "true");
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="bg-surface border border-hairline shadow-notion-modal rounded-lg p-4 text-ink">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold">Install PaperGrade on iPhone</h4>
              <p className="text-xs text-ink-muted">Fastest access & full-screen camera uploads</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-ink-muted hover:text-ink p-1 rounded-md transition-colors cursor-pointer"
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3.5 pt-3 border-t border-hairline/60 space-y-2 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-canvas-soft border border-hairline text-ink-secondary text-[11px] font-bold shrink-0">
              1
            </span>
            <span>
              Tap the Safari <strong className="inline-flex items-center gap-1 font-semibold text-ink"><Share className="h-3.5 w-3.5 inline text-primary" /> Share</strong> button in the bottom bar.
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-canvas-soft border border-hairline text-ink-secondary text-[11px] font-bold shrink-0">
              2
            </span>
            <span>
              Scroll down and tap <strong className="inline-flex items-center gap-1 font-semibold text-ink"><PlusSquare className="h-3.5 w-3.5 inline text-primary" /> Add to Home Screen</strong>.
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-canvas-soft border border-hairline text-ink-secondary text-[11px] font-bold shrink-0">
              3
            </span>
            <span>
              Tap <strong className="font-semibold text-ink">Add</strong> in the top-right corner.
            </span>
          </div>
        </div>

        <div className="mt-3 text-right">
          <button
            onClick={handleDismiss}
            className="text-xs font-medium text-ink-muted hover:text-ink px-2.5 py-1 rounded-md hover:bg-canvas-soft transition-colors cursor-pointer"
          >
            Got it, thanks
          </button>
        </div>
      </div>
    </div>
  );
}
