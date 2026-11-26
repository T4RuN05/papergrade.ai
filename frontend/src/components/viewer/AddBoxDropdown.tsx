"use client";

import React, { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { GradedAnswer } from "@/lib/types";

interface AddBoxDropdownProps {
  answers: GradedAnswer[];
  currentPage: number;
  onSpawnDraftBox: (ansId: string) => void;
}

export function AddBoxDropdown({
  answers,
  currentPage,
  onSpawnDraftBox,
}: AddBoxDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSearch("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const filteredAnswers = answers.filter((ans) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      ans.question_id.toLowerCase().includes(q) ||
      (ans.question_text || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="notion-btn-utility min-h-0 h-7 px-2.5"
        title={`Add bounding box for any question on Page ${currentPage}`}
      >
        <Plus className="h-3.5 w-3.5 text-primary" />
        <span className="hidden sm:inline">Add Box to Page {currentPage}</span>
        <span className="sm:hidden">Add Box</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop for click-outside dismissal */}
          <div
            className="fixed inset-0 z-40 bg-black/25 sm:bg-transparent"
            onClick={() => {
              setIsOpen(false);
              setSearch("");
            }}
            aria-hidden="true"
          />

          {/* Responsive popover: fixed & centered on mobile, absolute anchored on desktop */}
          <div className="fixed sm:absolute top-24 sm:top-full left-3 right-3 sm:left-0 sm:right-auto mt-0 sm:mt-1 w-auto sm:w-80 max-h-[75vh] sm:max-h-80 overflow-y-auto rounded-lg bg-surface border border-hairline shadow-notion-modal z-50 p-2 space-y-1.5">
            <div className="notion-eyebrow text-ink-muted px-1 py-1 border-b border-hairline flex items-center justify-between">
              <span>Add Box on Page {currentPage}</span>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setSearch("");
                }}
                className="text-ink-muted hover:text-ink cursor-pointer p-0.5 rounded-xs hover:bg-canvas-soft"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="px-0.5">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search question (e.g. Q4.2)..."
                className="w-full px-2.5 py-1.5 text-xs rounded-xs border border-hairline bg-canvas-soft focus:bg-surface text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary"
                autoFocus={typeof window !== "undefined" && window.innerWidth >= 640}
              />
            </div>

            <div className="text-[11px] text-ink-muted px-1">
              Select question to link continuation:
            </div>

            <div className="space-y-1 max-h-56 overflow-y-auto sleek-scrollbar">
              {filteredAnswers.map((ans) => {
                const hasRegionHere = (ans.regions || []).some(
                  (r) => r.page_number === currentPage
                );
                const regionCount = (ans.regions || []).length;
                return (
                  <button
                    key={ans.id}
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      setSearch("");
                      onSpawnDraftBox(ans.id);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm text-left text-xs hover:bg-canvas-soft transition-colors cursor-pointer group"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-mono font-semibold text-ink group-hover:text-primary block truncate">
                        {ans.question_id}
                      </span>
                      <span className="text-[11px] text-ink-muted block truncate">
                        {ans.question_text
                          ? ans.question_text.slice(0, 30) + "..."
                          : `${ans.awarded_marks}/${ans.max_marks} marks`}
                      </span>
                    </div>
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded-xs font-mono font-medium shrink-0 border border-hairline bg-canvas-soft ${
                        hasRegionHere
                          ? "text-[#1aae39]"
                          : regionCount > 0
                          ? "text-[#2a9d99]"
                          : "text-ink-muted"
                      }`}
                    >
                      {hasRegionHere
                        ? "On Sheet"
                        : regionCount > 0
                        ? `+ Spans (${regionCount})`
                        : "+ Add New"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
