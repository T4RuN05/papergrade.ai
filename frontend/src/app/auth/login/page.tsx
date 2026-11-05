"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  AlertCircle,
  Smartphone,
  Download,
  KeyRound,
  Clock,
  CheckCircle2,
  ArrowLeft,
  Lock,
  GraduationCap,
} from "lucide-react";
import { api, getAuthToken, getStoredUser } from "@/lib/api";
import { ButtonPrimary, FormInput, FeatureCard } from "@/components/ui";
import { useToast, queueToast } from "@/lib/ToastContext";
import { useTenant } from "@/lib/TenantContext";
import { startNavigationProgress } from "@/components/NavigationProgressBar";

type AuthViewMode = "LOGIN" | "FORGOT_REQUEST" | "AWAITING_APPROVAL" | "RESET_PASSWORD";
type AuthRole = "STUDENT" | "STAFF" | "CLAIM";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { refreshTenancy } = useTenant();

  // Primary Login state
  const [viewMode, setViewMode] = useState<AuthViewMode>("LOGIN");
  const [loginRole, setLoginRole] = useState<AuthRole>("STUDENT");
  const [isStandalone, setIsStandalone] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Claim account state
  const [claimStudentId, setClaimStudentId] = useState("");
  const [claimRollNumber, setClaimRollNumber] = useState("");
  const [claimPassword, setClaimPassword] = useState("");
  const [claimConfirmPassword, setClaimConfirmPassword] = useState("");
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);

  // Forgot password flow state
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [sessionSecret, setSessionSecret] = useState<string | null>(null);
  const [studentInfo, setStudentInfo] = useState<{ name?: string; roll?: string } | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Sync role from URL query parameters (?role=staff, ?role=student, ?role=claim, ?portal=admin, ?portal=branch)
  useEffect(() => {
    const roleParam = searchParams.get("role")?.toLowerCase();
    const tabParam = searchParams.get("tab")?.toLowerCase();
    const portalParam = searchParams.get("portal")?.toLowerCase();
    const modeParam = searchParams.get("mode")?.toLowerCase();
    const redirectParam = searchParams.get("redirect")?.toLowerCase();

    if (roleParam === "claim" || tabParam === "claim" || modeParam === "claim") {
      setLoginRole("CLAIM");
    } else if (
      roleParam === "staff" ||
      roleParam === "faculty" ||
      roleParam === "admin" ||
      portalParam === "admin" ||
      portalParam === "branch" ||
      (redirectParam &&
        (redirectParam.includes("/overview") ||
          redirectParam.includes("/branch") ||
          redirectParam.includes("/admin") ||
          redirectParam.includes("/revaluation")))
    ) {
      setLoginRole("STAFF");
    } else if (roleParam === "student" || (redirectParam && redirectParam.includes("/student"))) {
      setLoginRole("STUDENT");
    }
  }, [searchParams]);

  // Check if user is already authenticated or launched in standalone PWA
  useEffect(() => {
    const token = getAuthToken();
    const storedUser = getStoredUser();
    if (token && storedUser) {
      if (storedUser.role === "STUDENT") {
        router.replace("/student/portal");
        return;
      } else if (storedUser.role === "BRANCH_MANAGER") {
        router.replace("/branch/batches");
        return;
      } else {
        router.replace("/overview");
        return;
      }
    }

    if (typeof window !== "undefined") {
      const isPwa =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true;
      setIsStandalone(Boolean(isPwa));
      if (isPwa) {
        setLoginRole("STUDENT");
      }
    }
  }, [router]);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      toast.success("PaperGrade Student PWA installed successfully!", { title: "App Installed" });
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [toast]);

  // Live polling for Branch Manager approval while awaiting
  useEffect(() => {
    if (viewMode !== "AWAITING_APPROVAL" || !activeRequestId || !sessionSecret) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await api.getPasswordResetStatus(activeRequestId, sessionSecret);
        if (!isMounted) return;

        if (res.status === "APPROVED") {
          toast.success(
            "Branch Manager approved your request! You can now set your new password.",
            { title: "Request Approved", duration: 6000 }
          );
          setResetToken(res.reset_token || null);
          setViewMode("RESET_PASSWORD");
        } else if (res.status === "REJECTED") {
          toast.error("Your password reset request was declined by the Branch Manager.", {
            title: "Request Declined",
          });
          setForgotError("Request was declined by your Branch Manager. Please contact branch administration.");
          setViewMode("FORGOT_REQUEST");
        } else if (res.status === "EXPIRED") {
          toast.error("Your reset authorization expired. Please submit a new request.", {
            title: "Request Expired",
          });
          setForgotError("Reset request expired. Please submit a new request.");
          setViewMode("FORGOT_REQUEST");
        }
      } catch (err) {
        console.warn("Polling reset status...", err);
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [viewMode, activeRequestId, sessionSecret, toast]);

  const handleInstallClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await api.login({
        email: email.trim(),
        password: password,
      });

      // Strict role separation: student form must only allow students, faculty form must only allow faculty/staff
      if (loginRole === "STUDENT" && user.role !== "STUDENT") {
        api.logout();
        const roleErr = "Invalid student roll number or password.";
        setError(roleErr);
        toast.error(roleErr, {
          title: "Sign-In Failed",
          duration: 4000,
        });
        return;
      }

      if (loginRole === "STAFF" && user.role === "STUDENT") {
        api.logout();
        const roleErr = "Invalid faculty email or password.";
        setError(roleErr);
        toast.error(roleErr, {
          title: "Sign-In Failed",
          duration: 4000,
        });
        return;
      }

      const enteredEmail = email.trim();
      let roleTitle = "Welcome Administrator";
      const redirectParam = searchParams.get("redirect");
      let dest = "/overview";

      if (user.role === "STUDENT") {
        roleTitle = "Welcome Student";
        dest = redirectParam && redirectParam.startsWith("/student") ? redirectParam : "/student/portal";
      } else if (user.role === "BRANCH_MANAGER") {
        roleTitle = "Welcome Branch Manager";
        dest = redirectParam && redirectParam.startsWith("/branch") ? redirectParam : "/branch/batches";
      } else {
        dest = redirectParam && !redirectParam.startsWith("/student") ? redirectParam : "/overview";
      }

      const welcomeMsg = `Signed in as ${user.full_name || enteredEmail}.`;
      toast.success(welcomeMsg, { title: roleTitle, duration: 4500 });

      if (user.role === "STUDENT") {
        // Fast-path immediate redirect for students with local seed user
        refreshTenancy(user);
        startNavigationProgress();
        router.push(dest);
        return;
      }

      await refreshTenancy(user);
      startNavigationProgress();
      router.push(dest);
    } catch (err: any) {
      let defaultMsg =
        loginRole === "STUDENT"
          ? "Invalid student roll number or password."
          : "Invalid faculty email or password.";

      let msg = defaultMsg;
      if (typeof err === "string" && !err.includes("belong to") && !err.includes("Role")) {
        msg = err;
      } else if (err?.message && typeof err.message === "string" && !err.message.includes("belong to") && !err.message.includes("Role")) {
        msg = err.message;
      }
      if (msg === "[object Object]" || msg.toLowerCase().includes("invalid credentials")) {
        msg = defaultMsg;
      }
      setError(msg);
      toast.error(msg, { title: "Sign-In Failed" });
    } finally {
      setLoading(false);
    }
  };

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaimError(null);

    if (claimPassword !== claimConfirmPassword) {
      const msg = "Passwords do not match. Please re-enter.";
      setClaimError(msg);
      toast.error(msg, { title: "Validation Error" });
      return;
    }
    if (claimPassword.length < 8) {
      const msg = "Password must be at least 8 characters long.";
      setClaimError(msg);
      toast.warning(msg, { title: "Weak Password" });
      return;
    }

    setClaimLoading(true);

    try {
      const res = await api.claimAccount({
        student_id_num: claimStudentId.trim(),
        roll_number: claimRollNumber.trim().toUpperCase(),
        password: claimPassword,
      });

      setClaimSuccess(true);
      toast.success("Your student account is now active!", { title: "Account Claimed" });
      queueToast({
        type: "success",
        title: "Welcome Student",
        message: "Your admission account has been claimed successfully.",
        duration: 4500,
      });
      await refreshTenancy(res);
      startNavigationProgress();
      setTimeout(() => {
        router.push("/student/portal");
      }, 1200);
    } catch (err: any) {
      const msg = err.message || "Failed to claim account. Check your 6-digit Student ID and Roll Number.";
      setClaimError(msg);
      toast.error(msg, { title: "Claim Failed" });
    } finally {
      setClaimLoading(false);
    }
  };

  // Student initiates password reset request
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      setForgotError("Please enter your roll number, student ID, or registered email.");
      return;
    }

    setForgotLoading(true);
    setForgotError(null);

    try {
      const res = await api.requestPasswordReset(forgotIdentifier.trim());
      setActiveRequestId(res.request_id);
      setSessionSecret(res.session_secret || null);
      setStudentInfo({ name: res.student_name, roll: res.roll_number });

      if (res.request_status === "APPROVED") {
        const statusResp = await api.getPasswordResetStatus(res.request_id, res.session_secret);
        if (statusResp.reset_token) {
          setResetToken(statusResp.reset_token);
          setViewMode("RESET_PASSWORD");
          toast.success("Previous request is already approved! Please set your new password.", {
            title: "Request Approved",
          });
          return;
        }
      }

      setViewMode("AWAITING_APPROVAL");
      toast.info("Request routed to your Branch Manager. Please do not refresh this page.", {
        title: "Awaiting Approval",
        duration: 5000,
      });
    } catch (err: any) {
      setForgotError(err.message || "Failed to submit password reset request.");
    } finally {
      setForgotLoading(false);
    }
  };

  // Student submits new password after manager approval
  const handleCompleteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      setForgotError("Please fill in both password fields.");
      return;
    }
    if (newPassword.length < 8) {
      setForgotError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setForgotError("Passwords do not match. Please re-enter carefully.");
      return;
    }
    if (!activeRequestId || !resetToken) {
      setForgotError("Missing authorization token. Please start a new request.");
      return;
    }

    setForgotLoading(true);
    setForgotError(null);

    try {
      await api.completePasswordReset({
        request_id: activeRequestId,
        reset_token: resetToken,
        new_password: newPassword,
      });

      toast.success("Password reset successfully! Please sign in with your new password.", {
        title: "Password Updated",
        duration: 5000,
      });

      // Switch back to login with identifier prefilled
      setEmail(studentInfo?.roll || forgotIdentifier.trim());
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setActiveRequestId(null);
      setSessionSecret(null);
      setResetToken(null);
      setViewMode("LOGIN");
    } catch (err: any) {
      setForgotError(err.message || "Failed to update password.");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="flex min-h-[75vh] items-center justify-center py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-xl overflow-hidden shadow-xs">
            <Image
              src="/logo-icon.png"
              alt="PaperGrade AI"
              width={48}
              height={48}
              className="h-12 w-12 object-contain"
              priority
            />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-ink">
            {viewMode === "LOGIN"
              ? loginRole === "STUDENT"
                ? "Student Portal Sign-In"
                : loginRole === "STAFF"
                ? "Faculty & Staff Sign-In"
                : "Claim Student Account"
              : viewMode === "FORGOT_REQUEST"
              ? "Reset Student Password"
              : viewMode === "AWAITING_APPROVAL"
              ? "Manager Authorization"
              : "Set New Password"}
          </h1>
          <p className="text-xs text-ink-muted">
            {viewMode === "LOGIN"
              ? loginRole === "STUDENT"
                ? "Enter your student Roll Number and password to access your dashboard."
                : loginRole === "STAFF"
                ? "Enter your institutional email or Staff ID to access administrative operations."
                : "Enter your 6-digit Student ID and Institute Roll Number to initialize your account."
              : viewMode === "FORGOT_REQUEST"
              ? "Requests are audited and approved by your assigned Branch Manager."
              : viewMode === "AWAITING_APPROVAL"
              ? "Live authorization in progress. Keep this window open."
              : "Create a secure new password for your account."}
          </p>
        </div>

        <FeatureCard className="p-6">
          {/* VIEW: LOGIN OR CLAIM FORM */}
          {viewMode === "LOGIN" && (
            <div className="space-y-4">
              {/* Role Toggle Tabs: Student | Faculty / Staff | Claim ID */}
              <div className="grid grid-cols-3 p-1 rounded-lg bg-canvas-soft border border-hairline text-xs font-semibold">
                <button
                  type="button"
                  id="tab-role-student"
                  onClick={() => {
                    setLoginRole("STUDENT");
                    setError(null);
                  }}
                  className={`py-1.5 px-2 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 text-center ${
                    loginRole === "STUDENT"
                      ? "bg-surface text-ink shadow-2xs font-bold"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Student</span>
                </button>

                <button
                  type="button"
                  id="tab-role-staff"
                  onClick={() => {
                    setLoginRole("STAFF");
                    setError(null);
                  }}
                  className={`py-1.5 px-2 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 text-center ${
                    loginRole === "STAFF"
                      ? "bg-surface text-ink shadow-2xs font-bold"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Faculty / Staff</span>
                </button>

                <button
                  type="button"
                  id="tab-role-claim"
                  onClick={() => {
                    setLoginRole("CLAIM");
                    setError(null);
                    setClaimError(null);
                  }}
                  className={`py-1.5 px-2 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 text-center ${
                    loginRole === "CLAIM"
                      ? "bg-surface text-ink shadow-2xs font-bold"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <GraduationCap className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Claim ID</span>
                </button>
              </div>

              {/* TAB 1 & 2: STUDENT / STAFF CREDENTIALS SIGN-IN */}
              {loginRole !== "CLAIM" && (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  {error && (
                    <div className="flex items-start gap-2.5 rounded-md bg-red-50/90 border border-red-200/90 p-3 text-xs text-red-700 animate-in fade-in duration-150">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                      <span className="leading-relaxed font-medium">{error}</span>
                    </div>
                  )}

                  <FormInput
                    id="login-identifier-input"
                    label={loginRole === "STUDENT" ? "Student Roll Number" : "Email or Staff ID"}
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      loginRole === "STUDENT"
                        ? "e.g. C25-BVI-001 or ROLL-101"
                        : "e.g. user@institute.edu or admin"
                    }
                  />

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-ink-secondary">Password</label>
                      {loginRole === "STUDENT" && (
                        <button
                          type="button"
                          onClick={() => {
                            setForgotIdentifier(email.trim());
                            setForgotError(null);
                            setViewMode("FORGOT_REQUEST");
                          }}
                          className="text-xs font-medium text-primary hover:underline cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <FormInput
                      id="login-password-input"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                    />
                  </div>

                  <ButtonPrimary
                    id="btn-login-submit"
                    type="submit"
                    className="w-full"
                    isLoading={loading}
                  >
                    {loginRole === "STUDENT" ? "Sign In to Student Portal" : "Sign In to Console"}
                  </ButtonPrimary>
                </form>
              )}

              {/* TAB 3: CLAIM STUDENT ACCOUNT */}
              {loginRole === "CLAIM" && (
                <div>
                  {claimSuccess ? (
                    <div className="text-center py-4 space-y-3">
                      <CheckCircle2 className="h-8 w-8 text-accent-green mx-auto animate-bounce" />
                      <h2 className="text-sm font-bold text-ink">Account Claimed Successfully!</h2>
                      <p className="text-xs text-ink-muted">
                        Your account has been initialized. Redirecting to student portal...
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleClaimSubmit} className="space-y-4">
                      {claimError && (
                        <div className="flex items-start gap-2.5 rounded-md bg-red-50/90 border border-red-200/90 p-3 text-xs text-red-700 animate-in fade-in duration-150">
                          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                          <span className="leading-relaxed font-medium">{claimError}</span>
                        </div>
                      )}

                      <div className="p-2.5 rounded-md bg-canvas-soft border border-hairline text-[11px] text-ink-muted leading-relaxed">
                        First time here? Enter your 6-digit admission ID and roll number to create your password and activate your account.
                      </div>

                      <FormInput
                        id="claim-id-input"
                        label="6-Digit Numeric Student ID"
                        type="text"
                        required
                        maxLength={6}
                        value={claimStudentId}
                        onChange={(e) => setClaimStudentId(e.target.value)}
                        placeholder="e.g. 315116"
                      />

                      <FormInput
                        id="claim-roll-input"
                        label="Institute Roll Number"
                        type="text"
                        required
                        value={claimRollNumber}
                        onChange={(e) => setClaimRollNumber(e.target.value)}
                        placeholder="e.g. MECH-042 or ROLL-101"
                      />

                      <FormInput
                        id="claim-password-input"
                        label="Create Password"
                        type="password"
                        required
                        minLength={8}
                        value={claimPassword}
                        onChange={(e) => setClaimPassword(e.target.value)}
                        placeholder="Minimum 8 characters"
                      />

                      <FormInput
                        id="claim-confirm-password-input"
                        label="Confirm Password"
                        type="password"
                        required
                        minLength={8}
                        value={claimConfirmPassword}
                        onChange={(e) => setClaimConfirmPassword(e.target.value)}
                        placeholder="Repeat password"
                      />

                      <ButtonPrimary
                        id="btn-claim-submit"
                        type="submit"
                        className="w-full"
                        isLoading={claimLoading}
                      >
                        <GraduationCap className="h-4 w-4 mr-1.5" />
                        Claim Account & Sign In
                      </ButtonPrimary>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* VIEW: FORGOT PASSWORD REQUEST FORM */}
          {viewMode === "FORGOT_REQUEST" && (
            <form onSubmit={handleRequestReset} className="space-y-4">
              {forgotError && (
                <div className="flex items-start gap-2.5 rounded-md bg-red-50/90 border border-red-200/90 p-3 text-xs text-red-700 animate-in fade-in duration-150">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  <span className="leading-relaxed font-medium">{forgotError}</span>
                </div>
              )}

              <div className="p-3 rounded-lg bg-canvas-soft border border-hairline text-xs text-ink-muted leading-relaxed">
                Provide your Roll Number or Student ID. A real-time password reset request will be dispatched to your Branch Manager for approval.
              </div>

              <FormInput
                label="Student Roll Number, ID, or Email"
                type="text"
                required
                value={forgotIdentifier}
                onChange={(e) => setForgotIdentifier(e.target.value)}
                placeholder="e.g. C25-BVI-001 or STU-8821"
              />

              <ButtonPrimary
                id="btn-request-reset"
                type="submit"
                className="w-full"
                isLoading={forgotLoading}
              >
                <KeyRound className="h-4 w-4 mr-1.5" />
                Request Reset Approval
              </ButtonPrimary>

              <button
                type="button"
                onClick={() => setViewMode("LOGIN")}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-ink-muted hover:text-ink pt-1 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Sign In</span>
              </button>
            </form>
          )}

          {/* VIEW: AWAITING BRANCH MANAGER APPROVAL (LOADING STATE) */}
          {viewMode === "AWAITING_APPROVAL" && (
            <div className="text-center py-3 space-y-4">
              <div className="relative inline-flex items-center justify-center">
                <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 animate-pulse">
                  <Clock className="h-8 w-8 animate-spin" />
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-sm sm:text-base font-bold text-ink">
                  Awaiting Branch Manager Approval
                </h3>
                <p className="text-xs text-ink-muted">
                  {studentInfo?.name ? `${studentInfo.name} • ` : ""}
                  {studentInfo?.roll || forgotIdentifier}
                </p>
              </div>

              {/* Strict Non-Refresh Warning Banner */}
              <div className="p-3.5 rounded-lg bg-amber-50/90 border border-amber-200/90 text-amber-900 text-xs text-left space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-amber-800">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>Do Not Refresh or Leave</span>
                </div>
                <p className="leading-relaxed">
                  Your request has been routed to your Branch Manager. <strong>Please do not refresh this page or go back</strong> while awaiting approval.
                </p>
                <p className="text-[11px] text-amber-700">
                  Once your manager approves, this form will instantly update and unlock your new password form.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 pt-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-xs text-ink-muted font-mono">
                  Listening for live approval...
                </span>
              </div>

              <div className="pt-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => {
                    setActiveRequestId(null);
                    setViewMode("LOGIN");
                  }}
                  className="text-xs text-ink-muted hover:text-ink underline cursor-pointer"
                >
                  Cancel and return to sign in
                </button>
              </div>
            </div>
          )}

          {/* VIEW: RESET PASSWORD FORM */}
          {viewMode === "RESET_PASSWORD" && (
            <form onSubmit={handleCompleteReset} className="space-y-4">
              {forgotError && (
                <div className="flex items-start gap-2.5 rounded-md bg-red-50/90 border border-red-200/90 p-3 text-xs text-red-700 animate-in fade-in duration-150">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  <span className="leading-relaxed font-medium">{forgotError}</span>
                </div>
              )}

              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>
                  Approval confirmed! Set a new password for{" "}
                  <strong>{studentInfo?.name || studentInfo?.roll || "your account"}</strong>.
                </span>
              </div>

              <FormInput
                label="New Password"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
              />

              <FormInput
                label="Confirm New Password"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
              />

              <ButtonPrimary
                id="btn-save-new-password"
                type="submit"
                className="w-full"
                isLoading={forgotLoading}
              >
                <Lock className="h-4 w-4 mr-1.5" />
                Save New Password & Sign In
              </ButtonPrimary>
            </form>
          )}

          {deferredPrompt && !isStandalone && loginRole === "STUDENT" && (
            <div className="mt-4">
              <button
                type="button"
                onClick={handleInstallClick}
                id="btn-install-pwa"
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Install Student App on this Device</span>
              </button>
            </div>
          )}

          {/* Contextual Footer Navigation */}
          {viewMode === "LOGIN" && (
            <div className="mt-3.5 pt-3 border-t border-hairline text-center text-xs text-ink-muted">
              {loginRole === "STUDENT" ? (
                <>
                  Are you a student with a new admission ID?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setLoginRole("CLAIM");
                      setError(null);
                    }}
                    className="font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Claim Account →
                  </button>
                </>
              ) : loginRole === "STAFF" ? (
                <>
                  Are you a student accessing results?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setLoginRole("STUDENT");
                      setError(null);
                    }}
                    className="font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Student Portal Sign-In →
                  </button>
                </>
              ) : (
                <>
                  Already claimed your account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setLoginRole("STUDENT");
                      setClaimError(null);
                    }}
                    className="font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Sign In with Roll Number →
                  </button>
                </>
              )}
            </div>
          )}
        </FeatureCard>
      </div>
    </div>
  );
}

function LoginLoadingFallback() {
  return (
    <div className="flex min-h-[75vh] items-center justify-center py-8">
      <div className="w-full max-w-sm p-6 rounded-xl border border-hairline bg-surface shadow-xs space-y-4">
        <div className="h-12 w-12 bg-canvas-soft rounded-xl animate-pulse mx-auto" />
        <div className="h-5 w-40 bg-canvas-soft rounded animate-pulse mx-auto" />
        <div className="h-3 w-56 bg-canvas-soft rounded animate-pulse mx-auto" />
        <div className="h-9 bg-canvas-soft rounded-lg animate-pulse" />
        <div className="h-10 bg-canvas-soft rounded-lg animate-pulse" />
        <div className="h-10 bg-canvas-soft rounded-lg animate-pulse" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoadingFallback />}>
      <LoginForm />
    </Suspense>
  );
}
