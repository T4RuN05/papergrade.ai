"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { GoogleSignInButton, type GoogleSessionPayload } from "@/components/auth/GoogleSignInButton";
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
  Loader2,
} from "lucide-react";
import { api, getAuthToken, getStoredUser, setAuthToken, setStoredUser } from "@/lib/api";
import { FormInput, Skeleton } from "@/components/ui";
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

  // Strict Mobile Swipe & Smooth Tab Switching (Student | Faculty/Staff | Claim Account)
  const AUTH_ROLE_TABS: AuthRole[] = ["STUDENT", "STAFF", "CLAIM"];
  const activeRoleIndex = Math.max(0, AUTH_ROLE_TABS.indexOf(loginRole));
  const authCarouselRef = useRef<HTMLDivElement>(null);
  const authTrackRef = useRef<HTMLDivElement>(null);
  const authPillRef = useRef<HTMLSpanElement>(null);
  const paneRefs = useRef<[HTMLDivElement | null, HTMLDivElement | null, HTMLDivElement | null]>([
    null,
    null,
    null,
  ]);
  const hasMeasuredCarouselRef = useRef(false);
  const [isAuthTouchDragging, setIsAuthTouchDragging] = useState(false);
  const [isAuthTransitioning, setIsAuthTransitioning] = useState(false);
  const authTouchStartXRef = useRef<number>(0);
  const authTouchStartYRef = useRef<number>(0);
  const authTouchStartTimeRef = useRef<number>(0);
  const authGestureLockRef = useRef<"horizontal" | "vertical" | null>(null);
  const authTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncCarouselHeight = React.useCallback((roleIdx: number, animate: boolean) => {
    const carousel = authCarouselRef.current;
    const pane = paneRefs.current[roleIdx];
    if (!carousel || !pane) return;
    const nextHeight = pane.offsetHeight;
    if (!nextHeight) return;

    if (!animate || !hasMeasuredCarouselRef.current) {
      carousel.style.transition = "none";
      carousel.style.height = `${nextHeight}px`;
      hasMeasuredCarouselRef.current = true;
      return;
    }

    // Lock current height frame before transitioning to target height smoothly
    const currentHeight = carousel.getBoundingClientRect().height;
    if (Math.abs(currentHeight - nextHeight) < 1) {
      carousel.style.height = `${nextHeight}px`;
      return;
    }
    carousel.style.transition = "none";
    carousel.style.height = `${currentHeight}px`;
    void carousel.offsetHeight; // Flush layout synchronously for CSS transition start
    carousel.style.transition = "height 280ms cubic-bezier(0.2, 0.8, 0.25, 1)";
    carousel.style.height = `${nextHeight}px`;
  }, []);

  // Measure active pane height and follow dynamic inner content changes (errors, claim verification, etc.)
  useEffect(() => {
    if (viewMode !== "LOGIN") {
      hasMeasuredCarouselRef.current = false;
      return;
    }
    const activeEl = paneRefs.current[activeRoleIndex];
    if (!activeEl) return;

    syncCarouselHeight(activeRoleIndex, hasMeasuredCarouselRef.current);

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (authGestureLockRef.current === "horizontal") return;
      syncCarouselHeight(activeRoleIndex, hasMeasuredCarouselRef.current);
    });
    ro.observe(activeEl);
    return () => ro.disconnect();
  }, [activeRoleIndex, viewMode, syncCarouselHeight]);

  const switchLoginRole = React.useCallback((nextRole: AuthRole) => {
    if (nextRole === loginRole) return;
    if (authTransitionTimerRef.current) clearTimeout(authTransitionTimerRef.current);

    setIsAuthTransitioning(true);
    setLoginRole(nextRole);
    setError(null);
    if (nextRole === "CLAIM") setClaimError(null);

    const nextIdx = AUTH_ROLE_TABS.indexOf(nextRole);
    syncCarouselHeight(nextIdx, true);
    if (authTrackRef.current) {
      authTrackRef.current.style.transition = "transform 280ms cubic-bezier(0.2, 0.8, 0.25, 1)";
      authTrackRef.current.style.transform = `translate3d(-${(nextIdx * 100) / 3}%, 0, 0)`;
    }
    if (authPillRef.current) {
      authPillRef.current.style.transition = "transform 280ms cubic-bezier(0.2, 0.8, 0.25, 1)";
      authPillRef.current.style.transform = `translate3d(${nextIdx * 100}%, 0, 0)`;
    }

    authTransitionTimerRef.current = setTimeout(() => {
      setIsAuthTransitioning(false);
    }, 300);
  }, [loginRole, syncCarouselHeight]);

  useEffect(() => {
    return () => {
      if (authTransitionTimerRef.current) clearTimeout(authTransitionTimerRef.current);
    };
  }, []);

  const handleAuthTouchStart = (e: React.TouchEvent) => {
    if (typeof window === "undefined" || window.innerWidth >= 640) return;
    if (viewMode !== "LOGIN" || e.touches.length !== 1) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [data-no-swipe='true']")) return;

    authTouchStartXRef.current = e.touches[0].clientX;
    authTouchStartYRef.current = e.touches[0].clientY;
    authTouchStartTimeRef.current = Date.now();
    authGestureLockRef.current = null;
  };

  const handleAuthTouchMove = (e: React.TouchEvent) => {
    if (typeof window === "undefined" || window.innerWidth >= 640) return;
    if (viewMode !== "LOGIN" || e.touches.length !== 1) return;
    const container = authCarouselRef.current;
    if (!container) return;

    const dx = e.touches[0].clientX - authTouchStartXRef.current;
    const dy = e.touches[0].clientY - authTouchStartYRef.current;

    if (!authGestureLockRef.current) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        authGestureLockRef.current = "horizontal";
        setIsAuthTouchDragging(true);
      } else {
        authGestureLockRef.current = "vertical";
        return;
      }
    }

    if (authGestureLockRef.current !== "horizontal") return;

    const width = Math.max(1, container.offsetWidth);
    const isAtLeftEdge = activeRoleIndex === 0 && dx > 0;
    const isAtRightEdge = activeRoleIndex === AUTH_ROLE_TABS.length - 1 && dx < 0;
    const dampedDx = isAtLeftEdge || isAtRightEdge ? dx * 0.25 : dx;

    const trackPct = -(activeRoleIndex * (100 / 3)) + (dampedDx / width) * (100 / 3);
    const pillPct = activeRoleIndex * 100 - (dampedDx / width) * 100;

    // Live-interpolate outer container height smoothly with horizontal swipe progress
    const dragProgress = Math.min(1, Math.max(-1, -dampedDx / width));
    const neighborIdx =
      dragProgress > 0
        ? Math.min(AUTH_ROLE_TABS.length - 1, activeRoleIndex + 1)
        : Math.max(0, activeRoleIndex - 1);
    const fromH = paneRefs.current[activeRoleIndex]?.offsetHeight || 0;
    const toH = paneRefs.current[neighborIdx]?.offsetHeight || fromH;
    if (fromH > 0 && toH > 0) {
      const ratio = Math.abs(dragProgress);
      container.style.transition = "none";
      container.style.height = `${fromH + (toH - fromH) * ratio}px`;
    }

    if (authTrackRef.current) {
      authTrackRef.current.style.transition = "none";
      authTrackRef.current.style.transform = `translate3d(${trackPct}%, 0, 0)`;
    }
    if (authPillRef.current) {
      authPillRef.current.style.transition = "none";
      authPillRef.current.style.transform = `translate3d(${pillPct}%, 0, 0)`;
    }
  };

  const handleAuthTouchEnd = (e: React.TouchEvent) => {
    if (authGestureLockRef.current !== "horizontal") {
      authGestureLockRef.current = null;
      return;
    }
    authGestureLockRef.current = null;
    setIsAuthTouchDragging(false);

    const container = authCarouselRef.current;
    const width = Math.max(1, container?.offsetWidth || 300);
    const endX = e.changedTouches[0]?.clientX ?? authTouchStartXRef.current;
    const dx = endX - authTouchStartXRef.current;
    const elapsed = Math.max(1, Date.now() - authTouchStartTimeRef.current);
    const velocity = Math.abs(dx) / elapsed;
    const shouldAdvance = Math.abs(dx) > width * 0.22 || (Math.abs(dx) > 36 && velocity > 0.35);

    if (shouldAdvance) {
      if (dx < 0 && activeRoleIndex < AUTH_ROLE_TABS.length - 1) {
        switchLoginRole(AUTH_ROLE_TABS[activeRoleIndex + 1]);
        return;
      }
      if (dx > 0 && activeRoleIndex > 0) {
        switchLoginRole(AUTH_ROLE_TABS[activeRoleIndex - 1]);
        return;
      }
    }

    // Spring back cleanly to current active tab and its height
    setIsAuthTransitioning(true);
    syncCarouselHeight(activeRoleIndex, true);
    if (authTrackRef.current) {
      authTrackRef.current.style.transition = "transform 280ms cubic-bezier(0.2, 0.8, 0.25, 1)";
      authTrackRef.current.style.transform = `translate3d(-${(activeRoleIndex * 100) / 3}%, 0, 0)`;
    }
    if (authPillRef.current) {
      authPillRef.current.style.transition = "transform 280ms cubic-bezier(0.2, 0.8, 0.25, 1)";
      authPillRef.current.style.transform = `translate3d(${activeRoleIndex * 100}%, 0, 0)`;
    }
    if (authTransitionTimerRef.current) clearTimeout(authTransitionTimerRef.current);
    authTransitionTimerRef.current = setTimeout(() => setIsAuthTransitioning(false), 300);
  };

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

  const completeGoogleSession = React.useCallback(
    (payload: GoogleSessionPayload) => {
      const roleParam = payload.role || "STUDENT";
      const nameParam = payload.full_name || "User";
      const branchIdParam = payload.branch_id || "";
      const instituteIdParam = payload.institute_id || "";
      const googleEmailParam = payload.google_email || "";
      const googlePictureParam = payload.google_picture || "";

      const userObj = {
        role: roleParam,
        full_name: nameParam,
        branch_id: branchIdParam,
        institute_id: instituteIdParam,
        ...(googleEmailParam ? { google_email: googleEmailParam } : {}),
        ...(googlePictureParam ? { google_picture: googlePictureParam } : {}),
      };

      setAuthToken(payload.access_token, userObj);

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
    },
    [queryClient]
  );

  // Check if user is already authenticated or launched in standalone PWA
  useEffect(() => {
    // 1. Check for incoming Google OAuth redirect token or error (Fallback for full redirects)
    const oauthToken = searchParams.get("oauth_token");
    if (oauthToken) {
      completeGoogleSession({
        access_token: oauthToken,
        role: searchParams.get("role") || "STUDENT",
        full_name: searchParams.get("name") || "User",
        branch_id: searchParams.get("branch_id") || "",
        institute_id: searchParams.get("institute_id") || "",
        google_email: searchParams.get("google_email") || "",
        google_picture: searchParams.get("google_picture") || "",
      });
      return;
    }

    const oauthError = searchParams.get("oauth_error");
    if (oauthError) {
      if (oauthError === "unregistered_email") {
        const em = searchParams.get("email");
        setError(`No account found matching ${em || "your Google email"}. Please activate your account first or link Google inside Account Settings.`);
      } else if (oauthError === "email_not_verified") {
        setError("Your Google account email is not verified. Please use a verified Google account.");
      } else if (oauthError === "google_account_mismatch") {
        setError("This PaperGrade account is already linked to a different Google account. Please sign in with that linked Google account or use your password.");
      } else if (oauthError === "account_deactivated") {
        setError("This account has been deactivated. Please contact your branch administrator.");
      } else if (oauthError === "access_denied") {
        setError("Google Sign-In was cancelled.");
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
      const res = await api.getGoogleAuthUrl("login");
      if (res?.authorization_url) {
        window.location.href = res.authorization_url;
      } else {
        setGoogleLoading(false);
        setError("Unable to obtain Google Sign-In URL.");
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

  const renderCredentialsPane = (paneRole: "STUDENT" | "STAFF") => {
    const isActivePane = loginRole === paneRole;
    return (
      <form onSubmit={handleLoginSubmit} className="space-y-4">
        {error && isActivePane && (
          <div className="flex items-start gap-2.5 rounded-md bg-canvas-soft border border-red-300/70 dark:border-red-500/30 p-3 text-xs text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
            <span className="leading-relaxed font-medium">{error}</span>
          </div>
        )}

        <FormInput
          id={isActivePane ? "login-identifier-input" : undefined}
          label={paneRole === "STUDENT" ? "Student Roll Number" : "Email or Staff ID"}
          type="text"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={
            paneRole === "STUDENT"
              ? "e.g. C25-BVI-001"
              : "e.g. user@institute.edu or admin"
          }
        />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-ink-secondary">Password</label>
            <button
              type="button"
              onClick={() => {
                setForgotIdentifier(email.trim());
                setForgotError(null);
                setViewMode("FORGOT_REQUEST");
              }}
              className="text-xs font-medium text-primary hover:text-primary-active hover:underline cursor-pointer"
            >
              Forgot password?
            </button>
          </div>
          <FormInput
            id={isActivePane ? "login-password-input" : undefined}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
          />
        </div>

        <button
          id={isActivePane ? "btn-login-submit" : undefined}
          type="submit"
          disabled={loading}
          className="notion-btn-primary w-full h-10 text-xs sm:text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
          <span>{paneRole === "STUDENT" ? "Sign In to Student Portal" : "Sign In to Console"}</span>
        </button>

        <div className="relative my-3">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-hairline" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-surface px-2.5 text-ink-faint">or</span>
          </div>
        </div>

        <GoogleSignInButton
          disabled={loading}
          isActive={isActivePane}
          isConnectingRedirect={googleLoading}
          onFallbackRedirect={handleGoogleSignIn}
          onVerified={completeGoogleSession}
          onError={(msg) => setError(msg)}
        />
      </form>
    );
  };

  return (
    <div className="flex min-h-[75vh] items-center justify-center py-6 sm:py-10 px-4">
      <div className="w-full max-w-[390px] space-y-5">
        <div className="text-center space-y-2">
          <div className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg border border-hairline bg-surface overflow-hidden">
            <Image
              src="/logo-icon.png"
              alt="PaperGrade AI"
              width={44}
              height={44}
              className="h-10 w-10 object-contain"
              priority
            />
          </div>
          <h1 className="notion-heading-2 text-[22px] sm:text-[26px] text-ink">
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
          <p className="text-[13px] text-ink-muted leading-relaxed">
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

        <div className="notion-card p-5 sm:p-6">
          {/* VIEW: LOGIN OR CLAIM FORM */}
          {viewMode === "LOGIN" && (
            <div
              className="space-y-4"
              onTouchStart={handleAuthTouchStart}
              onTouchMove={handleAuthTouchMove}
              onTouchEnd={handleAuthTouchEnd}
              onTouchCancel={handleAuthTouchEnd}
            >
              {/* Role Toggle Tabs with Sliding Pill: Student | Faculty / Staff | Claim Account */}
              <div className="relative grid grid-cols-3 p-1 rounded-lg bg-canvas-soft border border-hairline text-xs select-none">
                <span
                  ref={authPillRef}
                  aria-hidden="true"
                  className="absolute top-1 bottom-1 left-1 w-[calc((100%-8px)/3)] rounded-[7px] bg-surface border border-hairline pointer-events-none will-change-transform"
                  style={{
                    transform: `translate3d(${activeRoleIndex * 100}%, 0, 0)`,
                    transition: isAuthTouchDragging
                      ? "none"
                      : "transform 280ms cubic-bezier(0.2, 0.8, 0.25, 1)",
                  }}
                />

                <button
                  type="button"
                  id="tab-role-student"
                  onClick={() => switchLoginRole("STUDENT")}
                  className={`relative z-10 py-1.5 px-1.5 sm:px-2 rounded-[7px] transition-colors duration-150 cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 text-center min-w-0 ${
                    loginRole === "STUDENT"
                      ? "text-ink font-semibold"
                      : "text-ink-muted font-medium hover:text-ink"
                  }`}
                >
                  <Smartphone className={`h-3.5 w-3.5 shrink-0 transition-colors ${loginRole === "STUDENT" ? "text-primary" : "text-ink-muted"}`} />
                  <span className="truncate">Student</span>
                </button>

                <button
                  type="button"
                  id="tab-role-staff"
                  onClick={() => switchLoginRole("STAFF")}
                  className={`relative z-10 py-1.5 px-1.5 sm:px-2 rounded-[7px] transition-colors duration-150 cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 text-center min-w-0 ${
                    loginRole === "STAFF"
                      ? "text-ink font-semibold"
                      : "text-ink-muted font-medium hover:text-ink"
                  }`}
                >
                  <Lock className={`h-3.5 w-3.5 shrink-0 transition-colors ${loginRole === "STAFF" ? "text-primary" : "text-ink-muted"}`} />
                  <span className="truncate">Faculty</span>
                </button>

                <button
                  type="button"
                  id="tab-role-claim"
                  onClick={() => switchLoginRole("CLAIM")}
                  className={`relative z-10 py-1.5 px-1.5 sm:px-2 rounded-[7px] transition-colors duration-150 cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 text-center min-w-0 ${
                    loginRole === "CLAIM"
                      ? "text-ink font-semibold"
                      : "text-ink-muted font-medium hover:text-ink"
                  }`}
                >
                  <GraduationCap className={`h-3.5 w-3.5 shrink-0 transition-colors ${loginRole === "CLAIM" ? "text-primary" : "text-ink-muted"}`} />
                  <span className="truncate">Claim ID</span>
                </button>
              </div>

              {/* 3-Pane Mobile-Swipe Carousel Container with Smooth Height Interpolation */}
              <div
                ref={authCarouselRef}
                className="overflow-hidden -mx-0.5 px-0.5 will-change-[height]"
              >
                <div
                  ref={authTrackRef}
                  className="flex items-start w-[300%] will-change-transform"
                  style={{
                    transform: `translate3d(-${(activeRoleIndex * 100) / 3}%, 0, 0)`,
                    transition: isAuthTouchDragging
                      ? "none"
                      : "transform 280ms cubic-bezier(0.2, 0.8, 0.25, 1)",
                  }}
                >
                  {/* Pane 0: Student Sign-In */}
                  <div
                    ref={(el) => {
                      paneRefs.current[0] = el;
                    }}
                    aria-hidden={loginRole !== "STUDENT"}
                    className={`w-1/3 shrink-0 min-w-0 px-0.5 transition-opacity duration-200 ${
                      loginRole === "STUDENT" || isAuthTouchDragging || isAuthTransitioning
                        ? "opacity-100"
                        : "opacity-0 pointer-events-none"
                    }`}
                  >
                    {renderCredentialsPane("STUDENT")}
                  </div>

                  {/* Pane 1: Faculty / Staff Sign-In */}
                  <div
                    ref={(el) => {
                      paneRefs.current[1] = el;
                    }}
                    aria-hidden={loginRole !== "STAFF"}
                    className={`w-1/3 shrink-0 min-w-0 px-0.5 transition-opacity duration-200 ${
                      loginRole === "STAFF" || isAuthTouchDragging || isAuthTransitioning
                        ? "opacity-100"
                        : "opacity-0 pointer-events-none"
                    }`}
                  >
                    {renderCredentialsPane("STAFF")}
                  </div>

                  {/* Pane 2: Claim Student Account */}
                  <div
                    ref={(el) => {
                      paneRefs.current[2] = el;
                    }}
                    aria-hidden={loginRole !== "CLAIM"}
                    className={`w-1/3 shrink-0 min-w-0 px-0.5 transition-opacity duration-200 ${
                      loginRole === "CLAIM" || isAuthTouchDragging || isAuthTransitioning
                        ? "opacity-100"
                        : "opacity-0 pointer-events-none"
                    }`}
                  >
                    <div>
                      {claimSuccess ? (
                        <div className="text-center py-5 space-y-2.5">
                          <CheckCircle2 className="h-7 w-7 text-accent-green mx-auto" />
                          <h2 className="text-sm font-semibold text-ink">Account Claimed Successfully</h2>
                          <p className="text-xs text-ink-muted">
                            Your account has been initialized. Redirecting to student portal...
                          </p>
                        </div>
                      ) : (
                        <form onSubmit={handleClaimSubmit} className="space-y-4">
                          {claimError && (
                            <div className="flex items-start gap-2.5 rounded-md bg-canvas-soft border border-red-300/70 dark:border-red-500/30 p-3 text-xs text-red-700 dark:text-red-400">
                              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                              <span className="leading-relaxed font-medium">{claimError}</span>
                            </div>
                          )}

                          <div className="p-3 rounded-md bg-canvas-soft border border-hairline text-xs text-ink-muted leading-relaxed">
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

                          <button
                            id="btn-claim-submit"
                            type="submit"
                            disabled={claimLoading}
                            className="notion-btn-primary w-full h-10 text-xs sm:text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {claimLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                            ) : (
                              <GraduationCap className="h-4 w-4 shrink-0" />
                            )}
                            <span>{claimLoading ? "Claiming Account..." : "Claim Account & Sign In"}</span>
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: FORGOT PASSWORD REQUEST FORM */}
          {viewMode === "FORGOT_REQUEST" && (
            <form onSubmit={handleRequestReset} className="space-y-4">
              {forgotError && (
                <div className="flex items-start gap-2.5 rounded-md bg-canvas-soft border border-red-300/70 dark:border-red-500/30 p-3 text-xs text-red-700 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                  <span className="leading-relaxed font-medium">{forgotError}</span>
                </div>
              )}

              <div className="p-3 rounded-md bg-canvas-soft border border-hairline text-xs text-ink-muted leading-relaxed">
                {loginRole === "STAFF"
                  ? "Enter your registered Staff Email. We will dispatch a 6-digit verification code to your email, or escalate to the Root Administrator if unavailable."
                  : "Enter your Roll Number, Student ID, or email. If an email is linked, a 6-digit OTP code will be sent; otherwise a reset request will be sent to your Branch Manager for approval."}
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

              <button
                id="btn-request-reset"
                type="submit"
                disabled={forgotLoading}
                className="notion-btn-primary w-full h-10 text-xs sm:text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {forgotLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>{forgotLoading ? "Sending Request..." : "Continue Password Reset"}</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode("LOGIN")}
                className="notion-btn-utility w-full justify-center text-xs"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                <span>Back to Sign In</span>
              </button>
            </form>
          )}

          {/* VIEW: VERIFY OTP FORM */}
          {viewMode === "VERIFY_OTP" && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              {forgotError && (
                <div className="flex items-start gap-2.5 rounded-md bg-canvas-soft border border-red-300/70 dark:border-red-500/30 p-3 text-xs text-red-700 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                  <span className="leading-relaxed font-medium">{forgotError}</span>
                </div>
              )}

              <div className="p-3 rounded-md bg-canvas-soft border border-hairline text-xs space-y-1">
                <div className="font-semibold text-ink">Verification Code Sent</div>
                <p className="text-ink-muted leading-relaxed">
                  We sent a 6-digit code to <strong className="text-ink font-mono">{emailHint || "your registered email"}</strong>. It is valid for 10 minutes.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-secondary mb-1.5 text-center">
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
                  className="w-full text-center text-2xl font-bold tracking-[0.4em] font-mono py-2.5 px-3 rounded-xs border border-[#dddddd] dark:border-[#333333] bg-surface dark:bg-[#1a1a1a] text-ink focus:outline-none focus:border-primary focus:shadow-notion-card transition-all"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={otpCode.length !== 6 || forgotLoading}
                className="notion-btn-primary w-full h-10 text-xs sm:text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {forgotLoading && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
                <span>Verify Code &amp; Set Password</span>
              </button>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted pt-1">
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
                    className="text-ink-secondary hover:text-ink underline cursor-pointer transition-colors"
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
                  className="notion-btn-utility w-full justify-center text-xs"
                >
                  <ArrowLeft className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                  <span>Cancel and back to sign in</span>
                </button>
              </div>
            </form>
          )}

          {/* VIEW: AWAITING APPROVAL (LOADING STATE) */}
          {viewMode === "AWAITING_APPROVAL" && (
            <div className="text-center py-2 space-y-4">
              <div className="inline-flex h-12 w-12 rounded-lg bg-canvas-soft border border-hairline items-center justify-center text-ink-secondary mx-auto">
                <Clock className="h-5 w-5 text-primary animate-spin" />
              </div>

              <div className="space-y-1">
                <h3 className="notion-section-title text-sm sm:text-base text-ink">
                  {loginRole === "STAFF"
                    ? "Awaiting Root Administrator Authorization"
                    : "Awaiting Branch Manager Approval"}
                </h3>
                <p className="text-xs text-ink-muted">
                  {studentInfo?.name ? `${studentInfo.name} · ` : ""}
                  {studentInfo?.roll || forgotIdentifier}
                </p>
              </div>

              {/* Strict Non-Refresh Warning Banner */}
              <div className="p-3.5 rounded-md bg-canvas-soft border border-hairline text-ink-secondary text-xs text-left space-y-1.5">
                <div className="font-semibold flex items-center gap-2 text-ink">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span>Do Not Refresh or Leave</span>
                </div>
                <p className="leading-relaxed text-ink-muted">
                  Your request has been routed to {loginRole === "STAFF" ? "the Root Administrator" : "your Branch Manager"}. <strong className="font-semibold text-ink">Please do not refresh this page or go back</strong> while awaiting authorization.
                </p>
                <p className="text-[11px] text-ink-faint">
                  Once authorized, this form will instantly update and unlock your new password form.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 pt-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-green shrink-0" />
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
                  className="notion-btn-utility w-full justify-center text-xs"
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
                <div className="flex items-start gap-2.5 rounded-md bg-canvas-soft border border-red-300/70 dark:border-red-500/30 p-3 text-xs text-red-700 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                  <span className="leading-relaxed font-medium">{forgotError}</span>
                </div>
              )}

              <div className="p-3 rounded-md bg-canvas-soft border border-hairline text-ink-secondary text-xs flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent-green shrink-0" />
                <span>
                  Approval confirmed! Set a new password for{" "}
                  <strong className="font-semibold text-ink">{studentInfo?.name || studentInfo?.roll || "your account"}</strong>.
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

              <button
                id="btn-save-new-password"
                type="submit"
                disabled={forgotLoading}
                className="notion-btn-primary w-full h-10 text-xs sm:text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {forgotLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                ) : (
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>{forgotLoading ? "Saving Password..." : "Save New Password & Sign In"}</span>
              </button>
            </form>
          )}

          {deferredPrompt && !isStandalone && loginRole === "STUDENT" && (
            <div className="mt-4">
              <button
                type="button"
                onClick={handleInstallClick}
                id="btn-install-pwa"
                className="notion-btn-utility w-full justify-center text-xs"
              >
                <Download className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Install Student App on this Device</span>
              </button>
            </div>
          )}

          {/* Contextual Footer Navigation */}
          {viewMode === "LOGIN" && (
            <div className="mt-4 pt-3.5 border-t border-hairline text-center text-xs text-ink-muted">
              {loginRole === "STUDENT" ? (
                <>
                  Are you a student with a new admission ID?{" "}
                  <button
                    type="button"
                    onClick={() => switchLoginRole("CLAIM")}
                    className="font-medium text-primary hover:text-primary-active hover:underline cursor-pointer"
                  >
                    Claim Account &rarr;
                  </button>
                </>
              ) : loginRole === "STAFF" ? (
                <>
                  Are you a student accessing results?{" "}
                  <button
                    type="button"
                    onClick={() => switchLoginRole("STUDENT")}
                    className="font-medium text-primary hover:text-primary-active hover:underline cursor-pointer"
                  >
                    Student Portal Sign-In &rarr;
                  </button>
                </>
              ) : (
                <>
                  Already claimed your account?{" "}
                  <button
                    type="button"
                    onClick={() => switchLoginRole("STUDENT")}
                    className="font-medium text-primary hover:text-primary-active hover:underline cursor-pointer"
                  >
                    Sign In with Roll Number &rarr;
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LoginLoadingFallback() {
  return (
    <div className="flex min-h-[75vh] items-center justify-center py-6 sm:py-10 px-4">
      <div className="w-full max-w-[390px] notion-card p-5 sm:p-6 space-y-4">
        <Skeleton className="h-11 w-11 rounded-lg mx-auto" />
        <Skeleton className="h-6 w-44 rounded-md mx-auto" />
        <Skeleton className="h-4 w-60 rounded-xs mx-auto" />
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-xs" />
        <Skeleton className="h-10 w-full rounded-xs" />
        <Skeleton className="h-10 w-full rounded-md" />
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
