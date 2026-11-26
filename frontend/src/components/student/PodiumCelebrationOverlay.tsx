"use client";

import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Trophy, Medal, Award } from "lucide-react";

interface PodiumCelebrationOverlayProps {
  rank: 1 | 2 | 3;
  studentName: string;
  googlePicture?: string | null;
  getTargetRect: () => DOMRect | null;
  onStartGlide: () => void;
  onRevealTarget?: () => void;
  onComplete: () => void;
}

interface ConfettiPiece {
  id: number;
  leftPct: number;
  width: number;
  height: number;
  color: string;
  delayMs: number;
  durationSec: number;
  driftPx: number;
  rotateDeg: number;
}

const CONFETTI_COLORS = [
  "#e5ad68", // Champagne Gold
  "#2383e2", // Electric Notion Blue
  "#10b981", // Emerald
  "#cbd5e1", // Platinum Silver
  "#f59e0b", // Warm Amber
  "#d97706", // Antique Bronze
];

const CONFETTI_PIECES: ConfettiPiece[] = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  leftPct: ((i * 37) % 94) + 3,
  width: i % 3 === 0 ? 7 : 5,
  height: i % 2 === 0 ? 11 : 7,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delayMs: (i % 7) * 90,
  durationSec: 2.1 + (i % 5) * 0.24,
  driftPx: (i % 2 === 0 ? 1 : -1) * (14 + (i % 4) * 12),
  rotateDeg: (i % 2 === 0 ? 1 : -1) * (280 + (i % 4) * 110),
}));

