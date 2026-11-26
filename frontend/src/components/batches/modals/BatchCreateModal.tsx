"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { ModalCard, FormInput } from "@/components/ui";

interface BatchCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; academic_year: string }) => Promise<void>;
  isSubmitting?: boolean;
}

export function BatchCreateModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
}: BatchCreateModalProps) {
  const [name, setName] = useState("");
  const [year, setYear] = useState("2026");

  React.useEffect(() => {
    if (isOpen) {
      setName("");
      setYear("2026");
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onSubmit({ name: name.trim(), academic_year: year.trim() || "2026" });
    setName("");
    setYear("2026");
  };

  return (
    <ModalCard
      isOpen={isOpen}
      title="Create New Academic Batch"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormInput
          label="Batch Name"
          placeholder="e.g. KTG 12th Batch, JEE Morning 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <FormInput
          label="Academic Year"
          placeholder="2026"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          required
        />
        <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 pt-3 border-t border-hairline">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="notion-btn-utility justify-center"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="notion-btn-primary justify-center disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
            <span>{isSubmitting ? "Creating..." : "Create Batch"}</span>
          </button>
        </div>
      </form>
    </ModalCard>
  );
}
