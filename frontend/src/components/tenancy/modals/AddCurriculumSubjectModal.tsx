"use client";

import React, { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { ModalCard, FormInput } from "@/components/ui";

export interface AddCurriculumSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (subjectInput: string) => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
}

export const AddCurriculumSubjectModal: React.FC<AddCurriculumSubjectModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}) => {
  const [subjectInput, setSubjectInput] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectInput.trim()) return;
    await onSubmit(subjectInput.trim());
    setSubjectInput("");
  };

  return (
    <ModalCard isOpen={isOpen} onClose={onClose} title="Add Curriculum Subject to Institute">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-2.5 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-xs text-ink-muted leading-relaxed">
          Configure approved academic subjects for this institute. Teachers and branch managers can select these subjects when creating exams and entering results.
        </p>

        <FormInput
          label="Subject Name(s)"
          required
          placeholder="e.g. Physics, Chemistry, Computer Science"
          value={subjectInput}
          onChange={(e) => setSubjectInput(e.target.value)}
        />

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
          <span>Quick add:</span>
          {["Physics", "Chemistry", "Maths", "Biology", "English", "Informatics", "Accountancy"].map((suggested) => (
            <button
              key={suggested}
              type="button"
              onClick={() => {
                const current = subjectInput.trim();
                if (!current) {
                  setSubjectInput(suggested);
                } else if (!current.toLowerCase().includes(suggested.toLowerCase())) {
                  setSubjectInput(`${current}, ${suggested}`);
                }
              }}
              className="hover:text-primary text-[11px] font-medium px-2 py-0.5 rounded-xs bg-surface border border-hairline hover:border-primary/40 cursor-pointer"
            >
              +{suggested}
            </button>
          ))}
        </div>

        <div className="pt-3 grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2 border-t border-hairline">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="notion-btn-utility justify-center disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="notion-btn-primary justify-center disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
            <span>Add Subject</span>
          </button>
        </div>
      </form>
    </ModalCard>
  );
};
