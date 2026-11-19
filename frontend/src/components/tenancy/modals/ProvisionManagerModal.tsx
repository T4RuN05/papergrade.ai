"use client";

import React, { useState } from "react";
import { AlertCircle } from "lucide-react";
import { ModalCard, FormInput, ButtonUtility, ButtonPrimary } from "@/components/ui";

export interface ProvisionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; email: string; password: string }) => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
}

export const ProvisionManagerModal: React.FC<ProvisionManagerModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) return;
    await onSubmit({ name: name.trim(), email: email.trim(), password });
    setName("");
    setEmail("");
    setPassword("");
  };

  return (
    <ModalCard isOpen={isOpen} onClose={onClose} title="Provision Branch Manager Account">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-2.5 text-xs text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-xs text-ink-muted leading-relaxed">
          This manager will receive scoped access exclusively to batches, students, 30-min submission windows, and answer sheets for this branch.
        </p>

        <FormInput
          label="Manager Full Name"
          required
          placeholder="e.g. Rajesh Sharma"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <FormInput
          label="Manager Email"
          type="email"
          required
          placeholder="e.g. manager.kota@papergrade.ai"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <FormInput
          label="Initial Password"
          type="password"
          required
          placeholder="••••••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="pt-3 flex items-center justify-end gap-2 border-t border-hairline">
          <ButtonUtility type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </ButtonUtility>
          <ButtonPrimary type="submit" isLoading={isSubmitting}>
            Provision Manager
          </ButtonPrimary>
        </div>
      </form>
    </ModalCard>
  );
};
