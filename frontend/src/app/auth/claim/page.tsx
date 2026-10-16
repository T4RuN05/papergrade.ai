"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GraduationCap, ArrowLeft, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { ButtonPrimary, FormInput, FeatureCard } from "@/components/ui";
import { useToast, queueToast } from "@/lib/ToastContext";

export default function ClaimAccountPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [studentIdNum, setStudentIdNum] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      const msg = "Passwords do not match. Please re-enter.";
      setError(msg);
      toast.error(msg, { title: "Validation Error" });
      return;
    }
    if (password.length < 8) {
      const msg = "Password must be at least 8 characters long.";
      setError(msg);
      toast.warning(msg, { title: "Weak Password" });
      return;
    }

    setLoading(true);

    try {
      await api.claimAccount({
        student_id_num: studentIdNum.trim(),
        roll_number: rollNumber.trim().toUpperCase(),
        password,
      });

      setSuccess(true);
      toast.success("Your student account is now active!", { title: "Account Claimed" });
      queueToast({
        type: "success",
        title: "Welcome Student",
        message: "Your admission account has been claimed successfully.",
        duration: 4500,
      });

      setTimeout(() => {
        router.push("/student/portal");
      }, 1500);
    } catch (err: any) {
      const msg = err.message || "Failed to claim account. Check your ID and Roll Number.";
      setError(msg);
      toast.error(msg, { title: "Claim Failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[75vh] items-center justify-center py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#eaf7ed] text-[#1aae39] border border-[#c2ecd0] shadow-xs">
            <GraduationCap className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Claim Student Account</h1>
          <p className="text-xs text-ink-muted">
            Enter your official 6-digit Student ID and Institute Roll Number to initialize your account.
          </p>
        </div>

        <FeatureCard className="p-6">
          {success ? (
            <div className="text-center py-4 space-y-3">
              <CheckCircle2 className="h-8 w-8 text-[#1aae39] mx-auto animate-bounce" />
              <h2 className="text-sm font-bold text-ink">Account Claimed Successfully!</h2>
              <p className="text-xs text-ink-muted">
                You can now log in anytime using your Roll Number <strong className="text-ink">({rollNumber.trim().toUpperCase()})</strong> or Student ID <strong className="text-ink">({studentIdNum.trim()})</strong> with your password. Redirecting to your student portal...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-xs bg-red-50 border border-red-200 p-2.5 text-xs text-red-600">
                  {error}
                </div>
              )}

              <FormInput
                label="6-Digit Numeric Student ID"
                type="text"
                required
                maxLength={6}
                value={studentIdNum}
                onChange={(e) => setStudentIdNum(e.target.value)}
                placeholder="e.g. 315116"
              />

              <FormInput
                label="Institute Roll Number"
                type="text"
                required
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder="e.g. MECH-042"
              />

              <FormInput
                label="Create Password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
              />

              <FormInput
                label="Confirm Password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
              />

              <ButtonPrimary
                type="submit"
                className="w-full"
                isLoading={loading}
              >
                Claim Account & Sign In
              </ButtonPrimary>
            </form>
          )}

          <div className="mt-4 pt-4 border-t border-hairline text-center text-xs text-ink-muted">
            Already have an active login?{" "}
            <Link href="/auth/login" className="font-semibold text-primary hover:underline">
              Sign In →
            </Link>
          </div>
        </FeatureCard>
      </div>
    </div>
  );
}
