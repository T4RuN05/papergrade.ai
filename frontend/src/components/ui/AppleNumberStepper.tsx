"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Minus, Plus } from "lucide-react";

export interface AppleNumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  suffix?: string;
  prefix?: string;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  allowDecimal?: boolean;
  placeholder?: string;
}

export function AppleNumberStepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  suffix,
  prefix,
  className = "",
  disabled = false,
  size = "md",
  allowDecimal = false,
  placeholder,
}: AppleNumberStepperProps) {
  const [slideDir, setSlideDir] = useState<"up" | "down" | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(value ?? 0));
  const inputRef = useRef<HTMLInputElement>(null);

  // Repeat timer refs for continuous press-and-hold
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const speedRef = useRef<NodeJS.Timeout | null>(null);

  // Sync internal string when external value updates while not typing
  useEffect(() => {
    if (!isEditing) {
      setInputValue(String(value ?? 0));
    }
  }, [value, isEditing]);

  const clamp = useCallback(
    (val: number) => {
      let clamped = val;
      if (min !== undefined && clamped < min) clamped = min;
      if (max !== undefined && clamped > max) clamped = max;
      return clamped;
    },
    [min, max]
  );

  const stepBy = useCallback(
    (delta: number) => {
      if (disabled) return;
      const current = typeof value === "number" && !isNaN(value) ? value : min !== -Infinity ? min : 0;
      let next = current + delta;

      // Handle floating point precision safely
      if (allowDecimal || String(step).includes(".")) {
        const decimals = (String(step).split(".")[1] || "").length;
        next = parseFloat(next.toFixed(Math.max(1, decimals)));
      } else {
        next = Math.round(next);
      }

      next = clamp(next);

      if (next !== current) {
        setSlideDir(delta > 0 ? "up" : "down");
        setAnimKey((k) => k + 1);
        onChange(next);
      }
    },
    [value, step, min, clamp, disabled, allowDecimal, onChange]
  );

  // Continuous hold handling with Apple-style progressive acceleration
  const stopHold = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (speedRef.current) {
      clearTimeout(speedRef.current);
      speedRef.current = null;
    }
  }, []);

  const startHold = useCallback(
    (delta: number) => {
      if (disabled) return;
      stopHold();
      stepBy(delta);

      // Start initial delay before rapid stepping
      speedRef.current = setTimeout(() => {
        timerRef.current = setInterval(() => {
          stepBy(delta);
        }, 80);
      }, 350);
    },
    [disabled, stepBy, stopHold]
  );

  useEffect(() => {
    return () => stopHold();
  }, [stopHold]);

  // Handle manual input commit
  const handleCommitManualInput = () => {
    setIsEditing(false);
    const cleaned = inputValue.trim().replace(/,/g, "");
    if (cleaned === "" || isNaN(Number(cleaned))) {
      setInputValue(String(value ?? 0));
      return;
    }
    let parsed = parseFloat(cleaned);
    if (!allowDecimal && !String(step).includes(".")) {
      parsed = Math.round(parsed);
    }
    const clamped = clamp(parsed);
    if (clamped !== value) {
      setSlideDir(clamped > value ? "up" : "down");
      setAnimKey((k) => k + 1);
      onChange(clamped);
    }
    setInputValue(String(clamped));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommitManualInput();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setInputValue(String(value ?? 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      stepBy(step);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      stepBy(-step);
    }
  };

  const handleDisplayClick = () => {
    if (disabled) return;
    setIsEditing(true);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 10);
  };

  const isMin = min !== undefined && value <= min;
  const isMax = max !== undefined && value >= max;

  // Sizing definitions matching Apple design tokens
  const containerHeights = {
    sm: "h-7 sm:h-8 text-xs",
    md: "h-8.5 sm:h-9 text-xs sm:text-[13px]",
    lg: "h-10 sm:h-11 text-sm",
  }[size];

  const buttonPadding = {
    sm: "px-2 py-1",
    md: "px-2.5 py-1.5",
    lg: "px-3 py-2",
  }[size];

  return (
    <div
      className={`relative inline-flex items-center rounded-lg border border-hairline bg-surface dark:bg-[#202020] shadow-2xs hover:border-hairline-hover transition-colors overflow-hidden group select-none ${
        disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : ""
      } ${containerHeights} ${className}`}
    >
      {/* Minus Button */}
      <button
        type="button"
        disabled={disabled || isMin}
        onMouseDown={() => startHold(-step)}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        onTouchStart={() => startHold(-step)}
        onTouchEnd={stopHold}
        onTouchCancel={stopHold}
        className={`${buttonPadding} h-full flex items-center justify-center text-ink-muted hover:text-ink hover:bg-canvas-soft dark:hover:bg-white/5 active:scale-90 transition-all border-r border-hairline disabled:opacity-25 disabled:pointer-events-none cursor-pointer`}
        title={`Decrease by ${step}`}
        aria-label="Decrease value"
      >
        <Minus className="h-3 w-3 sm:h-3.5 sm:w-3.5 stroke-[2.2]" />
      </button>

      {/* Center Value Display & Inline Manual Input */}
      <div
        onClick={handleDisplayClick}
        className="relative flex-1 flex items-center justify-center h-full min-w-[3.5rem] px-2 overflow-hidden cursor-text"
        title="Click to manually edit number"
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="number"
            step={step}
            value={inputValue}
            placeholder={placeholder}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleCommitManualInput}
            onKeyDown={handleKeyDown}
            className="w-full h-full bg-transparent text-center font-mono font-bold text-ink focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none p-0 m-0"
            autoFocus
          />
        ) : (
          <div className="flex items-center gap-1 font-mono font-bold text-ink select-none pointer-events-none">
            {prefix && <span className="text-[11px] font-normal text-ink-muted">{prefix}</span>}
            <span
              key={animKey}
              className={`inline-block tabular-nums ${
                slideDir === "up" ? "animate-number-up" : slideDir === "down" ? "animate-number-down" : ""
              }`}
            >
              {typeof value === "number" && !isNaN(value) ? value.toLocaleString() : "0"}
            </span>
            {suffix && (
              <span className="text-[10px] sm:text-[11px] font-medium text-ink-muted font-sans ml-0.5">
                {suffix}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Plus Button */}
      <button
        type="button"
        disabled={disabled || isMax}
        onMouseDown={() => startHold(step)}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        onTouchStart={() => startHold(step)}
        onTouchEnd={stopHold}
        onTouchCancel={stopHold}
        className={`${buttonPadding} h-full flex items-center justify-center text-ink-muted hover:text-ink hover:bg-canvas-soft dark:hover:bg-white/5 active:scale-90 transition-all border-l border-hairline disabled:opacity-25 disabled:pointer-events-none cursor-pointer`}
        title={`Increase by ${step}`}
        aria-label="Increase value"
      >
        <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5 stroke-[2.2]" />
      </button>
    </div>
  );
}

