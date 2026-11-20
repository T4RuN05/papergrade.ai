"use client";

import React, { useEffect, useState, useMemo } from "react";
import { DocStep } from "@/lib/helpDocsData";

export interface HelpTableOfContentsProps {
  steps: DocStep[];
  hasFaq?: boolean;
}

export function HelpTableOfContents({ steps, hasFaq = false }: HelpTableOfContentsProps) {
  const targetIds = useMemo(
    () => [
      ...steps.map((_, idx) => `step-${idx + 1}`),
      ...(hasFaq ? ["frequently-asked-questions"] : []),
    ],
    [steps, hasFaq]
  );

  const [activeId, setActiveId] = useState<string>(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash.replace("#", "");
      if (hash) return hash;
    }
    return steps[0] ? "step-1" : "";
  });

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollBottom = window.innerHeight + window.scrollY;
          const docHeight = document.documentElement.scrollHeight;

          // If scrolled near bottom of page, highlight the last section (e.g. FAQ or final step)
          if (docHeight - scrollBottom < 100 && targetIds.length > 0) {
            setActiveId(targetIds[targetIds.length - 1]);
            ticking = false;
            return;
          }

          // Default to the first step
          let current = targetIds[0] || "";

          // The active section is the one currently intersecting or nearest above the 160px threshold
          for (const id of targetIds) {
            const el = document.getElementById(id);
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            if (rect.top <= 160) {
              current = id;
            }
          }

          if (current) {
            setActiveId(current);
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    // Calculate immediately on mount / steps change
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [targetIds]);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    setActiveId(id);
    const target = document.getElementById(id);
    if (target) {
      const yOffset = -80;
      const y = target.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
      if (window.history.pushState) {
        window.history.pushState(null, "", `#${id}`);
      }
    }
  };

  return (
    <div className="hidden xl:block w-64 shrink-0 pl-6 sticky top-20 select-none">
      <div className="border-l border-hairline pl-4 space-y-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">
          On this page
        </span>
        <nav className="space-y-1 text-xs">
          {steps.map((step, idx) => {
            const anchorId = `step-${idx + 1}`;
            const isActive = activeId === anchorId;

            return (
              <a
                key={anchorId}
                href={`#${anchorId}`}
                onClick={(e) => scrollToSection(e, anchorId)}
                title={step.title}
                className={`block py-1 text-xs transition-colors duration-150 leading-snug truncate -ml-[17px] border-l-2 pl-3.5 ${
                  isActive
                    ? "border-primary text-primary font-semibold"
                    : "border-transparent text-ink-muted hover:text-ink hover:border-hairline-strong"
                }`}
              >
                {step.title}
              </a>
            );
          })}
          {hasFaq && (
            <a
              href="#frequently-asked-questions"
              onClick={(e) => scrollToSection(e, "frequently-asked-questions")}
              title="Frequently Asked Questions"
              className={`block py-1 text-xs transition-colors duration-150 leading-snug truncate -ml-[17px] border-l-2 pl-3.5 ${
                activeId === "frequently-asked-questions"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-ink-muted hover:text-ink hover:border-hairline-strong"
              }`}
            >
              Frequently Asked Questions
            </a>
          )}
        </nav>
      </div>
    </div>
  );
}
