"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Building2, ChevronDown, Check } from "lucide-react";
import { useTenant } from "@/lib/TenantContext";
import { useToast } from "@/lib/ToastContext";
import { AppleSelect } from "@/components/ui";

export interface TenancySwitchDropdownProps {
  className?: string;
}

export const TenancySwitchDropdown: React.FC<TenancySwitchDropdownProps> = ({ className = "" }) => {
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();
  const {
    selectedInstitute,
    selectedBranch,
    institutes,
    branches,
    isRootAdmin,
    isInstituteDirector,
    isBranchManager,
    setInstituteId,
    setBranchId,
  } = useTenant();

  useEffect(() => {
    setMounted(true);
  }, []);

  const closeDropdown = useCallback(() => {
    setIsExiting(true);
    closeTimerRef.current = setTimeout(() => {
      setDropdownOpen(false);
      setIsExiting(false);
    }, 150);
  }, []);

  const toggleDropdown = () => {
    if (dropdownOpen) {
      closeDropdown();
    } else {
      setIsExiting(false);
      setDropdownOpen(true);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDropdown();
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dropdownOpen, closeDropdown]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleInstituteChange = (instId: string) => {
    setInstituteId(instId);
    const inst = institutes.find((i) => i.id === instId);
    if (inst) {
      toast.info(`Switched institute context to ${inst.name}`, { title: "Institution Changed" });
    }
  };

  const handleBranchChange = (branchId: string) => {
    setBranchId(branchId);
    const b = branches.find((item) => item.id === branchId);
    if (b) {
      toast.info(`Switched operational branch to ${b.name} (${b.city})`, { title: "Branch Changed" });
    }
  };

  return (
    <div ref={dropdownRef} className={`relative shrink min-w-0 ${className}`}>
      <button
        type="button"
        onClick={toggleDropdown}
        className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-md bg-canvas-soft hover:bg-surface border border-hairline text-xs transition-colors cursor-pointer max-w-[170px] xs:max-w-[210px] sm:max-w-[280px]"
        title="Click to switch active branch context"
      >
        <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="font-semibold text-ink truncate text-xs">
          {mounted
            ? selectedBranch?.name || selectedInstitute?.name || ((isBranchManager || isInstituteDirector) && branches[0]?.name) || "Select Branch"
            : "PaperGrade"}
        </span>
        <ChevronDown
          className={`h-3 w-3 text-ink-muted shrink-0 transition-transform duration-200 ease-out ${
            dropdownOpen && !isExiting ? "rotate-180 text-primary" : ""
          }`}
        />
      </button>

      {/* Notion Floating Popover Dropdown Menu */}
      {dropdownOpen && mounted && (
        <div
          className={`fixed sm:absolute top-14 left-3 right-3 sm:top-full sm:mt-1.5 sm:left-auto sm:right-0 sm:translate-x-0 w-auto sm:w-72 max-w-[calc(100vw-1.5rem)] sm:max-w-none bg-surface rounded-lg border border-hairline shadow-notion-modal p-2 z-[55] ${
            isExiting ? "animate-apple-out" : "animate-apple-in"
          }`}
        >
          <div className="px-2.5 py-1.5 text-xs font-medium text-ink-muted flex items-center justify-between border-b border-hairline mb-1.5">
            <span>Operational Branch</span>
            {isRootAdmin && <span className="text-[11px] text-primary font-medium">Root Admin</span>}
            {isInstituteDirector && <span className="text-[11px] text-primary font-medium">Director</span>}
          </div>

          {isRootAdmin && institutes.length > 1 && (
            <div className="mb-2 px-1">
              <label className="text-[11px] font-medium text-ink-muted block mb-1">Coaching Institute</label>
              <AppleSelect
                size="sm"
                value={selectedInstitute?.id || ""}
                onChange={(val) => handleInstituteChange(val)}
                options={institutes.map((inst) => ({ value: inst.id, label: inst.name }))}
                className="w-full"
              />
            </div>
          )}

          <div className="max-h-52 overflow-y-auto space-y-0.5">
            {branches.length === 0 ? (
              <p className="text-xs text-ink-muted p-2 text-center">No branches found</p>
            ) : (
              branches.map((b) => {
                const isSelected = b.id === selectedBranch?.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      handleBranchChange(b.id);
                      closeDropdown();
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-sm text-xs transition-colors cursor-pointer text-left select-none ${
                      isSelected
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-ink hover:bg-canvas-soft font-medium"
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="truncate font-semibold">{b.name}</p>
                      {b.city && <p className="text-[11px] text-ink-muted truncate">{b.city}</p>}
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
