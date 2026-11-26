"use client";

import React, { useState } from "react";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { ModalCard, FormInput } from "@/components/ui";

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
        <div className="p-3.5 rounded-lg bg-red-50/80 dark:bg-[#2a1313] border border-red-200/80 dark:border-[#4a1f1f] text-xs text-red-900 dark:text-[#f28b82] flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-[#f28b82] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold">Permanent Destruction Warning</span>
            <p className="text-xs leading-relaxed">
              This will permanently delete this examination, its answer keys, rubric criteria, and all student submissions and awarded marks.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-ink-muted block">
            Type <span className="font-semibold text-ink select-all">{examTitle}</span> to confirm:
          </label>
          <FormInput
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type exam title exact match..."
            required
          />
        </div>

        <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 pt-3 border-t border-hairline">
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="notion-btn-utility justify-center"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isMatched || isDeleting}
            className="notion-btn-danger justify-center font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                <span>Delete Exam</span>
              </>
            )}
          </button>
        </div>
      </form>
    </ModalCard>
  );
}
