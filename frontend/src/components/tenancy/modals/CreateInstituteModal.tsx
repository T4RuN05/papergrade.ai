"use client";

import React, { useState } from "react";
import { AlertCircle, Plus, X } from "lucide-react";
import { ModalCard, FormInput, ButtonUtility, ButtonPrimary } from "@/components/ui";

export interface CreateInstituteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; code: string; subjects: string[] }) => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
}

export const CreateInstituteModal: React.FC<CreateInstituteModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}) => {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [subjects, setSubjects] = useState<string[]>(["Physics", "Chemistry", "Maths", "Biology"]);
  const [subjectInput, setSubjectInput] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    await onSubmit({ name: name.trim(), code: code.trim().toUpperCase(), subjects });
    setName("");
    setCode("");
    setSubjects(["Physics", "Chemistry", "Maths", "Biology"]);
    setSubjectInput("");
  };

  const addSubject = (val: string) => {
    const clean = val.trim();
    if (!clean) return;
    if (!subjects.map((s) => s.toLowerCase()).includes(clean.toLowerCase())) {
      setSubjects([...subjects, clean]);
    }
    setSubjectInput("");
  };

  return (
    <ModalCard isOpen={isOpen} onClose={onClose} title="Register Coaching Institute">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-2.5 text-xs text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <FormInput
          label="Institute Name"
          required
          placeholder="e.g. Allen Career Institute / Resonance"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <FormInput
          label="Unique Code"
          required
          placeholder="e.g. ALLEN / RESO / FIITJEE"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />

        {/* Curriculum Subjects */}
        <div className="space-y-2 pt-1 border-t border-hairline">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-ink-secondary">Curriculum Subjects</label>
            <span className="text-[10px] text-ink-muted font-mono">{subjects.length} subjects configured</span>
          </div>

          <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-canvas-soft rounded-md border border-hairline">
            {subjects.map((sub, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
              >
                {sub}
                <button
                  type="button"
                  onClick={() => setSubjects(subjects.filter((_, i) => i !== idx))}
                  className="hover:text-red-500 rounded-full"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Type subject name (e.g. Computer Science) & press Add"
              value={subjectInput}
              onChange={(e) => setSubjectInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSubject(subjectInput);
                }
              }}
              className="flex-1 rounded-md border border-hairline bg-surface p-2 text-xs text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
            />
            <ButtonUtility
              type="button"
              onClick={() => addSubject(subjectInput)}
              className="text-xs py-2 px-3"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </ButtonUtility>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted pt-0.5">
            <span>Quick add:</span>
            {["Physics", "Chemistry", "Maths", "Biology", "English", "Informatics"].map((suggested) => (
              <button
                key={suggested}
                type="button"
                onClick={() => addSubject(suggested)}
                className="hover:text-primary text-[11px] font-medium px-1.5 py-0.5 rounded bg-surface border border-hairline hover:border-primary/40 cursor-pointer"
              >
                +{suggested}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-3 flex items-center justify-end gap-2 border-t border-hairline">
          <ButtonUtility type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </ButtonUtility>
          <ButtonPrimary type="submit" isLoading={isSubmitting}>
            Create Institute
          </ButtonPrimary>
        </div>
      </form>
    </ModalCard>
  );
};
