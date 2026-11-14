"use client";

import React, { useState } from "react";
import { ModalCard, FormInput, ButtonPrimary, ButtonUtility } from "@/components/ui";
import { KeyRound, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/ToastContext";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

export function ChangePasswordModal({ isOpen, onClose, userEmail }: ChangePasswordModalProps) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      const msg = "New password must be at least 8 characters long.";
      setError(msg);
      toast.warning(msg, { title: "Password Too Short" });
      return;
    }

    if (newPassword !== confirmPassword) {
      const msg = "New passwords do not match. Please re-enter.";
      setError(msg);
      toast.error(msg, { title: "Mismatch" });
      return;
    }

    if (currentPassword === newPassword) {
      const msg = "New password cannot be identical to your current password.";
      setError(msg);
      toast.warning(msg, { title: "Duplicate Password" });
      return;
    }

    setLoading(true);
    try {
      await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });

      setSuccess(true);
      toast.success("Password changed successfully!", { title: "Updated" });
      setTimeout(() => {
        handleClose();
      }, 1400);
    } catch (err: any) {
      const msg = err.message || "Failed to change password. Please check your current password.";
      setError(msg);
      toast.error(msg, { title: "Change Failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalCard
      isOpen={isOpen}
      onClose={handleClose}
      title="Change Account Password"
      className="max-w-md"
    >
      {success ? (
        <div className="py-6 text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto animate-bounce">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-ink">Password Updated Successfully</h3>
            <p className="text-xs text-ink-muted">
              Your new password is now active. Please use it next time you sign in.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg bg-red-50/90 dark:bg-red-950/40 border border-red-200/90 dark:border-red-900/50 p-3 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span className="leading-relaxed font-medium">{error}</span>
            </div>
          )}

          <div className="p-3 rounded-lg bg-canvas-soft border border-hairline text-xs text-ink-secondary space-y-1">
            <div className="font-semibold text-ink flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>Password Security</span>
            </div>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              Enter your current password to set a new password. You can update your credentials initially after onboarding or anytime in the future.
            </p>
          </div>

          <FormInput
            id="current-password-input"
            label="Current Password"
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
          />

          <FormInput
            id="new-password-input"
            label="New Password"
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimum 8 characters"
          />

          <FormInput
            id="confirm-password-input"
            label="Confirm New Password"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
          />

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-hairline">
            <ButtonUtility
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="w-full sm:w-auto justify-center"
            >
              Cancel
            </ButtonUtility>
            <ButtonPrimary
              id="btn-submit-change-pwd"
              type="submit"
              isLoading={loading}
              className="w-full sm:w-auto justify-center"
            >
              <KeyRound className="h-4 w-4 mr-1.5" />
              Update Password
            </ButtonPrimary>
          </div>
        </form>
      )}
    </ModalCard>
  );
}

