"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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
import { api, getAuthToken, getStoredUser, setAuthToken, setStoredUser } from "@/lib/api";
import { ButtonPrimary, FormInput, FeatureCard } from "@/components/ui";
import { useToast, queueToast } from "@/lib/ToastContext";
import { useTenant } from "@/lib/TenantContext";
import { startNavigationProgress } from "@/components/NavigationProgressBar";

type AuthViewMode = "LOGIN" | "FORGOT_REQUEST" | "VERIFY_OTP" | "AWAITING_APPROVAL" | "RESET_PASSWORD";
type AuthRole = "STUDENT" | "STAFF" | "CLAIM";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
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

  // Email-First OTP states
  const [otpCode, setOtpCode] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [canEscalate, setCanEscalate] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

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

  // Handle Popup window bridge (if Google OAuth callback lands inside a popup)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.opener && window.opener !== window) {
      const oauthToken = searchParams.get("oauth_token");
      const oauthError = searchParams.get("oauth_error");
      const roleParam = searchParams.get("role");
      const nameParam = searchParams.get("name");
      const branchIdParam = searchParams.get("branch_id");
      const instituteIdParam = searchParams.get("institute_id");
      const emailParam = searchParams.get("email");

      if (oauthToken) {
        try {
          window.opener.postMessage(
            {
              type: "PG_OAUTH_SUCCESS",
              token: oauthToken,
              role: roleParam || "STUDENT",
              name: nameParam || "User",
              branch_id: branchIdParam || "",
              institute_id: instituteIdParam || "",
            },
            window.location.origin
          );
        } catch {}
        window.close();
        return;
      }

      if (oauthError) {
        try {
          window.opener.postMessage(
            {
              type: "PG_OAUTH_ERROR",
              error: oauthError,
              email: emailParam || "",
              role: roleParam || "",
            },
            window.location.origin
          );
        } catch {}
        window.close();
        return;
      }
    }
  }, [searchParams]);

  // Handle Parent window listening for popup message
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "PG_OAUTH_SUCCESS") {
        const { token, role, name, branch_id, institute_id } = event.data;
        setAuthToken(token, {
          role,
          full_name: name,
          branch_id,
          institute_id,
        });

        if (branch_id) localStorage.setItem("papergrade_selected_branch_id", branch_id);
        if (institute_id) localStorage.setItem("papergrade_selected_institute_id", institute_id);
        try { queryClient.clear(); } catch {}

        queueToast({
          type: "success",
          title: role === "STUDENT" ? "Welcome Student" : "Welcome Back",
          message: `Signed in with Google as ${name}.`,
          duration: 4500,
        });

        let dest = "/overview";
        if (role === "STUDENT") dest = "/student/portal";
        else if (role === "BRANCH_MANAGER" || role === "INSTITUTE_DIRECTOR") dest = "/branch/batches";
        startNavigationProgress();
        window.location.replace(dest);
      } else if (event.data?.type === "PG_OAUTH_ERROR") {
        setGoogleLoading(false);
        const { error, email: em, role: r } = event.data;
        if (error === "unregistered_email") {
          setError(`No account found matching ${em || "your Google email"}. Please activate your account first using your roll number.`);
        } else if (error === "role_mismatch_student") {
          setError(`${em || "This Google account"} is registered as ${r || "Faculty / Staff"}. Please switch to the Faculty/Staff tab to sign in.`);
        } else if (error === "role_mismatch_staff") {
          setError(`${em || "This Google account"} is registered as a Student. Please switch to the Student tab to sign in.`);
        } else {
          setError("Google authentication could not be completed. Please try again or sign in with your credentials.");
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [queryClient]);

  // Check if user is already authenticated or launched in standalone PWA
  useEffect(() => {
    // 1. Check for incoming Google OAuth redirect token or error (Fallback for full redirects)
    const oauthToken = searchParams.get("oauth_token");
    if (oauthToken) {
      const roleParam = searchParams.get("role") || "STUDENT";
      const nameParam = searchParams.get("name") || "User";
      const branchIdParam = searchParams.get("branch_id") || "";
      const instituteIdParam = searchParams.get("institute_id") || "";

      const userObj = {
        role: roleParam,
        full_name: nameParam,
        branch_id: branchIdParam,
        institute_id: instituteIdParam,
      };

      // Store JWT token to 'papergrade_jwt' and user payload to 'papergrade_user'
      setAuthToken(oauthToken, userObj);

      if (typeof window !== "undefined") {
        if (branchIdParam) {
          localStorage.setItem("papergrade_selected_branch_id", branchIdParam);
        }
        if (instituteIdParam) {
          localStorage.setItem("papergrade_selected_institute_id", instituteIdParam);
        }
      }

      try {
        queryClient.clear();
      } catch {}

      queueToast({
        type: "success",
        title: roleParam === "STUDENT" ? "Welcome Student" : "Welcome Back",
        message: `Signed in with Google as ${nameParam}.`,
        duration: 4500,
      });

      let dest = "/overview";
      if (roleParam === "STUDENT") dest = "/student/portal";
      else if (roleParam === "BRANCH_MANAGER" || roleParam === "INSTITUTE_DIRECTOR") dest = "/branch/batches";

      startNavigationProgress();
      window.location.replace(dest);
      return;
    }

    const oauthError = searchParams.get("oauth_error");
    if (oauthError) {
      if (oauthError === "unregistered_email") {
        const em = searchParams.get("email");
        setError(`No account found matching ${em || "your Google email"}. Please activate your account first using your roll number.`);
      } else if (oauthError === "role_mismatch_student") {
        const em = searchParams.get("email");
        const r = searchParams.get("role") || "Faculty / Staff";
        setError(`${em || "This Google account"} is registered as ${r}. Please switch to the Faculty/Staff tab to sign in.`);
      } else if (oauthError === "role_mismatch_staff") {
        const em = searchParams.get("email");
        setError(`${em || "This Google account"} is registered as a Student. Please switch to the Student tab to sign in.`);
      } else {
        setError("Google authentication could not be completed. Please try again or sign in with your credentials.");
      }
    }

    const isSwitchMode = searchParams.get("switch") === "true" || searchParams.get("mode") === "switch";
    if (isSwitchMode) {
      api.logout();
      return;
    }

    const token = getAuthToken();
    const storedUser = getStoredUser();
    if (token && storedUser) {
      const redirectParam = searchParams.get("redirect");
      const isValidRedirect = Boolean(redirectParam && !redirectParam.startsWith("/auth"));
      let dest = "/overview";
      if (storedUser.role === "STUDENT") {
        dest = isValidRedirect && (redirectParam!.startsWith("/student") || redirectParam!.startsWith("/results"))
          ? redirectParam!
          : "/student/portal";
      } else if (storedUser.role === "BRANCH_MANAGER") {
        dest = isValidRedirect && !redirectParam!.startsWith("/student") && !redirectParam!.startsWith("/admin/reports") && !redirectParam!.startsWith("/admin/tenancy") && redirectParam !== "/overview"
          ? redirectParam!
          : "/branch/batches";
      } else if (storedUser.role === "INSTITUTE_DIRECTOR") {
        dest = isValidRedirect && !redirectParam!.startsWith("/student") && !redirectParam!.startsWith("/admin/tenancy") && redirectParam !== "/overview"
          ? redirectParam!
          : "/branch/batches";
      } else {
        dest = isValidRedirect && !redirectParam!.startsWith("/student") ? redirectParam! : "/overview";
      }
      window.location.replace(dest);
      return;
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
  }, [router, searchParams]);

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
          const approver = res.is_staff || loginRole === "STAFF" ? "Root Administrator" : "Branch Manager";
          toast.success(
            `${approver} authorized your request! You can now set your new password.`,
            { title: "Request Approved", duration: 6000 }
          );
          setResetToken(res.reset_token || null);
          setViewMode("RESET_PASSWORD");
        } else if (res.status === "REJECTED") {
          const approver = res.is_staff || loginRole === "STAFF" ? "Root Administrator" : "Branch Manager";
          toast.error(`Your password reset request was declined by ${approver}.`, {
            title: "Request Declined",
          });
          setForgotError(`Request was declined by ${approver}. Please contact administration.`);
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
  }, [viewMode, activeRequestId, sessionSecret, toast, loginRole]);

  const handleInstallClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      setError(null);
      const res = await api.getGoogleAuthUrl("login", loginRole);
      if (res?.authorization_url) {
        // PWA Optimization: Open in a centered popup so the PWA never loses standalone mode
        const width = 500;
        const height = 650;
        const left = typeof window !== "undefined" ? window.screenX + (window.outerWidth - width) / 2 : 100;
        const top = typeof window !== "undefined" ? window.screenY + (window.outerHeight - height) / 2 : 100;
        const popup = window.open(
          res.authorization_url,
          "google_oauth_popup",
          `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
        );

        if (!popup || popup.closed || typeof popup.closed === "undefined") {
          // If popup is blocked by browser, fallback to standard redirect
          window.location.href = res.authorization_url;
        }
      }
    } catch (err: any) {
      setError(err?.message || "Failed to initiate Google Sign-In. Please check your network connection.");
      setGoogleLoading(false);
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
      const isValidRedirect = Boolean(redirectParam && !redirectParam.startsWith("/auth"));
      let dest = "/overview";

      if (user.role === "STUDENT") {
        roleTitle = "Welcome Student";
        dest = isValidRedirect && (redirectParam!.startsWith("/student") || redirectParam!.startsWith("/results"))
          ? redirectParam!
          : "/student/portal";
      } else if (user.role === "BRANCH_MANAGER") {
        roleTitle = "Welcome Branch Manager";
        dest = isValidRedirect && !redirectParam!.startsWith("/student") && !redirectParam!.startsWith("/admin/reports") && !redirectParam!.startsWith("/admin/tenancy") && redirectParam !== "/overview"
          ? redirectParam!
          : "/branch/batches";
      } else if (user.role === "INSTITUTE_DIRECTOR") {
        roleTitle = "Welcome Institute Director";
        dest = isValidRedirect && !redirectParam!.startsWith("/student") && !redirectParam!.startsWith("/admin/tenancy") && redirectParam !== "/overview"
          ? redirectParam!
          : "/branch/batches";
      } else {
        dest = isValidRedirect && !redirectParam!.startsWith("/student") ? redirectParam! : "/overview";
      }

      const welcomeMsg = `Signed in as ${user.full_name || enteredEmail}.`;
      queueToast({
        type: "success",
        title: roleTitle,
        message: welcomeMsg,
        duration: 4500,
      });

      const fullUser = user.user ? { ...user, ...user.user } : user;
      if (typeof window !== "undefined") {
        if (fullUser.branch_id) {
          localStorage.setItem("papergrade_selected_branch_id", fullUser.branch_id);
        }
        if (fullUser.institute_id) {
          localStorage.setItem("papergrade_selected_institute_id", fullUser.institute_id);
        }
      }

      // Purge query cache to ensure no data from previous accounts lingers
      try {
        queryClient.clear();
      } catch {}

      // Clean top-level navigate for all authenticated roles (Students, Faculty, Branch Managers, Root Admins)
      // to eliminate client-side router transition race conditions, bfcache/history leaks, and stuttering.
      startNavigationProgress();
      window.location.replace(dest);
      return;
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
        window.location.replace("/student/portal");
      }, 800);
    } catch (err: any) {
      const msg = err.message || "Failed to claim account. Check your Roll Number and try again.";
      setClaimError(msg);
      toast.error(msg, { title: "Claim Failed" });
    } finally {
      setClaimLoading(false);
    }
  };

  // Cooldown timer for OTP resend
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => setOtpCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  // Student or staff initiates password reset request
  const handleRequestReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
      setEmailHint(res.email_hint || null);
      setCanEscalate(Boolean(res.can_escalate));

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

      if (res.request_status === "PENDING_OTP") {
        setViewMode("VERIFY_OTP");
        setOtpCooldown(60);
        toast.success(res.message || "A 6-digit verification code has been sent to your email.", {
          title: "Verification Code Sent",
          duration: 5000,
        });
        return;
      }

      setViewMode("AWAITING_APPROVAL");
      const approverTarget = res.is_staff || loginRole === "STAFF" ? "Root Administrator" : "your Branch Manager";
      toast.info(`Request routed to ${approverTarget}. Please do not refresh this page.`, {
        title: "Awaiting Authorization",
        duration: 5000,
      });
    } catch (err: any) {
      setForgotError(err.message || "Failed to submit password reset request.");
    } finally {
      setForgotLoading(false);
    }
  };

  // User submits 6-digit verification code
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = otpCode.trim();
    if (!cleanCode || cleanCode.length !== 6 || !/^\d+$/.test(cleanCode)) {
      setForgotError("Please enter a valid 6-digit numeric verification code.");
      return;
    }
    if (!activeRequestId || !sessionSecret) {
      setForgotError("Session expired. Please request a new verification code.");
      return;
    }

    setForgotLoading(true);
    setForgotError(null);

    try {
      const res = await api.verifyPasswordResetOtp({
        request_id: activeRequestId,
        session_secret: sessionSecret,
        otp_code: cleanCode,
      });

      setResetToken(res.reset_token);
      setViewMode("RESET_PASSWORD");
      toast.success("Code verified! Please enter your new password.", {
        title: "Verification Successful",
        duration: 4000,
      });
    } catch (err: any) {
      setForgotError(err.message || "Invalid verification code. Please check your email and try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  // User escalates to admin authorization queue (fallback)
  const handleEscalateToAdmin = async () => {
    if (!activeRequestId || !sessionSecret) return;
    setForgotLoading(true);
    setForgotError(null);

    try {
      const res = await api.escalatePasswordResetToAdmin({
        request_id: activeRequestId,
        session_secret: sessionSecret,
      });
      setViewMode("AWAITING_APPROVAL");
      toast.info("Request escalated to administrator for manual authorization.", {
        title: "Awaiting Authorization",
        duration: 5000,
      });
    } catch (err: any) {
      setForgotError(err.message || "Failed to escalate request.");
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
              ? "Reset Password"
              : viewMode === "VERIFY_OTP"
              ? "Enter Verification Code"
              : viewMode === "AWAITING_APPROVAL"
              ? "Administrator Authorization"
              : "Set New Password"}
          </h1>
          <p className="text-xs text-ink-muted">
            {viewMode === "LOGIN"
              ? loginRole === "STUDENT"
                ? "Enter your student Roll Number and password to access your dashboard."
                : loginRole === "STAFF"
                ? "Enter your institutional email or Staff ID to access administrative operations."
                : "Enter your Institute Roll Number to set your password and activate your account."
              : viewMode === "FORGOT_REQUEST"
              ? "Enter your linked email or roll number to receive a 6-digit verification code."
              : viewMode === "VERIFY_OTP"
              ? `A 6-digit code was sent to ${emailHint || "your registered email"}.`
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
                  <span className="truncate">Claim Account</span>
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
                        ? "e.g. C25-BVI-001"
                        : "e.g. user@institute.edu or admin"
                    }
                  />

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-ink-secondary">Password</label>
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

                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-hairline" />
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase">
                      <span className="bg-surface px-2 text-ink-muted font-medium">Or</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading || googleLoading}
                    className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-md border border-hairline bg-surface hover:bg-canvas text-xs font-semibold text-ink transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    {googleLoading ? "Connecting to Google..." : "Sign in with Google"}
                  </button>
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
                        First time here? Enter your assigned institute roll number to create your password and activate your student account.
                      </div>

                      <FormInput
                        id="claim-roll-input"
                        label="Institute Roll Number"
                        type="text"
                        required
                        value={claimRollNumber}
                        onChange={(e) => setClaimRollNumber(e.target.value)}
                        placeholder="e.g. C25-BVI-001"
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
                {loginRole === "STAFF"
                  ? "Provide your registered Staff Email. A real-time password reset request will be dispatched to the Root Administrator for authorization."
                  : "Provide your Roll Number or Student Email. A real-time password reset request will be dispatched to your Branch Manager for approval."}
              </div>

              <FormInput
                label={loginRole === "STAFF" ? "Staff Institutional Email" : "Student Roll Number or Email"}
                type="text"
                required
                value={forgotIdentifier}
                onChange={(e) => setForgotIdentifier(e.target.value)}
                placeholder={
                  loginRole === "STAFF"
                    ? "e.g. director@institute.edu or manager@branch.com"
                    : "e.g. C25-BVI-001"
                }
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

          {/* VIEW: VERIFY OTP FORM */}
          {viewMode === "VERIFY_OTP" && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              {forgotError && (
                <div className="flex items-start gap-2.5 rounded-md bg-red-50/90 border border-red-200/90 p-3 text-xs text-red-700 animate-in fade-in duration-150">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  <span className="leading-relaxed font-medium">{forgotError}</span>
                </div>
              )}

              <div className="p-3 rounded-lg bg-surface-muted/60 border border-hairline text-xs space-y-1">
                <div className="font-semibold text-ink">Verification Code Sent</div>
                <p className="text-ink-muted leading-relaxed">
                  We sent a 6-digit code to <strong className="text-ink font-mono">{emailHint || "your registered email"}</strong>. It is valid for 10 minutes.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5 text-center">
                  6-Digit Verification Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full text-center text-2xl font-bold tracking-[0.4em] font-mono py-2.5 px-3 rounded-md border border-hairline bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  autoFocus
                />
              </div>

              <ButtonPrimary
                type="submit"
                isLoading={forgotLoading}
                className="w-full py-2.5 text-xs font-bold"
                disabled={otpCode.length !== 6 || forgotLoading}
              >
                Verify Code & Set Password
              </ButtonPrimary>

              <div className="flex items-center justify-between text-xs text-ink-muted pt-1">
                <button
                  type="button"
                  disabled={otpCooldown > 0 || forgotLoading}
                  onClick={() => handleRequestReset()}
                  className="hover:text-ink cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {otpCooldown > 0 ? `Resend code in ${otpCooldown}s` : "Resend Code"}
                </button>

                {canEscalate && (
                  <button
                    type="button"
                    disabled={forgotLoading}
                    onClick={handleEscalateToAdmin}
                    className="text-amber-700 hover:text-amber-900 underline cursor-pointer transition-colors"
                    title="If you do not have access to your email, request manual approval"
                  >
                    Request Manager Approval
                  </button>
                )}
              </div>

              <div className="pt-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setViewMode("LOGIN")}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-ink-muted hover:text-ink cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Cancel and back to sign in</span>
                </button>
              </div>
            </form>
          )}

          {/* VIEW: AWAITING APPROVAL (LOADING STATE) */}
          {viewMode === "AWAITING_APPROVAL" && (
            <div className="text-center py-3 space-y-4">
              <div className="relative inline-flex items-center justify-center">
                <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 animate-pulse">
                  <Clock className="h-8 w-8 animate-spin" />
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-sm sm:text-base font-bold text-ink">
                  {loginRole === "STAFF"
                    ? "Awaiting Root Administrator Authorization"
                    : "Awaiting Branch Manager Approval"}
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
                  Your request has been routed to {loginRole === "STAFF" ? "the Root Administrator" : "your Branch Manager"}. <strong>Please do not refresh this page or go back</strong> while awaiting authorization.
                </p>
                <p className="text-[11px] text-amber-700">
                  Once authorized, this form will instantly update and unlock your new password form.
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
