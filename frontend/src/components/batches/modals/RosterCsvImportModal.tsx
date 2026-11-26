"use client";

import React, { useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { ModalCard } from "@/components/ui";

interface RosterCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchName?: string;
  onSubmit: (file: File) => Promise<any>;
}

export function RosterCsvImportModal({
  isOpen,
  onClose,
  batchName,
  onSubmit,
}: RosterCsvImportModalProps) {
  const [rosterFile, setRosterFile] = useState<File | null>(null);
  const [importStats, setImportStats] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rosterFile || isImporting) return;
    setIsImporting(true);
    try {
      const stats = await onSubmit(rosterFile);
      setImportStats(stats);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setRosterFile(null);
    setImportStats(null);
    setIsImporting(false);
    onClose();
  };

  return (
    <ModalCard
      isOpen={isOpen}
      title={`Import Student Roster (${batchName || "Batch"})`}
      onClose={handleClose}
    >
      {importStats ? (
        <div className="text-center py-4 space-y-4">
          <div className="h-11 w-11 rounded-lg bg-canvas-soft border border-hairline text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-ink">Excel Roster Processed</h4>
            <p className="text-xs text-ink-muted">
              Successfully imported{" "}
              <span className="font-semibold text-ink tabular-nums">
                {importStats.imported_count || importStats.students_imported || 0}
              </span>{" "}
              students ready for account activation.
            </p>
            {importStats.duplicates_skipped > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Skipped {importStats.duplicates_skipped} duplicates already enrolled.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="notion-btn-primary w-full sm:w-auto justify-center"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-ink-muted leading-relaxed">
            Upload an Excel spreadsheet (<code className="font-mono text-ink">.xlsx</code>). Required column:{" "}
            <span className="font-semibold text-ink">Full Name</span>. Sequential roll numbers are auto-assigned by the system. Email and Phone are optional.
          </p>
          <div className="border border-dashed border-hairline rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer bg-canvas-soft">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setRosterFile(e.target.files?.[0] || null)}
              className="hidden"
              id="excel-roster-input"
            />
            <label
              htmlFor="excel-roster-input"
              className="cursor-pointer space-y-2 block"
            >
              <FileSpreadsheet className="h-7 w-7 text-primary mx-auto" />
              <div className="text-xs font-semibold text-ink">
                {rosterFile ? rosterFile.name : "Click to select Excel file"}
              </div>
              <div className="text-[11px] text-ink-muted">
                Supports .xlsx spreadsheets
              </div>
            </label>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 pt-3 border-t border-hairline">
            <button
              type="button"
              onClick={handleClose}
              disabled={isImporting}
              className="notion-btn-utility justify-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!rosterFile || isImporting}
              className="notion-btn-primary justify-center disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span>Importing...</span>
                </>
              ) : (
                <span>Process Import</span>
              )}
            </button>
          </div>
        </form>
      )}
    </ModalCard>
  );
}
