"use client";

import React, { useEffect, useState, useMemo } from "react";
import { AlignLeft, ChevronDown } from "lucide-react";
import { DocStep } from "@/lib/helpDocsData";

export interface HelpTableOfContentsProps {
  steps: DocStep[];
  hasFaq?: boolean;
  variant?: "sidebar" | "inline";
}

export function HelpTableOfContents({
  steps,
  hasFaq = false,
  variant = "sidebar",
}: HelpTableOfContentsProps) {
  const [inlineOpen, setInlineOpen] = useState(false);

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
    setInlineOpen(false);
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash.replace("#", "");
      if (hash && targetIds.includes(hash)) {
        setActiveId(hash);
        return;
      }
    }
    setActiveId(targetIds[0] || "");
  }, [targetIds]);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollBottom = window.innerHeight + window.scrollY;
          const docHeight = document.documentElement.scrollHeight;

          if (docHeight - scrollBottom < 100 && targetIds.length > 0) {
            setActiveId(targetIds[targetIds.length - 1]);
            ticking = false;
            return;
          }

          let current = targetIds[0] || "";
          const triggerLine = window.innerWidth < 1280 ? 225 : 165;
          for (const id of targetIds) {
            const el = document.getElementById(id);
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            if (rect.top <= triggerLine) {
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

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [targetIds]);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    setActiveId(id);
    setInlineOpen(false);
    const target = document.getElementById(id);
    if (target) {
      const w = window.innerWidth;
      const yOffset = w < 768 ? -170 : w < 1280 ? -130 : -84;
      const y = target.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
      if (window.history.pushState) {
        window.history.pushState(null, "", `#${id}`);
      }
    }
  };

  if (variant === "inline") {
    const totalSections = steps.length + (hasFaq ? 1 : 0);
    const activeIndex = targetIds.indexOf(activeId);
    const safeIdx = activeIndex >= 0 ? activeIndex : 0;
    const activeLabel =
      activeId === "frequently-asked-questions"
        ? "Frequently Asked Questions"
        : steps[safeIdx]
        ? `${safeIdx + 1}. ${steps[safeIdx].title.replace(/^\d+\.\s*/, "")}`
        : "Overview";

    return (
      <div className="sticky top-[108px] md:top-[68px] z-20 xl:hidden rounded-lg border border-hairline bg-surface/95 backdrop-blur-sm shadow-notion-card overflow-hidden">
        <button
          type="button"
          onClick={() => setInlineOpen((prev) => !prev)}
          aria-expanded={inlineOpen}
          className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 text-left hover:bg-canvas-soft/60 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <AlignLeft className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold text-ink shrink-0">On this page</span>
            <span className="text-ink-faint text-xs shrink-0">·</span>
            <span className="text-xs font-medium text-primary truncate">{activeLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-mono text-ink-muted tabular-nums">
              {safeIdx + 1}/{totalSections}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-ink-muted shrink-0 transition-transform duration-200 ${
                inlineOpen ? "rotate-180" : "rotate-0"
              }`}
            />
          </div>
        </button>

        <div
          className={`grid transition-all duration-200 ease-in-out ${
            inlineOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <nav className="border-t border-hairline px-3 py-2 space-y-0.5 max-h-[52vh] overflow-y-auto sleek-scrollbar">
              {steps.map((step, idx) => {
                const anchorId = `step-${idx + 1}`;
                const isActive = activeId === anchorId;

                return (
                  <a
                    key={anchorId}
                    href={`#${anchorId}`}
                    onClick={(e) => scrollToSection(e, anchorId)}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-sm text-xs transition-colors ${
                      isActive
                        ? "bg-primary/[0.08] text-primary font-semibold"
                        : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
                    }`}
                  >
                    <span className="flex items-start gap-2 min-w-0">
                      <span className={`font-mono text-[11px] tabular-nums shrink-0 mt-0.5 ${isActive ? "text-primary" : "text-ink-faint"}`}>
                        {idx + 1}.
                      </span>
                      <span className="leading-snug">{step.title.replace(/^\d+\.\s*/, "")}</span>
                    </span>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                  </a>
                );
              })}

              {hasFaq && (
                <a
                  href="#frequently-asked-questions"
                  onClick={(e) => scrollToSection(e, "frequently-asked-questions")}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-sm text-xs transition-colors ${
                    activeId === "frequently-asked-questions"
                      ? "bg-primary/[0.08] text-primary font-semibold"
                      : "text-ink-secondary hover:text-ink hover:bg-canvas-soft"
                  }`}
                >
                  <span className="flex items-start gap-2 min-w-0">
                    <span className={`font-mono text-[11px] shrink-0 mt-0.5 ${activeId === "frequently-asked-questions" ? "text-primary" : "text-ink-faint"}`}>?</span>
                    <span className="leading-snug">Frequently Asked Questions</span>
                  </span>
                  {activeId === "frequently-asked-questions" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  )}
                </a>
              )}
            </nav>
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside className="hidden xl:block w-56 2xl:w-60 shrink-0 sticky top-20 select-none">
      <div className="space-y-2.5">
        <p className="notion-eyebrow text-ink-muted">On this page</p>
        <nav className="border-l border-hairline space-y-0.5">
          {steps.map((step, idx) => {
            const anchorId = `step-${idx + 1}`;
            const isActive = activeId === anchorId;

            return (
              <a
                key={anchorId}
                href={`#${anchorId}`}
                onClick={(e) => scrollToSection(e, anchorId)}
                title={step.title}
                className={`block py-1.5 pl-3.5 -ml-[1px] border-l-2 text-xs leading-snug transition-colors duration-150 ${
                  isActive
                    ? "border-primary text-primary font-semibold"
                    : "border-transparent text-ink-muted hover:text-ink hover:border-ink-faint"
                }`}
              >
                <span className="line-clamp-2">{step.title}</span>
              </a>
            );
          })}
          {hasFaq && (
            <a
              href="#frequently-asked-questions"
              onClick={(e) => scrollToSection(e, "frequently-asked-questions")}
              title="Frequently Asked Questions"
              className={`block py-1.5 pl-3.5 -ml-[1px] border-l-2 text-xs leading-snug transition-colors duration-150 ${
                activeId === "frequently-asked-questions"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-ink-muted hover:text-ink hover:border-ink-faint"
              }`}
            >
              Frequently Asked Questions
            </a>
          )}
        </nav>
      </div>
    </aside>
  );
}
