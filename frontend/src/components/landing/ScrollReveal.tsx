"use client";

import React, { useEffect, useRef, useState } from "react";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}

/**
 * Lightweight native IntersectionObserver reveal with one-shot blur-fade entrance.
 * Zero external animation libraries; strips blur on finish to protect mobile GPU memory.
 */
export function ScrollReveal({
  children,
  className = "",
  delayMs = 0,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setVisible(true);
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -32px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${className} transition-[opacity,transform,filter] duration-[920ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity,transform] ${
        visible
          ? "opacity-100 translate-y-0 blur-0"
          : "opacity-0 translate-y-3 blur-[5px]"
      }`}
      style={delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}

interface WordRevealTextProps {
  text: string;
  baseDelayMs?: number;
  stepMs?: number;
  className?: string;
}

/**
 * Splits headline strings word-by-word with subtle blurred mount stagger,
 * preserving natural whitespace wrapping across responsive viewports.
 */
export function WordRevealText({
  text,
  baseDelayMs = 80,
  stepMs = 56,
  className = "",
}: WordRevealTextProps) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((word, idx) => (
        <React.Fragment key={`${word}-${idx}`}>
          <span
            className="inline-block animate-landing-word-in"
            style={{ animationDelay: `${baseDelayMs + idx * stepMs}ms` }}
          >
            {word}
          </span>
          {idx < words.length - 1 ? " " : ""}
        </React.Fragment>
      ))}
    </span>
  );
}
