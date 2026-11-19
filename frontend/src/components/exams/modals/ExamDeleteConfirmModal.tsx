"use client";

import React, { useState } from "react";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { ModalCard, FormInput, ButtonUtility } from "@/components/ui";

interface ExamDeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  examTitle: string;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

export function ExamDeleteConfirmModal({
  isOpen,
  onClose,
  examTitle,
  onConfirm,
  isDeleting,
}: ExamDeleteConfirmModalProps) {
  const [confirmText, setConfirmText] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmText.trim() !== examTitle.trim() || isDeleting) return;
    await onConfirm();
    setConfirmText("");
  };

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmText("");
    onClose();
  };

  const isMatched = confirmText.trim() === examTitle.trim();

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={handleClose}
      title="Delete Examination"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-900 dark:text-red-200 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold">Permanent Destruction Warning</span>
            <p className="text-[11px] leading-relaxed">
              This will permanently delete this examination, its answer keys, rubric criteria, and all student submissions and awarded marks.
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-ink-muted">
            Type <span className="font-bold text-ink select-all">{examTitle}</span> to confirm:
          </label>
          <FormInput
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type exam title exact match..."
            required
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
          <ButtonUtility
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="w-full sm:w-auto justify-center"
          >
            Cancel
          </ButtonUtility>
          <ButtonUtility
            type="submit"
            variant="danger-solid"
            disabled={!isMatched || isDeleting}
            className="w-full sm:w-auto justify-center"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Deleting Exam...
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete Examination
              </>
            )}
          </ButtonUtility>
        </div>
      </form>
    </ModalCard>
  );
}
