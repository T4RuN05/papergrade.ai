"use client";

import React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { ModalCard } from "@/components/ui";

export interface DeleteManagerModalProps {
  isOpen: boolean;
  manager: {
    id: string;
    full_name?: string;
    email?: string;
  } | null;
  onClose: () => void;
  onConfirmDelete: (managerId: string) => Promise<void>;
  isDeleting: boolean;
}

export const DeleteManagerModal: React.FC<DeleteManagerModalProps> = ({
  isOpen,
  manager,
  onClose,
  onConfirmDelete,
  isDeleting,
}) => {
  if (!manager) return null;

  return (
    <ModalCard isOpen={isOpen} onClose={onClose} title="Remove Branch Manager">
      <div className="space-y-4">
        <p className="text-xs text-ink-muted leading-relaxed">
          Are you sure you want to remove credentials for{" "}
          <strong className="text-ink">{manager.full_name || manager.email}</strong> (
          <span className="font-mono text-ink">{manager.email}</span>)?
        </p>
        <div className="rounded-md bg-canvas-soft border border-hairline p-3 text-xs text-ink-secondary leading-relaxed">
          This action immediately revokes login access for this manager. Any batches and exams created by this manager remain safe under the branch.
        </div>

        <div className="pt-3 grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2 border-t border-hairline">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="notion-btn-utility justify-center disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirmDelete(manager.id)}
            disabled={isDeleting}
            className="notion-btn-danger justify-center disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span>Removing...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                <span>Remove Manager</span>
              </>
            )}
          </button>
        </div>
      </div>
    </ModalCard>
  );
};
