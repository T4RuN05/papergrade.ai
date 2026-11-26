"use client";

import React, { useState, useEffect } from "react";
import { Play, Loader2 } from "lucide-react";
import { ModalCard, FormInput, AppleSelect } from "@/components/ui";

export interface ExamSubmissionWindowModalProps {
  isOpen: boolean;
  onClose: () => void;
  examTitle?: string;
  hasPriorWindow?: boolean;
  onSubmit: (data: { durationMinutes: number; reason: string; scope: string }) => Promise<void>;
  isStarting: boolean;
}

export function ExamSubmissionWindowModal({
  isOpen,
  onClose,
  examTitle,
  hasPriorWindow = false,
  onSubmit,
  isStarting,
}: ExamSubmissionWindowModalProps) {
  const [duration, setDuration] = useState("30");
  const [reason, setReason] = useState(
    hasPriorWindow ? "Reopened by administrator" : "Scheduled examination upload session"
  );
  const [scope, setScope] = useState("ALL_STUDENTS");

  useEffect(() => {
    if (isOpen) {
      setReason(
        hasPriorWindow ? "Reopened by administrator" : "Scheduled examination upload session"
      );
      setDuration("30");
      setScope("ALL_STUDENTS");
    }
  }, [isOpen, hasPriorWindow]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStarting) return;
    const mins = parseInt(duration, 10) || 30;
    await onSubmit({
      durationMinutes: mins,
      reason: reason.trim() || (hasPriorWindow ? "Reopened by administrator" : "Scheduled examination upload session"),
      scope,
    });
  };

  const modalTitle = examTitle
    ? hasPriorWindow
      ? `Reopen Window: ${examTitle}`
      : `Open Window: ${examTitle}`
    : hasPriorWindow
    ? "Reopen Student Submission Window"
    : "Open Student Submission Window";

  return (
    <ModalCard isOpen={isOpen} onClose={() => !isStarting && onClose()} title={modalTitle}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-ink-muted leading-relaxed">
          Configure submission window duration and target student scope. Once activated, the
          server-enforced countdown timer begins immediately for all eligible students.
        </p>

        <FormInput
          label="Session Note / Audit Reason"
          placeholder="e.g. Scheduled examination upload, network delay grace"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={isStarting}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1.5">Duration</label>
            <AppleSelect
              value={duration}
              onChange={(val) => setDuration(val)}
              disabled={isStarting}
              options={[
                { value: "5", label: "5 Minutes" },
                { value: "10", label: "10 Minutes" },
                { value: "15", label: "15 Minutes" },
                { value: "30", label: "30 Minutes" },
                { value: "45", label: "45 Minutes" },
                { value: "60", label: "60 Minutes" },
                { value: "90", label: "90 Minutes" },
                { value: "120", label: "120 Minutes" },
              ]}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1.5">Target Scope</label>
            <AppleSelect
              value={scope}
              onChange={(val) => setScope(val)}
              disabled={isStarting}
              options={[
                { value: "ALL_STUDENTS", label: "All Students (Replacements Allowed)" },
                { value: "UNSUBMITTED_ONLY", label: "Unsubmitted Students Only" },
              ]}
              className="w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 pt-3 border-t border-hairline">
          <button
            type="button"
            onClick={onClose}
            disabled={isStarting}
            className="notion-btn-utility justify-center"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isStarting || !reason.trim()}
            className="notion-btn-primary justify-center disabled:opacity-50"
          >
            {isStarting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            ) : (
              <Play className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              {isStarting
                ? "Opening..."
                : hasPriorWindow
                ? "Confirm Reopening"
                : "Open Window"}
            </span>
          </button>
        </div>
      </form>
    </ModalCard>
  );
}
