"use client";

import React, { useState, useEffect } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { ModalCard, FormInput } from "@/components/ui";

export interface EditManagerModalProps {
  isOpen: boolean;
  manager: {
    id: string;
    full_name?: string;
    email?: string;
    branch_id?: string;
    is_active?: number;
  } | null;
  branches: Array<{ id: string; name: string; code: string; institute_id: string }>;
  institutes: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSubmit: (managerId: string, data: {
    full_name: string;
    email: string;
    password?: string;
    branch_id: string;
    is_active: number;
  }) => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
}

export const EditManagerModal: React.FC<EditManagerModalProps> = ({
  isOpen,
  manager,
  branches,
  institutes,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [branchId, setBranchId] = useState("");
  const [isActive, setIsActive] = useState<number>(1);

  useEffect(() => {
    if (manager) {
      setName(manager.full_name || "");
      setEmail(manager.email || "");
      setPassword("");
      setBranchId(manager.branch_id || branches[0]?.id || "");
      setIsActive(manager.is_active !== undefined ? manager.is_active : 1);
    }
  }, [manager, branches]);

  if (!manager) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !branchId) return;
    const payload: any = {
      full_name: name.trim(),
      email: email.trim(),
      branch_id: branchId,
      is_active: isActive,
    };
    if (password.trim()) {
      payload.password = password.trim();
    }
    await onSubmit(manager.id, payload);
  };

  return (
    <ModalCard isOpen={isOpen} onClose={onClose} title="Edit Branch Manager">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-2.5 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <FormInput
          label="Full Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <FormInput
          label="Email Address"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <FormInput
          label="New Password"
          type="password"
          placeholder="Leave blank to keep current password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div>
          <label className="block text-xs font-semibold text-ink-secondary mb-1.5">Assigned Branch</label>
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="w-full text-xs bg-surface border border-[#dddddd] dark:border-[#333333] rounded-xs px-3 py-2 text-ink focus:outline-none focus:border-primary"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code}) — {institutes.find((i) => i.id === b.institute_id)?.name || "Institute"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-secondary mb-1.5">Account Status</label>
          <select
            value={isActive}
            onChange={(e) => setIsActive(Number(e.target.value))}
            className="w-full text-xs bg-surface border border-[#dddddd] dark:border-[#333333] rounded-xs px-3 py-2 text-ink focus:outline-none focus:border-primary"
          >
            <option value={1}>Active (Login permitted)</option>
            <option value={0}>Inactive (Access suspended)</option>
          </select>
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
            <span>Save Changes</span>
          </button>
        </div>
      </form>
    </ModalCard>
  );
};
