"use client";

import React, { useState } from "react";
import { AlertCircle } from "lucide-react";
import { ModalCard, FormInput, ButtonUtility, ButtonPrimary } from "@/components/ui";

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
          <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-2.5 text-xs text-red-600">
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

        <div className="pt-3 flex items-center justify-end gap-2 border-t border-hairline">
          <ButtonUtility type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </ButtonUtility>
          <ButtonPrimary type="submit" isLoading={isSubmitting}>
            Register Branch
          </ButtonPrimary>
        </div>
      </form>
    </ModalCard>
  );
};
