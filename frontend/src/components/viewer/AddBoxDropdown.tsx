"use client";

import React, { useState } from "react";
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
        className="btn-glass-utility inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-ink transition-all cursor-pointer"
        title={`Add bounding box for any question on Page ${currentPage}`}
      >
        <Plus className="h-3.5 w-3.5 text-primary" />
        <span className="hidden sm:inline">Add Box to Page {currentPage}</span>
        <span className="sm:hidden">Add Box</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 max-h-80 overflow-y-auto rounded-lg bg-surface border border-hairline shadow-lg z-50 p-2 space-y-1.5 animate-in fade-in zoom-in-95">
          <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted px-1 py-1 border-b border-hairline flex items-center justify-between">
            <span>Add Box on Page {currentPage}</span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setSearch("");
              }}
              className="text-ink-muted hover:text-ink cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          <div className="px-0.5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search question (e.g. Q4.2)..."
              className="w-full px-2 py-1 text-xs rounded border border-hairline bg-canvas-soft text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
              autoFocus
            />
          </div>

          <div className="text-[10px] text-ink-muted px-1">
            Select question to link continuation:
          </div>

          <div className="space-y-1 max-h-56 overflow-y-auto">
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
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left text-xs hover:bg-canvas-soft transition-colors cursor-pointer group"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-mono font-bold text-ink group-hover:text-primary block truncate">
                      {ans.question_id}
                    </span>
                    <span className="text-[10px] text-ink-muted block truncate">
                      {ans.question_text
                        ? ans.question_text.slice(0, 30) + "..."
                        : `${ans.awarded_marks}/${ans.max_marks} marks`}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium shrink-0 ${
                      hasRegionHere
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : regionCount > 0
                        ? "bg-teal-50 text-teal-700 border border-teal-200"
                        : "bg-canvas-soft text-ink-muted border border-hairline"
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
      )}
    </div>
  );
}
