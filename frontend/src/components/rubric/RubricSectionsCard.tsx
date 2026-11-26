"use client";

import React from "react";
import { Sparkles, Check } from "lucide-react";
import { ExamSection } from "@/lib/types";

interface RubricSectionsCardProps {
  sections?: ExamSection[];
  paperCapMarks: number;
}

export function RubricSectionsCard({
  sections,
  paperCapMarks,
}: RubricSectionsCardProps) {
  if (!sections || sections.length === 0) return null;

  return (
    <div className="rounded-lg border border-hairline bg-canvas-soft p-3.5 sm:p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <span className="notion-section-title text-sm text-ink">
            Exam Sections &amp; Choice Rules
          </span>
        </div>
        <span className="text-xs font-mono tabular-nums font-semibold text-ink-secondary">
          Paper Cap: {paperCapMarks} Marks
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {sections.map((sec, idx) => (
          <div
            key={sec.section_id || idx}
            className="notion-card rounded-lg p-3.5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-primary font-mono">
                  {sec.section_id}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-canvas-soft border border-hairline text-ink-secondary font-mono tabular-nums">
                  {sec.max_marks} Marks
                </span>
              </div>
              {sec.title && (
                <div className="text-xs font-semibold text-ink mt-1.5">
                  {sec.title}
                </div>
              )}
              <div className="text-xs text-ink-muted mt-1 leading-relaxed">
                {sec.instructions ||
                  (sec.attempt_limit
                    ? `Attempt any ${sec.attempt_limit}`
                    : "All compulsory")}
              </div>
            </div>
            {sec.attempt_limit && (
              <div className="mt-2.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <Check className="h-3 w-3 shrink-0" />
                <span>Best of {sec.attempt_limit} Rule Active</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
