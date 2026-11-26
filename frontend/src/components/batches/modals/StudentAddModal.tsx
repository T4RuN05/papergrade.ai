"use client";

import React, { useState } from "react";
import { CheckCircle2, GraduationCap, Loader2 } from "lucide-react";
import { ModalCard, FormInput } from "@/components/ui";

interface StudentAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchName?: string;
  branchCode?: string;
  onSubmit: (data: { full_name: string; email?: string }) => Promise<string | null>;
  isSubmitting?: boolean;
}

export function StudentAddModal({
  isOpen,
  onClose,
  batchName,
  branchCode,
  onSubmit,
  isSubmitting = false,
}: StudentAddModalProps) {
  const [stuName, setStuName] = useState("");
  const [stuEmail, setStuEmail] = useState("");
  const [assignedRoll, setAssignedRoll] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setAssignedRoll(null);
      setStuName("");
      setStuEmail("");
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stuName.trim()) return;
    const roll = await onSubmit({
      full_name: stuName.trim(),
      email: stuEmail.trim() || undefined,
    });
    if (roll) {
      setAssignedRoll(roll);
      setStuName("");
      setStuEmail("");
    }
  };

  const handleClose = () => {
    setAssignedRoll(null);
    setStuName("");
    setStuEmail("");
    onClose();
  };

  return (
    <ModalCard
      isOpen={isOpen}
      title={`Add Student to ${batchName || "Batch"}`}
      onClose={handleClose}
    >
      {assignedRoll ? (
        <div className="text-center py-4 space-y-4">
          <div className="h-11 w-11 rounded-lg bg-canvas-soft border border-hairline text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-ink">
              Student Enrolled Successfully
            </h4>
            <p className="text-xs text-ink-muted">
              Roll Number registered for student portal activation:
            </p>
            <div className="text-2xl font-mono font-bold tracking-widest text-primary pt-1">
              {assignedRoll}
            </div>
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
          <div className="rounded-lg border border-hairline bg-canvas-soft p-3 text-xs space-y-1">
            <div className="font-semibold text-ink flex items-center gap-1.5">
              <GraduationCap className="h-4 w-4 text-primary shrink-0" />
              <span>Auto-Generated Roll Number</span>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              Roll number is automatically assigned by PaperGrade upon enrollment (e.g.{" "}
              {branchCode ? `...-${branchCode}-...` : "auto-sequenced"}).
            </p>
          </div>
          <FormInput
            label="Full Name"
            placeholder="e.g. Aarav Sharma"
            value={stuName}
            onChange={(e) => setStuName(e.target.value)}
            required
          />
          <FormInput
            label="Email (Optional)"
            type="email"
            placeholder="student@example.com"
            value={stuEmail}
            onChange={(e) => setStuEmail(e.target.value)}
          />
          <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 pt-3 border-t border-hairline">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="notion-btn-utility justify-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !stuName.trim()}
              className="notion-btn-primary justify-center disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
              <span>{isSubmitting ? "Enrolling..." : "Enroll Student"}</span>
            </button>
          </div>
        </form>
      )}
    </ModalCard>
  );
}
