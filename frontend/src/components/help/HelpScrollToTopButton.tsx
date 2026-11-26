"use client";

import React, { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function HelpScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let rafId = 0;

    const updateVisibility = () => {
      rafId = 0;
      setVisible(window.scrollY > 280);
    };

    const onScroll = () => {
      if (!rafId) {
        rafId = window.requestAnimationFrame(updateVisibility);
      }
    };

    updateVisibility();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const handleScrollTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={handleScrollTop}
      aria-label="Move to top"
      title="Move to top"
      className={`fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-40 notion-btn-utility min-h-0 h-9 px-3 rounded-full shadow-notion-card text-xs text-ink hover:text-primary transition-all duration-200 ${
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-2 pointer-events-none"
      }`}
    >
      <ArrowUp className="h-3.5 w-3.5 shrink-0" />
      <span>Top</span>
    </button>
  );
}
