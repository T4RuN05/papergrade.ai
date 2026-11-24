"use client";

import React, { useState } from "react";
import { ModalCard, FormInput, ButtonPrimary, ButtonUtility } from "@/components/ui";

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
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
          <ButtonUtility
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto justify-center"
          >
            Cancel
          </ButtonUtility>
          <ButtonPrimary
            type="submit"
            isLoading={isSubmitting}
            disabled={isSubmitting || !name.trim()}
            className="w-full sm:w-auto justify-center"
          >
            Create Batch
          </ButtonPrimary>
        </div>
      </form>
    </ModalCard>
  );
}
