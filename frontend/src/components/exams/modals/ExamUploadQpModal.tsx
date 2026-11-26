"use client";

import React, { useState } from "react";
import { Upload, FileText } from "lucide-react";
import { ModalCard, ButtonPrimary, ButtonUtility } from "@/components/ui";

interface ExamUploadQpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (file: File) => Promise<void>;
  isUploading: boolean;
}

export function ExamUploadQpModal({
  isOpen,
  onClose,
  onSubmit,
  isUploading,
}: ExamUploadQpModalProps) {
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
      title="Upload Master Question Paper"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-ink-muted leading-relaxed">
          Upload the master PDF or scanned pages of the question paper. This allows students to view the paper alongside their evaluated answers.
        </p>

        <div className="border-2 border-dashed border-hairline rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer bg-canvas-soft">
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            className="hidden"
            id="qp-upload-input"
            disabled={isUploading}
          />
          <label htmlFor="qp-upload-input" className="cursor-pointer space-y-2 block">
            <FileText className="h-8 w-8 text-primary mx-auto" />
            <div className="text-xs font-semibold text-ink">
              {selectedFile ? selectedFile.name : "Click to select Question Paper (PDF or Image)"}
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
            isLoading={isUploading}
            icon={<Upload className="h-4 w-4" />}
            className="w-full sm:w-auto justify-center"
          >
            {isUploading ? "Uploading..." : "Upload Paper"}
          </ButtonPrimary>
        </div>
      </form>
    </ModalCard>
  );
}
