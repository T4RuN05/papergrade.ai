"use client";

import React, { useState } from "react";
import { Upload, CheckCircle2, Loader2 } from "lucide-react";
import { ModalCard, ButtonPrimary, ButtonUtility } from "@/components/ui";

interface ExamUploadAkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (file: File) => Promise<void>;
  isUploading: boolean;
}

export function ExamUploadAkModal({
  isOpen,
  onClose,
  onSubmit,
  isUploading,
}: ExamUploadAkModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || isUploading) return;
    await onSubmit(selectedFile);
    setSelectedFile(null);
  };

  const handleClose = () => {
    if (isUploading) return;
    setSelectedFile(null);
    onClose();
  };

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={handleClose}
      title="Upload Official Answer Key"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-ink-muted leading-relaxed">
          Upload the official solutions or scoring key. The AI vision agent uses this document to verify student steps and compute rubric scores.
        </p>

        <div className="border-2 border-dashed border-hairline rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer bg-canvas-soft">
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            className="hidden"
            id="ak-upload-input"
            disabled={isUploading}
          />
          <label htmlFor="ak-upload-input" className="cursor-pointer space-y-2 block">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
            <div className="text-xs font-semibold text-ink">
              {selectedFile ? selectedFile.name : "Click to select Answer Key (PDF or Image)"}
            </div>
            <div className="text-[11px] text-ink-muted">PDF or high-res images supported</div>
          </label>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
          <ButtonUtility
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            className="w-full sm:w-auto justify-center"
          >
            Cancel
          </ButtonUtility>
          <ButtonPrimary
            type="submit"
            disabled={!selectedFile || isUploading}
            className="w-full sm:w-auto justify-center"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Uploading Key...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-1.5" />
                Upload Answer Key
              </>
            )}
          </ButtonPrimary>
        </div>
      </form>
    </ModalCard>
  );
}
