"use client";

import React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { ModalCard, ButtonUtility } from "@/components/ui";

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
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 p-3 text-xs text-amber-800 dark:text-amber-300">
          This action immediately revokes login access for this manager. Any batches and exams created by this manager remain safe under the branch.
        </div>

        <div className="pt-3 flex items-center justify-end gap-2 border-t border-hairline">
          <ButtonUtility
            type="button"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </ButtonUtility>
          <ButtonUtility
            variant="danger-solid"
            size="md"
            onClick={() => onConfirmDelete(manager.id)}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Removing Manager...
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Remove Manager
              </>
            )}
          </ButtonUtility>
        </div>
      </div>
    </ModalCard>
  );
};
