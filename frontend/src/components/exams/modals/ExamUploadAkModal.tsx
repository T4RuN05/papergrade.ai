"use client";

import React, { useState } from "react";
import { Upload, CheckCircle2, Loader2 } from "lucide-react";
import { ModalCard } from "@/components/ui";

export type AnswerKeyUploadStage = "idle" | "uploading" | "generating";

interface ExamUploadAkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (file: File) => Promise<void>;
  uploadStage?: AnswerKeyUploadStage;
  isUploading?: boolean;
}

export function ExamUploadAkModal({
  isOpen,
  onClose,
  onSubmit,
  uploadStage,
  isUploading = false,
}: ExamUploadAkModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const stage: AnswerKeyUploadStage = uploadStage ?? (isUploading ? "uploading" : "idle");
  const isBusy = stage !== "idle";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || isBusy) return;
    await onSubmit(selectedFile);
    setSelectedFile(null);
  };

  const handleClose = () => {
    if (isBusy) return;
    setSelectedFile(null);
    onClose();
  };

  const submitLabel =
    stage === "uploading"
      ? "Uploading Key..."
      : stage === "generating"
      ? "Generating Rubrics..."
      : "Upload Answer Key";

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={handleClose}
      title="Upload Official Answer Key"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-ink-muted leading-relaxed">
          Upload the official solutions or scoring key. The AI vision agent uses this document to extract grading criteria and verify student steps.
        </p>

        <div className="border border-dashed border-hairline rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer bg-canvas-soft">
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            className="hidden"
            id="ak-upload-input"
            disabled={isBusy}
          />
          <label htmlFor="ak-upload-input" className="cursor-pointer space-y-2 block">
            <CheckCircle2 className="h-7 w-7 text-emerald-600 mx-auto" />
            <div className="text-xs font-semibold text-ink">
              {selectedFile ? selectedFile.name : "Click to select Answer Key (PDF or Image)"}
            </div>
            <div className="text-[11px] text-ink-muted">PDF or high-res images supported</div>
          </label>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 pt-3 border-t border-hairline">
          <button
            type="button"
            onClick={handleClose}
            disabled={isBusy}
            className="notion-btn-utility justify-center"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!selectedFile || isBusy}
            className="notion-btn-primary justify-center disabled:opacity-50"
          >
            {isBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            ) : (
              <Upload className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>{submitLabel}</span>
          </button>
        </div>
      </form>
    </ModalCard>
  );
}
