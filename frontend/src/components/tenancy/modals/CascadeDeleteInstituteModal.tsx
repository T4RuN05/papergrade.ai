"use client";

import React, { useState } from "react";
import { AlertCircle, Trash2, Loader2 } from "lucide-react";
import { ModalCard, BadgePill, ButtonUtility } from "@/components/ui";

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
        <div className="flex items-center justify-between pb-1 border-b border-hairline">
          <span className="text-xs text-ink-muted">
            Permanent cascade deletion for code: <strong className="font-mono text-ink">{institute.code}</strong>
          </span>
          <BadgePill label="High Risk Operation" color="pink" className="bg-red-50 text-red-700 border-red-200" />
        </div>

        {/* Warning Banner */}
        <div className="rounded-lg border border-red-200/80 bg-red-50/50 dark:bg-[#221014]/80 dark:border-[#3f1922] p-4 space-y-2.5 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600 dark:bg-red-400" />
          <div className="flex items-start gap-2.5 pl-1">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-red-900 dark:text-red-200 uppercase tracking-wider">
                Permanent Irreversible Action
              </h4>
              <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
                Deleting <strong>{institute.name}</strong> will trigger a complete cascade wipe. Everything associated with this coaching institute will be permanently eradicated:
              </p>
            </div>
          </div>

          <ul className="text-xs text-red-800 dark:text-red-300/90 list-disc list-inside space-y-1 pl-7">
            <li>All campus branches and physical centres</li>
            <li>All academic batches and student rosters</li>
            <li>All student and branch manager user accounts</li>
            <li>All examinations, question papers, and official rubrics</li>
            <li>All answer sheet submissions and AI evaluation scores</li>
            <li>All revaluations, audits, and telemetry logs</li>
            <li>All Cloudinary files (raw PDFs, annotated PDFs, renders)</li>
          </ul>
        </div>

        {error && (
          <div className="p-3 bg-[#fdf2f2] dark:bg-[#261212] border border-[#f8b4b4] dark:border-[#491f1f] rounded-md text-xs text-critical flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Confirmation Input */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-semibold text-ink block">
            To confirm deletion, please type the institute code{" "}
            <span className="font-mono px-1.5 py-0.5 rounded bg-surface border border-hairline font-bold text-critical">
              {institute.code}
            </span>{" "}
            below:
          </label>
          <input
            type="text"
            value={deleteConfirmCode}
            onChange={(e) => setDeleteConfirmCode(e.target.value)}
            placeholder={`Type "${institute.code}" to confirm`}
            disabled={isDeleting}
            className="w-full text-xs font-mono px-3 py-2 rounded-md border border-hairline bg-surface focus:outline-none focus:ring-1 focus:ring-critical focus:border-critical"
            autoFocus
          />
        </div>

        {/* Modal Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-hairline">
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
            onClick={handleConfirm}
            disabled={isDeleting || !isConfirmed}
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Wiping Institute &amp; Cloud Storage...
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Cascade Delete Institute
              </>
            )}
          </ButtonUtility>
        </div>
      </div>
    </ModalCard>
  );
};
