"use client";

import React, { useState } from "react";
import { Play, Clock } from "lucide-react";
import { ModalCard, FormInput, ButtonPrimary, ButtonUtility, AppleSelect } from "@/components/ui";

interface ExamSubmissionWindowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { durationMinutes: number; reason: string; scope: string }) => Promise<void>;
  isStarting: boolean;
}

export function ExamSubmissionWindowModal({
  isOpen,
  onClose,
  onSubmit,
  isStarting,
}: ExamSubmissionWindowModalProps) {
  const [duration, setDuration] = useState("30");
  const [reason, setReason] = useState("Scheduled examination upload session");
  const [scope, setScope] = useState("ALL_STUDENTS");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStarting) return;
    const mins = parseInt(duration, 10) || 30;
    await onSubmit({
      durationMinutes: mins,
      reason: reason.trim() || "Scheduled examination upload session",
      scope,
    });
  };

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={onClose}
      title="Open Student Submission Window"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-ink-muted leading-relaxed">
          Starting this session enables enrolled students to capture and submit their physical handwritten answer sheets from their mobile devices.
        </p>

        <FormInput
          label="Window Duration (Minutes)"
          type="number"
          min="5"
          max="240"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          required
        />

        <FormInput
          label="Session Description / Reason"
          placeholder="e.g. Mid-term Exam Session 1"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />

        <div className="space-y-1">
          <label className="text-xs font-semibold text-ink-secondary">
            Student Eligibility Scope
          </label>
          <AppleSelect
            value={scope}
            onChange={(val) => setScope(val)}
            options={[
              { value: "ALL_STUDENTS", label: "All Enrolled Students in Scoped Batches" },
              { value: "UNSUBMITTED_ONLY", label: "Unsubmitted Students Only" },
            ]}
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
          <ButtonUtility
            type="button"
            onClick={onClose}
            disabled={isStarting}
            className="w-full sm:w-auto justify-center"
          >
            Cancel
          </ButtonUtility>
          <ButtonPrimary
            type="submit"
            isLoading={isStarting}
            disabled={isStarting}
            className="w-full sm:w-auto justify-center"
          >
            <Play className="h-3.5 w-3.5 mr-1" />
            Start Live Window
          </ButtonPrimary>
        </div>
      </form>
    </ModalCard>
  );
}
