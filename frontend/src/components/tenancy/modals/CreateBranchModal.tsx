"use client";

import React, { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { ModalCard, FormInput } from "@/components/ui";

export interface CreateBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; code: string; city: string }) => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
}

export const CreateBranchModal: React.FC<CreateBranchModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}) => {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim() || !city.trim()) return;
    await onSubmit({ name: name.trim(), code: code.trim().toUpperCase(), city: city.trim() });
    setName("");
    setCode("");
    setCity("");
  };

  return (
    <ModalCard isOpen={isOpen} onClose={onClose} title="Register Physical Branch / Centre">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-2.5 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <FormInput
          label="Branch / Centre Name"
          required
          placeholder="e.g. Kota Main Campus / South Ex Centre"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <FormInput
          label="Branch Code"
          required
          placeholder="e.g. KOTA-MAIN / DEL-SEX"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />

        <FormInput
          label="City"
          required
          placeholder="e.g. Kota / New Delhi / Mumbai"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />

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
            <span>Register Branch</span>
          </button>
        </div>
      </form>
    </ModalCard>
  );
};
