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
  zIndex?: number;
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
  zIndex,
}: AppleSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    minWidth: number;
    maxHeight: number;
    openUpward?: boolean;
  }>({ minWidth: 160, maxHeight: 240 });

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
    
    const NAVBAR_TOP_OFFSET = 60; // 56px sticky navbar + 4px clearance
    const VIEWPORT_BOTTOM_PADDING = 12;

    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - VIEWPORT_BOTTOM_PADDING);
    const spaceAbove = Math.max(0, rect.top - NAVBAR_TOP_OFFSET);

    // Auto-detect direction: prefer downward opening unless space below is tight (< 220px) AND space above is larger
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
    
    // Dynamically constrain max-height to the available space in the chosen direction
    const availableSpace = openUpward ? spaceAbove : spaceBelow;
    const dynamicMaxHeight = Math.max(100, Math.min(240, Math.floor(availableSpace)));

    const minWidth = Math.max(rect.width, 160);

    const isRightHalf = rect.right > window.innerWidth * 0.55;
    const effectiveAlign = align === "right" || isRightHalf ? "right" : "left";

    let left: number | undefined;
    let right: number | undefined;

    if (effectiveAlign === "right") {
      right = Math.max(12, window.innerWidth - rect.right);
    } else {
      left = Math.max(12, Math.min(rect.left, window.innerWidth - minWidth - 12));
    }

    setMenuCoords({
      top: openUpward ? undefined : Math.max(NAVBAR_TOP_OFFSET, rect.bottom + 6),
      bottom: openUpward ? Math.max(VIEWPORT_BOTTOM_PADDING, window.innerHeight - (rect.top - 6)) : undefined,
      left,
      right,
      minWidth,
      maxHeight: dynamicMaxHeight,
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

  // Close or reposition on scroll or resize
  useEffect(() => {
    if (!isOpen) return;
    updateCoords();

    const handleScroll = (e: Event) => {
      // Allow scrolling inside the dropdown menu items
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }

      // If the trigger button has scrolled off-screen or under the sticky Navbar, close
      if (buttonRef.current) {
        const r = buttonRef.current.getBoundingClientRect();
        if (r.bottom <= 56 || r.top >= window.innerHeight) {
          handleClose();
          return;
        }
      }

      // On mobile viewports, scrolling the page closes the dropdown
      if (window.innerWidth < 768) {
        handleClose();
        return;
      }

      updateCoords();
    };

    const handleResize = () => {
      updateCoords();
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen, updateCoords, handleClose]);

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
        (() => {
          const computedZIndex =
            zIndex ??
            (buttonRef.current?.closest('[role="dialog"], [data-modal="true"], .modal, [aria-modal="true"]')
              ? 110
              : buttonRef.current?.closest('header, nav, [data-navbar="true"]')
              ? 60
              : 40);

          return createPortal(
            <div
              ref={menuRef}
              role="listbox"
              data-apple-select-portal="true"
              style={{
                position: "fixed",
                top: menuCoords.top !== undefined ? `${menuCoords.top}px` : undefined,
                bottom: menuCoords.bottom !== undefined ? `${menuCoords.bottom}px` : undefined,
                left: menuCoords.left !== undefined ? `${menuCoords.left}px` : undefined,
                right: menuCoords.right !== undefined ? `${menuCoords.right}px` : undefined,
                minWidth: `${menuCoords.minWidth}px`,
                maxWidth: "calc(100vw - 24px)",
                maxHeight: `${menuCoords.maxHeight}px`,
                zIndex: computedZIndex,
              }}
              className={`bg-surface dark:bg-[#1c1c1e] rounded-lg border border-hairline shadow-notion-modal p-1 overflow-hidden flex flex-col ${
                isExiting ? "animate-apple-out" : "animate-apple-in"
              } ${menuClassName}`}
            >
              <div
                style={{ maxHeight: `${Math.max(80, menuCoords.maxHeight - 8)}px` }}
                className="overflow-y-auto space-y-0.5"
              >
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
        );
      })()}
    </div>
  );
}