export function PodiumCelebrationOverlay({
  rank,
  studentName,
  googlePicture,
  getTargetRect,
  onStartGlide,
  onRevealTarget,
  onComplete,
}: PodiumCelebrationOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState<"greeting" | "gliding">("greeting");
  const [frozenRect, setFrozenRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [glideTransform, setGlideTransform] = useState<{
    dx: number;
    dy: number;
    scale: number;
  } | null>(null);
  const [glideFadingOut, setGlideFadingOut] = useState(false);

  const heroAvatarRef = useRef<HTMLDivElement>(null);
  const onStartGlideRef = useRef(onStartGlide);
  const onRevealTargetRef = useRef(onRevealTarget);
  const onCompleteRef = useRef(onComplete);
  onStartGlideRef.current = onStartGlide;
  onRevealTargetRef.current = onRevealTarget;
  onCompleteRef.current = onComplete;

  const initial = (studentName || "S").trim().charAt(0).toUpperCase();
  const ordinal = rank === 1 ? "1st" : rank === 2 ? "2nd" : "3rd";

  const theme =
    rank === 1
      ? {
          Icon: Trophy,
          ringClass: "ring-[#e5ad68] bg-[#faf4ec] text-[#7a4e18] dark:bg-[#241a10] dark:text-[#e5ad68]",
          pillClass: "bg-[#faf4ec] text-[#7a4e18] border-[#e8dac5] dark:bg-[#241a10] dark:text-[#e5ad68] dark:border-[#422c17]",
          iconColor: "text-[#b07b30] dark:text-[#e5ad68]",
          glowColor: "bg-amber-400/25",
        }
      : rank === 2
      ? {
          Icon: Medal,
          ringClass: "ring-slate-300 bg-[#f1f0ee] text-[#4d4a46] dark:bg-[#1e1e1e] dark:text-[#d4d2ce]",
          pillClass: "bg-[#f1f0ee] text-[#4d4a46] border-[#dedcd8] dark:bg-[#1e1e1e] dark:text-[#c7c5c0] dark:border-[#343434]",
          iconColor: "text-[#6c6964] dark:text-[#b8b5b0]",
          glowColor: "bg-slate-300/25",
        }
      : {
          Icon: Award,
          ringClass: "ring-[#c4ae97] bg-[#f4f1ec] text-[#594532] dark:bg-[#221b14] dark:text-[#c4ae97]",
          pillClass: "bg-[#f4f1ec] text-[#594532] border-[#ded5c7] dark:bg-[#221b14] dark:text-[#c4ae97] dark:border-[#3d2f23]",
          iconColor: "text-[#8b6542] dark:text-[#c4ae97]",
          glowColor: "bg-amber-700/25",
        };

  const IconComponent = theme.Icon;

  useEffect(() => {
    setMounted(true);

    let raf1 = 0;
    let raf2 = 0;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    let doneTimer: ReturnType<typeof setTimeout> | undefined;

    // 1. Greeting spotlight holds cleanly centered for 2.15s, then triggers Podium mount + smooth FLIP glide
    const greetingTimer = setTimeout(() => {
      const heroRect = heroAvatarRef.current?.getBoundingClientRect();
      if (heroRect && heroRect.width > 0) {
        setFrozenRect({
          left: heroRect.left,
          top: heroRect.top,
          width: heroRect.width,
          height: heroRect.height,
        });
      }

      setStage("gliding");
      // Tell ExamRankedTable to mount <PodiumBooths /> right as the glide starts
      onStartGlideRef.current();

      // Wait two animation frames so <PodiumBooths /> commits into DOM with exact final slot bounds
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          const targetRect = getTargetRect();
          if (heroRect && targetRect && heroRect.width > 0 && targetRect.width > 0) {
            const heroCenterX = heroRect.left + heroRect.width / 2;
            const heroCenterY = heroRect.top + heroRect.height / 2;
            const targetCenterX = targetRect.left + targetRect.width / 2;
            const targetCenterY = targetRect.top + targetRect.height / 2;

            setGlideTransform({
              dx: targetCenterX - heroCenterX,
              dy: targetCenterY - heroCenterY,
              scale: targetRect.width / heroRect.width,
            });
          }

          // After smooth 950ms glide reaches destination, cross-fade booth avatar underneath cleanly then unmount
          fadeTimer = setTimeout(() => {
            onRevealTargetRef.current?.();
            setGlideFadingOut(true);
            setTimeout(() => {
              onCompleteRef.current();
            }, 180);
          }, 960);
        });
      });
    }, 2150);

    // Fallback safety cleanup
    doneTimer = setTimeout(() => {
      onCompleteRef.current();
    }, 3800);

    return () => {
      clearTimeout(greetingTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
      if (doneTimer) clearTimeout(doneTimer);
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSkip = () => {
    onStartGlideRef.current();
    onCompleteRef.current();
  };

  if (!mounted) return null;

  return createPortal(
    <div
      onClick={handleSkip}
      className={`fixed inset-0 z-[140] flex items-center justify-center p-4 select-none overflow-hidden ${
        stage === "gliding" ? "pointer-events-none" : "pointer-events-auto cursor-pointer"
      }`}
      role="status"
      aria-live="polite"
    >
      {/* Centered Soft Backdrop Dimmer during Greeting Stage */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-500 ${
          stage === "gliding" ? "opacity-0" : "opacity-100"
        }`}
      />

      {/* Lightweight Pure-CSS Falling Confetti Ribbons */}
      <div
        className={`fixed inset-0 pointer-events-none overflow-hidden transition-opacity duration-500 ${
          stage === "gliding" ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden="true"
      >
        {CONFETTI_PIECES.map((piece) => (
          <span
            key={piece.id}
            className="animate-confetti-fall absolute -top-4 rounded-[2px]"
            style={
              {
                left: `${piece.leftPct}%`,
                width: `${piece.width}px`,
                height: `${piece.height}px`,
                backgroundColor: piece.color,
                "--confetti-delay": `${piece.delayMs}ms`,
                "--confetti-dur": `${piece.durationSec}s`,
                "--confetti-drift": `${piece.driftPx}px`,
                "--confetti-rot": `${piece.rotateDeg}deg`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Horizontally & Vertically Centered Greeting Card */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-xs sm:max-w-sm">
        {/* Hero Avatar Placeholder slot inside centered stage (hidden once frozen fixed clone takes over for gliding) */}
        <div
          className={`relative flex items-center justify-center mb-4 ${
            frozenRect ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <div
            className={`absolute -inset-4 rounded-full blur-xl transition-opacity duration-400 ${theme.glowColor}`}
            aria-hidden="true"
          />
          <div
            ref={heroAvatarRef}
            className={`animate-hero-flip-bounce relative h-20 w-20 sm:h-24 sm:w-24 rounded-full overflow-hidden ring-[3px] shadow-2xl flex items-center justify-center font-bold text-2xl sm:text-3xl ${theme.ringClass}`}
          >
            {googlePicture ? (
              <img src={googlePicture} alt={studentName} className="h-full w-full object-cover" />
            ) : (
              <span>{initial}</span>
            )}
          </div>
        </div>

        {/* Luxury Title & Trophy Card */}
        <div
          className={`flex flex-col items-center gap-2 rounded-2xl border border-hairline bg-surface/95 px-6 py-4 shadow-notion-modal transition-all duration-400 ${
            stage === "gliding" ? "opacity-0 scale-95 translate-y-2" : "opacity-100 scale-100 translate-y-0"
          }`}
        >
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-2xs ${theme.pillClass}`}
          >
            <IconComponent className={`h-3.5 w-3.5 ${theme.iconColor}`} />
            <span>Class Rank #{rank}</span>
          </span>

          <h3 className="text-base sm:text-lg font-bold tracking-tight text-ink">
            Congratulations!
          </h3>
          <p className="text-xs sm:text-sm font-medium text-ink-secondary leading-snug">
            You have scored <span className="font-bold text-ink">{ordinal}</span> in your class
          </p>
        </div>
      </div>

      {/* Gliding Fixed Avatar Clone (starts at exact frozenRect (0,0,1), transitions cleanly to booth slot) */}
      {frozenRect && (
        <div
          style={{
            position: "fixed",
            left: `${frozenRect.left}px`,
            top: `${frozenRect.top}px`,
            width: `${frozenRect.width}px`,
            height: `${frozenRect.height}px`,
            transformOrigin: "center center",
            transform: glideTransform
              ? `translate3d(${glideTransform.dx}px, ${glideTransform.dy}px, 0) scale(${glideTransform.scale})`
              : "translate3d(0px, 0px, 0) scale(1)",
            opacity: glideFadingOut ? 0 : 1,
            transition:
              "transform 950ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out",
            willChange: "transform, opacity",
            zIndex: 150,
          }}
          className={`rounded-full overflow-hidden ring-[3px] shadow-2xl flex items-center justify-center font-bold text-2xl sm:text-3xl ${theme.ringClass}`}
        >
          {googlePicture ? (
            <img src={googlePicture} alt={studentName} className="h-full w-full object-cover" />
          ) : (
            <span>{initial}</span>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
