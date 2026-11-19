"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import { BadgePill } from "@/components/ui";
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
    <div className="rounded-lg border border-hairline bg-canvas-soft p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold text-ink uppercase tracking-wider">
            Exam Sections & Choice Rules
          </span>
        </div>
        <span className="text-xs font-mono font-bold text-ink">
          Paper Cap: {paperCapMarks} Marks
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {sections.map((sec, idx) => (
          <div
            key={idx}
            className="rounded-md border border-hairline bg-surface p-3 flex flex-col justify-between shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary font-mono">
                  {sec.section_id}
                </span>
                <BadgePill label={`${sec.max_marks} Marks`} color="teal" />
              </div>
              {sec.title && (
                <div className="text-xs font-semibold text-ink mt-1.5">
                  {sec.title}
                </div>
              )}
              <div className="text-[11px] text-ink-muted mt-1 leading-relaxed">
                {sec.instructions ||
                  (sec.attempt_limit
                    ? `Attempt any ${sec.attempt_limit}`
                    : "All compulsory")}
              </div>
            </div>
            {sec.attempt_limit && (
              <div className="mt-2 text-[10px] font-semibold text-[#1aae39] flex items-center gap-1">
                <span>✓ Best of {sec.attempt_limit} Rule Active</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
