"use client";

import React, { useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { ModalCard, ButtonPrimary, ButtonUtility } from "@/components/ui";

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
          <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-ink">Excel Roster Processed</h4>
            <p className="text-xs text-ink-muted">
              Successfully imported{" "}
              <span className="font-bold text-ink">
                {importStats.imported_count || importStats.students_imported || 0}
              </span>{" "}
              students ready for account activation.
            </p>
            {importStats.duplicates_skipped > 0 && (
              <p className="text-[11px] text-amber-700">
                Skipped {importStats.duplicates_skipped} duplicates already enrolled.
              </p>
            )}
          </div>
          <ButtonPrimary
            onClick={handleClose}
            className="w-full sm:w-auto justify-center"
          >
            Done
          </ButtonPrimary>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-ink-muted leading-relaxed">
            Upload an Excel spreadsheet (<code className="font-mono text-ink">.xlsx</code>). Required column:{" "}
            <span className="font-semibold text-ink">Full Name</span>. Sequential roll numbers are auto-assigned by the system. Email and Phone are optional.
          </p>
          <div className="border-2 border-dashed border-hairline rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer bg-canvas-soft">
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
              <FileSpreadsheet className="h-8 w-8 text-primary mx-auto" />
              <div className="text-xs font-semibold text-ink">
                {rosterFile ? rosterFile.name : "Click to select Excel file"}
              </div>
              <div className="text-[11px] text-ink-muted">
                Supports .xlsx spreadsheets
              </div>
            </label>
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
            <ButtonUtility
              type="button"
              onClick={handleClose}
              disabled={isImporting}
              className="w-full sm:w-auto justify-center"
            >
              Cancel
            </ButtonUtility>
            <ButtonPrimary
              type="submit"
              disabled={!rosterFile || isImporting}
              className="w-full sm:w-auto justify-center"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Processing Import...
                </>
              ) : (
                "Process Import"
              )}
            </ButtonPrimary>
          </div>
        </form>
      )}
    </ModalCard>
  );
}
