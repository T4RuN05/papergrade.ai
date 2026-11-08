"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const selectedOption = options.find((opt) => opt.value === value);

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
      setIsExiting(false);
      setIsOpen(true);
    }
  };

  const handleSelect = (val: string) => {
    onChange(val);
    handleClose();
  };

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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

      {/* Floating Popover Menu with Apple Smooth In & Out Animation */}
      {isOpen && (
        <div
          role="listbox"
          className={`absolute top-full mt-1.5 ${
            align === "right" ? "right-0" : "left-0"
          } min-w-[160px] max-w-xs w-max bg-surface dark:bg-[#1c1c1e] rounded-lg border border-hairline shadow-notion-modal p-1 z-50 overflow-hidden ${
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
        </div>
      )}
    </div>
  );
}

