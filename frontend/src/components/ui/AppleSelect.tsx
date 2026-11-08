"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export interface AppleSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface AppleSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: AppleSelectOption[];
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  align?: "left" | "right";
  icon?: React.ReactNode;
  "aria-label"?: string;
}

export function AppleSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className = "",
  buttonClassName = "",
  menuClassName = "",
  size = "md",
  disabled = false,
  align = "left",
  icon,
  "aria-label": ariaLabel,
}: AppleSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{
    top: number;
    left: number;
    minWidth: number;
    openUpward?: boolean;
  }>({ top: 0, left: 0, minWidth: 160 });

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  const updateCoords = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < 220 && rect.top > 220;
    const minWidth = Math.max(rect.width, 160);

    let left = align === "right" ? rect.right - minWidth : rect.left;
    if (left + minWidth > window.innerWidth - 12) {
      left = window.innerWidth - minWidth - 12;
    }
    if (left < 12) {
      left = 12;
    }

    setMenuCoords({
      top: openUpward ? rect.top - 6 : rect.bottom + 6,
      left,
      minWidth,
      openUpward,
    });
  }, [align]);

  const handleClose = useCallback(() => {
    if (!isOpen || isExiting) return;
    setIsExiting(true);
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsExiting(false);
    }, 140);
  }, [isOpen, isExiting]);

  const handleToggle = () => {
    if (disabled) return;
    if (isOpen) {
      handleClose();
    } else {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      updateCoords();
      setIsExiting(false);
      setIsOpen(true);
    }
  };

  const handleSelect = (val: string) => {
    onChange(val);
    handleClose();
  };

  // Recalculate coordinates on window scroll or resize while open
  useEffect(() => {
    if (!isOpen) return;
    updateCoords();
    const handleScrollOrResize = () => {
      updateCoords();
    };
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [isOpen, updateCoords]);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        handleClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleClose]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const sizeStyles = {
    sm: "h-8 px-2.5 text-xs rounded-md",
    md: "h-9 px-3 text-xs rounded-md",
  }[size];

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {/* Dropdown Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-label={ariaLabel || selectedOption?.label || placeholder}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between gap-2 border border-hairline bg-surface dark:bg-[#202020] hover:bg-canvas-soft dark:hover:bg-[#282828] text-ink font-semibold transition-all shadow-2xs select-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${sizeStyles} ${buttonClassName}`}
      >
        <span className="flex items-center gap-1.5 truncate">
          {icon && <span className="shrink-0 text-ink-muted">{icon}</span>}
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-ink-muted shrink-0 transition-transform duration-200 ease-out ${
            isOpen ? "rotate-180 text-primary" : ""
          }`}
        />
      </button>

      {/* Floating Popover Menu Portaled to document.body with Apple Smooth In & Out Animation */}
      {isOpen &&
        mounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            data-apple-select-portal="true"
            style={{
              position: "fixed",
              top: menuCoords.openUpward ? undefined : `${menuCoords.top}px`,
              bottom: menuCoords.openUpward ? `${Math.max(8, window.innerHeight - menuCoords.top)}px` : undefined,
              left: `${menuCoords.left}px`,
              minWidth: `${menuCoords.minWidth}px`,
              maxWidth: "calc(100vw - 24px)",
              zIndex: 99999,
            }}
            className={`bg-surface dark:bg-[#1c1c1e] rounded-lg border border-hairline shadow-notion-modal p-1 overflow-hidden ${
              isExiting ? "animate-apple-out" : "animate-apple-in"
            } ${menuClassName}`}
          >
            <div className="max-h-60 overflow-y-auto space-y-0.5">
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onClick={() => !opt.disabled && handleSelect(opt.value)}
                    className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer text-left select-none ${
                      isSelected
                        ? "bg-primary/10 text-primary font-bold dark:bg-primary/20"
                        : "text-ink hover:bg-canvas-soft dark:hover:bg-white/5 font-medium"
                    } ${opt.disabled ? "opacity-35 cursor-not-allowed" : ""}`}
                  >
                    <div className="min-w-0 flex items-center gap-1.5 truncate">
                      {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                      <span className="truncate">{opt.label}</span>
                      {opt.sublabel && (
                        <span className="text-[10px] text-ink-muted font-normal truncate">
                          ({opt.sublabel})
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
