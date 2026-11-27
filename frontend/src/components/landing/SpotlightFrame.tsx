"use client";

import React, { useRef } from "react";

interface SpotlightFrameProps {
  children: React.ReactNode;
  variant?: "studio" | "card";
  className?: string;
}

/**
 * Architectural studio spotlight wrapper.
 * Tracks pointer coordinates via CSS custom properties without React re-renders,
 * projecting a quiet radial highlight inside Notion-faithful hairline borders.
 */
export function SpotlightFrame({
  children,
  variant = "card",
  className = "",
}: SpotlightFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    containerRef.current.style.setProperty("--spot-x", `${x}px`);
    containerRef.current.style.setProperty("--spot-y", `${y}px`);
    containerRef.current.style.setProperty("--spot-opacity", "1");
  };

  const handlePointerLeave = () => {
    if (!containerRef.current) return;
    containerRef.current.style.setProperty("--spot-opacity", "0");
  };

  if (variant === "studio") {
    return (
      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className={`relative rounded-xl border border-[#2a2927] dark:border-[#2a2a2a] bg-[#141413] dark:bg-[#111111] text-[#ebebeb] overflow-hidden shadow-[0_24px_64px_-20px_rgba(0,0,0,0.45)] ${className}`}
      >
        {/* Top specular hairline */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px z-20"
          style={{
            background:
              "linear-gradient(90deg, transparent 8%, rgba(255,255,255,0.22) 50%, transparent 92%)",
          }}
        />
        {/* Studio overhead spotlight cone */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(ellipse 72% 48% at 50% 0%, rgba(35, 131, 226, 0.14) 0%, rgba(35, 131, 226, 0.04) 46%, transparent 78%)",
          }}
        />
        {/* Subtle cursor-follow specular fill (desktop mouse only) */}
        <div
          aria-hidden="true"
          className="pointer-events-none hidden md:block absolute inset-0 z-0 transition-opacity duration-300"
          style={{
            opacity: "var(--spot-opacity, 0)",
            background:
              "radial-gradient(380px circle at var(--spot-x, 50%) var(--spot-y, 30%), rgba(35, 131, 226, 0.11), transparent 70%)",
          }}
        />
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`group relative rounded-lg border border-hairline bg-surface shadow-notion-card overflow-hidden transition-colors hover:border-[#cfccc7] dark:hover:border-[#3d3d3d] ${className}`}
    >
      {/* Top quiet highlight rim */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            "linear-gradient(90deg, transparent 15%, rgba(0, 117, 222, 0.35) 50%, transparent 85%)",
        }}
      />
      {/* Subtle localized spotlight wash on mouse hover */}
      <div
        aria-hidden="true"
        className="pointer-events-none hidden md:block absolute inset-0 z-0 transition-opacity duration-300"
        style={{
          opacity: "var(--spot-opacity, 0)",
          background:
            "radial-gradient(320px circle at var(--spot-x, 50%) var(--spot-y, 35%), rgba(0, 117, 222, 0.06), transparent 72%)",
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

interface BlendedFeatureCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
  overlayPosition?: "bottom-left" | "bottom" | "top";
  className?: string;
  stageClassName?: string;
}

/**
 * Architectural feature card where the live microcomponent bleeds edge-to-edge as the canvas,
 * while the title and description float above an optical lens-blur + directional surface-shadow veil.
 */
export function BlendedFeatureCard({
  title,
  description,
  children,
  overlayPosition = "bottom-left",
  className = "",
  stageClassName = "",
}: BlendedFeatureCardProps) {
  const isTop = overlayPosition === "top";
  const isDiagonalBottomLeft = overlayPosition === "bottom-left";

  return (
    <SpotlightFrame className={`h-full ${className}`}>
      <div className="relative h-full flex flex-col justify-between overflow-hidden rounded-lg">
        {/* Background Live Microcomponent Canvas */}
        <div
          className={`relative z-0 transition-transform duration-700 ease-out group-hover:scale-[1.012] ${
            isTop
              ? "pt-28 sm:pt-32 px-4 sm:px-5 pb-4 sm:pb-5"
              : isDiagonalBottomLeft
              ? "px-4 sm:px-6 pt-4 sm:pt-5 pb-28 sm:pb-24"
              : "px-4 sm:px-5 pt-4 sm:pt-5 pb-28 sm:pb-28"
          } ${stageClassName}`}
        >
          {children}
        </div>

        {/* Optical Lens Blur Layer (inset-0 so masked feather reaches 0% cleanly with zero seam lines) */}
        <div
          aria-hidden="true"
          className="pointer-events-none hidden sm:block absolute inset-0 z-10 backdrop-blur-[9px] dark:backdrop-blur-[6px]"
          style={{
            WebkitMaskImage: isTop
              ? "linear-gradient(to bottom, rgba(0,0,0,1) 20%, rgba(0,0,0,0.62) 40%, rgba(0,0,0,0) 62%)"
              : isDiagonalBottomLeft
              ? "radial-gradient(ellipse 92% 64% at 20% 100%, rgba(0,0,0,1) 28%, rgba(0,0,0,0.65) 56%, rgba(0,0,0,0) 84%)"
              : "linear-gradient(to top, rgba(0,0,0,1) 22%, rgba(0,0,0,0.62) 42%, rgba(0,0,0,0) 64%)",
            maskImage: isTop
              ? "linear-gradient(to bottom, rgba(0,0,0,1) 20%, rgba(0,0,0,0.62) 40%, rgba(0,0,0,0) 62%)"
              : isDiagonalBottomLeft
              ? "radial-gradient(ellipse 92% 64% at 20% 100%, rgba(0,0,0,1) 28%, rgba(0,0,0,0.65) 56%, rgba(0,0,0,0) 84%)"
              : "linear-gradient(to top, rgba(0,0,0,1) 22%, rgba(0,0,0,0.62) 42%, rgba(0,0,0,0) 64%)",
          }}
        />

        {/* Light Mode Frosted Paper Curtain Feather Gradient */}
        <div
          aria-hidden="true"
          className="pointer-events-none dark:hidden absolute inset-0 z-10"
          style={{
            background: isTop
              ? "linear-gradient(to bottom, rgba(255, 255, 255, 0.98) 20%, rgba(255, 255, 255, 0.88) 38%, rgba(255, 255, 255, 0.42) 56%, rgba(255, 255, 255, 0) 74%)"
              : isDiagonalBottomLeft
              ? "radial-gradient(ellipse 95% 68% at 18% 100%, rgba(255, 255, 255, 0.98) 28%, rgba(255, 255, 255, 0.90) 50%, rgba(255, 255, 255, 0.46) 70%, rgba(255, 255, 255, 0) 88%), linear-gradient(to top, rgba(255, 255, 255, 0.97) 16%, rgba(255, 255, 255, 0.68) 34%, rgba(255, 255, 255, 0) 56%)"
              : "linear-gradient(to top, rgba(255, 255, 255, 0.98) 20%, rgba(255, 255, 255, 0.88) 38%, rgba(255, 255, 255, 0.42) 56%, rgba(255, 255, 255, 0) 74%)",
          }}
        />

        {/* Dark Mode Studio Curtain Shadow Feather Gradient */}
        <div
          aria-hidden="true"
          className="pointer-events-none hidden dark:block absolute inset-0 z-10"
          style={{
            background: isTop
              ? "linear-gradient(to bottom, rgba(8, 8, 10, 0.97) 18%, rgba(8, 8, 10, 0.84) 36%, rgba(10, 10, 12, 0.36) 54%, rgba(10, 10, 12, 0) 72%)"
              : isDiagonalBottomLeft
              ? "radial-gradient(ellipse 95% 68% at 18% 100%, rgba(8, 8, 10, 0.97) 26%, rgba(8, 8, 10, 0.86) 48%, rgba(10, 10, 12, 0.42) 68%, rgba(10, 10, 12, 0) 88%), linear-gradient(to top, rgba(8, 8, 10, 0.96) 14%, rgba(8, 8, 10, 0.62) 32%, rgba(10, 10, 12, 0) 54%)"
              : "linear-gradient(to top, rgba(8, 8, 10, 0.97) 18%, rgba(8, 8, 10, 0.84) 36%, rgba(10, 10, 12, 0.36) 54%, rgba(10, 10, 12, 0) 72%)",
          }}
        />

        {/* Overlaid Copy Anchor on Theme-Adaptive Curtain */}
        <div
          className={`pointer-events-none absolute inset-x-0 z-20 p-5 sm:p-6 ${
            isTop ? "top-0" : "bottom-0"
          }`}
        >
          <div className={`space-y-1 ${isDiagonalBottomLeft ? "max-w-md" : "max-w-full"}`}>
            <h3 className="text-base sm:text-lg font-bold tracking-tight text-ink dark:text-white leading-snug dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
              {title}
            </h3>
            <p className="text-xs sm:text-[13px] text-ink-secondary dark:text-[#c7c5c0] leading-relaxed">
              {description}
            </p>
          </div>
        </div>
      </div>
    </SpotlightFrame>
  );
}
