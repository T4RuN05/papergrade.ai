"use client";

import React, { useState } from "react";
import { AlertCircle, Trash2, Loader2 } from "lucide-react";
import { ModalCard } from "@/components/ui";

export interface CascadeDeleteInstituteModalProps {
  isOpen: boolean;
  institute: {
    id: string;
    name: string;
    code: string;
  } | null;
  onClose: () => void;
  onConfirmDelete: (instituteId: string) => Promise<void>;
  isDeleting: boolean;
  error?: string | null;
}

export const CascadeDeleteInstituteModal: React.FC<CascadeDeleteInstituteModalProps> = ({
  isOpen,
  institute,
  onClose,
  onConfirmDelete,
  isDeleting,
  error,
}) => {
  const [deleteConfirmCode, setDeleteConfirmCode] = useState("");

  if (!institute) return null;

  const isConfirmed = deleteConfirmCode.trim().toUpperCase() === institute.code.trim().toUpperCase();

  const handleConfirm = async () => {
    if (!isConfirmed || isDeleting) return;
    await onConfirmDelete(institute.id);
    setDeleteConfirmCode("");
  };

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={() => !isDeleting && onClose()}
      title={`Delete Institute: ${institute.name}`}
      maxWidth="max-w-lg"
      preventBackdropClose={isDeleting}
      disableClose={isDeleting}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-hairline">
          <span className="text-xs text-ink-muted">
            Cascade deletion for code: <strong className="font-mono text-ink">{institute.code}</strong>
          </span>
          <span className="notion-eyebrow text-red-600 dark:text-red-400">
            High Risk Operation
          </span>
        </div>

        {/* Warning Box (Flat Notion surface without left stripe or wash) */}
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-canvas-soft p-4 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-ink">
                Permanent Irreversible Action
              </h4>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Deleting <strong>{institute.name}</strong> triggers a complete cascade wipe. Everything associated with this coaching institute will be permanently eradicated:
              </p>
            </div>
          </div>

          <ul className="text-xs text-ink-secondary list-disc list-inside space-y-1 pl-6">
            <li>All campus branches and physical centres</li>
            <li>All academic batches and student rosters</li>
            <li>All student and branch manager user accounts</li>
            <li>All examinations, question papers, and official rubrics</li>
            <li>All answer sheet submissions and AI evaluation scores</li>
            <li>All revaluations, audits, and telemetry logs</li>
            <li>All Cloudflare R2 files (raw PDFs, annotated PDFs, renders)</li>
          </ul>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-md text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Confirmation Input */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-semibold text-ink block">
            Type the institute code{" "}
            <span className="font-mono px-1.5 py-0.5 rounded-xs bg-canvas-soft border border-hairline font-semibold text-red-600 dark:text-red-400">
              {institute.code}
            </span>{" "}
            to confirm:
          </label>
          <input
            type="text"
            value={deleteConfirmCode}
            onChange={(e) => setDeleteConfirmCode(e.target.value)}
            placeholder={`Type "${institute.code}" to confirm`}
            disabled={isDeleting}
            className="w-full text-xs font-mono px-3 py-2 rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface text-ink focus:outline-none focus:border-red-500"
            autoFocus
          />
        </div>

        {/* Modal Actions */}
        <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2 pt-3 border-t border-hairline">
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
            onClick={handleConfirm}
            disabled={isDeleting || !isConfirmed}
            className="notion-btn-danger justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span>Wiping...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                <span>Cascade Delete</span>
              </>
            )}
          </button>
        </div>
      </div>
    </ModalCard>
  );
};
