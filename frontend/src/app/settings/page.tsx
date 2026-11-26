"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  User,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  LogOut,
  Copy,
  Check,
  HardDrive,
  RefreshCw,
  Mail,
  GraduationCap,
  Building2,
  Hash,
  ArrowLeft,
  ShieldCheck,
  Unlink,
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, setStoredUser } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import {
  useAuthMe,
  useActiveSessions,
  useGoogleConnectionStatus,
  useGoogleDriveQuota,
} from "@/lib/queries";
import { useTenant } from "@/lib/TenantContext";
import { useToast } from "@/lib/ToastContext";
import { BadgePill, ButtonUtility, FeatureCard, Skeleton, useConfirm } from "@/components/ui";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";

function GoogleDriveIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 87.3 78" fill="none">
      <path
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z"
        fill="currentColor"
        opacity="0.8"
      />
      <path
        d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44C.4 49.9 0 51.45 0 53h27.5z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.15z"
        fill="currentColor"
        opacity="0.75"
      />
      <path
        d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"
        fill="currentColor"
      />
      <path
        d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.4 4.5-1.2z"
        fill="currentColor"
        opacity="0.85"
      />
      <path
        d="m73.55 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.8 25l16 27.7h27.5c0-1.55-.4-3.1-1.2-4.5z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}

function GoogleLogoIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
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
  );
}

function formatAuthMethodLabel(method: string): string {
  switch (method) {
    case "GOOGLE_GIS":
    case "GOOGLE_OAUTH":
      return "Google Sign-In";
    case "CLAIM_ACCOUNT":
      return "Claim ID";
    case "PASSWORD_RESET":
      return "Password Reset";
    default:
      return "Password";
  }
}

function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return "Recently";
  const ts = Date.parse(isoString);
  if (Number.isNaN(ts)) return "Recently";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 90) return "Active now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function formatShortDateTime(isoString?: string | null): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const {
    currentUser,
    selectedInstitute,
    selectedBranch,
    isMounted,
    isLoggingOut,
    logout,
    refreshTenancy,
  } = useTenant();

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const queriesEnabled = isMounted && !isLoggingOut && !signingOut;

  const {
    data: meData,
    isFetching: meFetching,
    refetch: refetchMe,
  } = useAuthMe(queriesEnabled);

  const {
    data: sessionsData,
    isLoading: sessionsInitialLoading,
    isFetching: sessionsFetching,
    refetch: refetchSessions,
  } = useActiveSessions(queriesEnabled);

  const {
    data: statusData,
    isLoading: statusInitialLoading,
    isFetching: statusFetching,
    refetch: refetchStatus,
  } = useGoogleConnectionStatus(queriesEnabled);

  const isDriveConnected = Boolean(statusData?.is_connected);
  const isStudent = (meData?.role || currentUser?.role) === "STUDENT";

  const {
    data: quotaData,
    isLoading: quotaInitialLoading,
    isFetching: quotaFetching,
    refetch: refetchQuota,
  } = useGoogleDriveQuota(queriesEnabled && isDriveConnected && isStudent);

  // Sync TanStack Query /api/auth/me updates into TenantContext & localStorage
  useEffect(() => {
    if (meData) {
      setStoredUser(meData);
      refreshTenancy(meData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meData]);

  const statusLoading = meFetching || statusFetching || quotaFetching || sessionsFetching;

  const refreshAccountStatus = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    await queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions() });
    await queryClient.invalidateQueries({ queryKey: queryKeys.oauth.all() });
    await Promise.all([refetchMe(), refetchStatus(), refetchSessions()]);
    if (isDriveConnected && isStudent) {
      await refetchQuota();
    }
  }, [queryClient, refetchMe, refetchStatus, refetchSessions, refetchQuota, isDriveConnected, isStudent]);

  // Handle OAuth return params (?byos=connected, ?google_linked=1, ?byos_error=...)
  useEffect(() => {
    if (!isMounted) return;

    const byos = searchParams.get("byos");
    const googleLinked = searchParams.get("google_linked");
    const byosError = searchParams.get("byos_error");
    const conflictEmail = searchParams.get("email");

    if (byos === "connected") {
      toast.success(
        "Google Drive connected! Your graded exam papers will automatically sync to My Drive / PaperGrade AI.",
        { title: "Google Drive Linked", duration: 5000 }
      );
      window.history.replaceState({}, document.title, window.location.pathname);
      refreshAccountStatus();
    } else if (googleLinked === "1") {
      toast.success(
        "Your Google account is now linked for 1-click Google Sign-In and profile avatar sync.",
        { title: "Google Account Linked", duration: 5000 }
      );
      window.history.replaceState({}, document.title, window.location.pathname);
      refreshAccountStatus();
    } else if (byosError) {
      if (byosError === "already_linked_elsewhere") {
        toast.error(
          `${conflictEmail || "This Google account"} is already linked to another PaperGrade account. Please use a different Google account.`,
          { title: "Account Conflict", duration: 6000 }
        );
      } else if (byosError === "email_not_verified") {
        toast.error("Google account email is not verified.", { title: "Verification Required" });
      } else if (byosError === "missing_refresh_token") {
        toast.warning("Google did not return offline Drive access. Please retry and approve all Drive checkboxes.", {
          title: "Permission Incomplete",
          duration: 6000,
        });
      } else {
        toast.error("Could not link Google account. Please try again.", { title: "Linking Failed" });
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast.success(`${label} copied to clipboard.`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleLinkGoogle = async (mode: "link" | "byos") => {
    try {
      setOauthConnecting(true);
      const res = await api.getGoogleAuthUrl(mode, undefined, "/settings");
      if (res?.authorization_url) {
        window.location.href = res.authorization_url;
      } else {
        setOauthConnecting(false);
        toast.error("Unable to initialize Google authentication.");
      }
    } catch (err: any) {
      setOauthConnecting(false);
      toast.error(err?.message || "Failed to initialize Google linking.");
    }
  };

  const handleDisconnectGoogle = async (unlinkIdentity: boolean) => {
    try {
      setDisconnecting(true);
      await api.disconnectGoogleConnection(unlinkIdentity);
      toast.success(
        unlinkIdentity
          ? "Google account unlinked from your profile."
          : "Google Drive backup connection paused.",
        { title: unlinkIdentity ? "Account Unlinked" : "Drive Disconnected" }
      );
      await refreshAccountStatus();
    } catch (err: any) {
      toast.error(err?.message || "Failed to disconnect Google connection.");
    } finally {
      setDisconnecting(false);
    }
  };

  const activeUser = meData || currentUser;
  const dashboardHref =
    activeUser?.role === "STUDENT"
      ? "/student/portal"
      : activeUser?.role === "ROOT_ADMIN"
      ? "/overview"
      : "/branch/batches";

  const rollNumber = activeUser?.roll_number || activeUser?.student?.roll_number;
  const studentIdNum =
    activeUser?.student_id_num || activeUser?.student?.student_id_num || activeUser?.student_id;

  const avatarUrl = statusData?.google_picture || activeUser?.google_picture;
  const linkedEmail = statusData?.google_email || activeUser?.google_email;
  const isGoogleLinked = Boolean(linkedEmail);

  const showStatusSkeleton = isMounted ? statusInitialLoading && !statusData : true;
  const showQuotaSkeleton =
    isStudent &&
    ((showStatusSkeleton && Boolean(activeUser?.google_email)) ||
      (isDriveConnected && quotaInitialLoading && !quotaData));

  const handleSignOut = () => {
    if (signingOut) return;
    setSigningOut(true);
    logout();
  };

  const handleRevokeSession = async (sessionId: string, deviceLabel: string, isCurrent: boolean) => {
    if (isCurrent) {
      handleSignOut();
      return;
    }
    try {
      setRevokingSessionId(sessionId);
      await api.revokeSession(sessionId);
      toast.success(`Signed out ${deviceLabel}.`, { title: "Session Revoked" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions() });
      await refetchSessions();
    } catch (err: any) {
      toast.error(err?.message || "Could not revoke session.", { title: "Revoke Failed" });
    } finally {
      setRevokingSessionId(null);
    }
  };

  const handleRevokeOtherSessions = async () => {
    const otherCount = (sessionsData?.sessions || []).filter((s) => !s.is_current).length;
    if (otherCount === 0) return;

    const ok = await confirm({
      title: "Sign Out Other Devices?",
      message: `This will immediately end ${otherCount} other active ${otherCount === 1 ? "session" : "sessions"} across browsers and PWAs while keeping this device signed in.`,
      confirmText: "Sign Out Others",
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!ok) return;

    try {
      setRevokingOthers(true);
      const res = await api.revokeOtherSessions();
      toast.success(
        `Ended ${res?.revoked_count ?? otherCount} other active ${(res?.revoked_count ?? otherCount) === 1 ? "session" : "sessions"}.`,
        { title: "Devices Signed Out" }
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions() });
      await refetchSessions();
    } catch (err: any) {
      toast.error(err?.message || "Failed to sign out other devices.");
    } finally {
      setRevokingOthers(false);
    }
  };

  const sessions = sessionsData?.sessions || [];
  const otherSessionCount = sessions.filter((s) => !s.is_current).length;

  const canChangeInitialPassword =
    currentUser &&
    currentUser.role !== "STUDENT" &&
    currentUser.role !== "ROOT_ADMIN" &&
    !currentUser.has_changed_password;

  const containerClass = isStudent
    ? "max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 pt-5 sm:pt-8 pb-16 space-y-5 sm:space-y-6 cascade-group"
    : "w-full space-y-5 sm:space-y-6 cascade-group";

  return (
    <div className={containerClass}>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-hairline">
        <div className="space-y-1">
          <Link
            href={dashboardHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to {isStudent ? "Student Portal" : "Console"}</span>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
            Account & Profile Settings
          </h1>
          <p className="text-xs text-ink-muted">
            Manage your identity details, Google Sign-In linking, Drive storage quota, and session.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshAccountStatus}
          disabled={statusLoading}
          className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-hairline bg-surface hover:bg-canvas-soft text-xs font-semibold text-ink-secondary transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${statusLoading ? "animate-spin" : ""}`} />
          <span>Refresh Status</span>
        </button>
      </div>

      {/* 1. Profile Identity Card */}
      <FeatureCard className="p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative h-16 w-16 shrink-0">
            <div className="h-full w-full rounded-full border border-hairline bg-canvas-soft flex items-center justify-center overflow-hidden shadow-xs">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={activeUser?.full_name || "User Avatar"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xl font-bold text-ink select-none uppercase">
                  {activeUser?.full_name ? activeUser.full_name.charAt(0) : <User className="h-6 w-6 text-ink-muted" />}
                </span>
              )}
            </div>
            {isDriveConnected && (
              <span
                className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-emerald-500 ring-[2.5px] ring-surface shadow-xs z-10"
                title="Google Drive Sync Active"
              />
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-ink truncate">
                {currentUser?.full_name || "Authenticated User"}
              </h2>
              <BadgePill
                label={
                  currentUser?.role === "ROOT_ADMIN"
                    ? "Root Admin"
                    : currentUser?.role === "INSTITUTE_DIRECTOR"
                    ? "Institute Director"
                    : currentUser?.role === "BRANCH_MANAGER"
                    ? "Branch Manager"
                    : "Student"
                }
                color={
                  currentUser?.role === "ROOT_ADMIN"
                    ? "purple"
                    : currentUser?.role === "INSTITUTE_DIRECTOR"
                    ? "indigo"
                    : currentUser?.role === "BRANCH_MANAGER"
                    ? "teal"
                    : "sky"
                }
              />
            </div>

            {currentUser?.email && (
              <p className="text-xs text-ink-secondary flex items-center gap-1.5 truncate">
                <Mail className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                <span>{currentUser.email}</span>
              </p>
            )}
          </div>
        </div>

        {/* Role-specific Identity Grid */}
        {isStudent ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-hairline">
            <div className="p-3.5 rounded-lg border border-hairline bg-canvas-soft/60 flex items-center justify-between gap-2">
              <div>
                <span className="text-[10.5px] font-medium text-ink-muted uppercase tracking-wider flex items-center gap-1">
                  <Hash className="h-3 w-3" /> Roll Number
                </span>
                <div className="text-sm font-bold text-ink font-mono mt-0.5">
                  {rollNumber || "Not Assigned"}
                </div>
              </div>
              {rollNumber && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(rollNumber, "Roll Number")}
                  className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer"
                  title="Copy roll number"
                >
                  {copiedField === "Roll Number" ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>

            <div className="p-3.5 rounded-lg border border-hairline bg-canvas-soft/60 flex items-center justify-between gap-2">
              <div>
                <span className="text-[10.5px] font-medium text-ink-muted uppercase tracking-wider flex items-center gap-1">
                  <GraduationCap className="h-3 w-3" /> Student ID
                </span>
                <div className="text-sm font-bold text-ink font-mono mt-0.5">
                  {studentIdNum || "Enrolled"}
                </div>
              </div>
              {studentIdNum && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(studentIdNum, "Student ID")}
                  className="p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer"
                  title="Copy student ID"
                >
                  {copiedField === "Student ID" ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-hairline">
            <div className="p-3.5 rounded-lg border border-hairline bg-canvas-soft/60">
              <span className="text-[10.5px] font-medium text-ink-muted uppercase tracking-wider flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Assigned Institute
              </span>
              <div className="text-xs font-bold text-ink mt-1 truncate">
                {selectedInstitute?.name || (currentUser?.role === "ROOT_ADMIN" ? "All Institutes (Global)" : "Assigned Institute")}
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-hairline bg-canvas-soft/60">
              <span className="text-[10.5px] font-medium text-ink-muted uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Active Branch Scope
              </span>
              <div className="text-xs font-bold text-ink mt-1 truncate">
                {selectedBranch?.name || (currentUser?.role === "ROOT_ADMIN" ? "Global Administrative Access" : "Assigned Branch")}
              </div>
            </div>
          </div>
        )}
      </FeatureCard>

      {/* 2. Google Account & Cloud Archival Card */}
      <FeatureCard className="p-4 sm:p-6 space-y-4">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isDriveConnected
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : isGoogleLinked
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "bg-canvas-soft text-ink-muted border border-hairline"
                }`}
              >
                {isStudent ? (
                  <GoogleDriveIcon className="h-5 w-5" />
                ) : (
                  <GoogleLogoIcon className="h-5 w-5" />
                )}
              </div>
              <h3 className="text-sm font-bold text-ink leading-snug">
                {isStudent ? "Google Account & Drive Sync" : "Google Account Integration"}
              </h3>
            </div>

            {showStatusSkeleton ? (
              <Skeleton className="h-6 w-24 rounded-full shrink-0" />
            ) : isDriveConnected ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0 whitespace-nowrap">
                <CheckCircle2 className="h-3 w-3" />
                Drive Active
              </span>
            ) : isGoogleLinked ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 shrink-0 whitespace-nowrap">
                <CheckCircle2 className="h-3 w-3" />
                Google Linked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-canvas-soft text-ink-muted border border-hairline shrink-0 whitespace-nowrap">
                Not Linked
              </span>
            )}
          </div>

          <p className="text-xs text-ink-muted leading-relaxed">
            {isStudent
              ? "Link your Google account for 1-click sign-in and automatic backup of evaluated exam scripts."
              : "Link your Google account for 1-click sign-in and syncing your profile photo across consoles."}
          </p>
        </div>

        {/* Linked Google Identity Box */}
        {showStatusSkeleton ? (
          <div className="p-3 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Skeleton className="h-7 w-7 rounded-full shrink-0" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3.5 w-44 max-w-full" />
                <Skeleton className="h-3 w-52 max-w-full" />
              </div>
            </div>
            <Skeleton className="h-7 w-24 rounded-md shrink-0" />
          </div>
        ) : isGoogleLinked ? (
          <div className="p-3 rounded-lg bg-canvas-soft border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full border border-hairline shrink-0 object-cover" />
              ) : (
                <GoogleLogoIcon className="h-4 w-4 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-ink truncate">{linkedEmail}</div>
                <div className="text-[11px] text-ink-muted leading-snug">
                  Linked Google Identity &bull; 1-Click Sign-In Enabled
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleDisconnectGoogle(true)}
              disabled={disconnecting}
              className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-hairline bg-surface hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-950/30 text-[11px] font-semibold text-ink-secondary transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              {disconnecting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Unlink className="h-3 w-3" />
              )}
              <span>{disconnecting ? "Unlinking..." : "Unlink Account"}</span>
            </button>
          </div>
        ) : null}

        {/* Drive Storage Quota Meter (TanStack Query + In-Place Skeleton + Smooth Mount Animation) */}
        {showQuotaSkeleton ? (
          <div className="space-y-2.5 p-3.5 rounded-lg bg-canvas-soft border border-hairline" aria-busy="true">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-3.5 w-28" />
            </div>
            <Skeleton className="h-2.5 w-full" rounded="full" />
          </div>
        ) : isDriveConnected && quotaData?.is_connected && typeof quotaData.usage_percent === "number" ? (
          (() => {
            const pgBytes = quotaData.papergrade_bytes || 0;
            const pgFiles = quotaData.papergrade_files_count || 0;
            const totalPct = Math.min(100, quotaData.usage_percent || 0);
            const rawOtherPct =
              typeof quotaData.other_percent === "number" ? quotaData.other_percent : totalPct;
            const rawPgPct =
              typeof quotaData.papergrade_percent === "number" ? quotaData.papergrade_percent : 0;

            // Ensure PaperGrade AI segment renders a clear visible partition whenever any PaperGrade files exist
            const pgBarPct =
              pgBytes > 0 ? Math.min(totalPct || 100, Math.max(2.5, rawPgPct)) : 0;
            const otherBarPct = Math.max(
              0,
              Math.min(100 - pgBarPct, pgBytes > 0 ? Math.max(0, totalPct - pgBarPct) : rawOtherPct)
            );
            const freeGb =
              quotaData.limit_gb != null && quotaData.usage_gb != null
                ? Math.max(0, quotaData.limit_gb - quotaData.usage_gb).toFixed(2)
                : null;
            const pgLabel =
              pgBytes >= 1024 ** 3
                ? `${(pgBytes / 1024 ** 3).toFixed(2)} GB`
                : `${quotaData.papergrade_mb ?? 0} MB`;

            return (
              <div className="space-y-2.5 p-3.5 rounded-lg bg-canvas-soft border border-hairline">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                  <span className="font-medium text-ink-secondary flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                    <span>Personal Google Drive Storage</span>
                  </span>
                  <span className="font-mono font-bold text-ink whitespace-nowrap">
                    {quotaData.usage_gb} GB /{" "}
                    {quotaData.limit_gb ? `${quotaData.limit_gb} GB` : "Unlimited"}{" "}
                    <span className="text-ink-muted font-normal">({quotaData.usage_percent}%)</span>
                  </span>
                </div>

                {/* Partitioned Stacked Progress Bar: Other Google Storage | PaperGrade AI */}
                <div
                  className="w-full h-2.5 rounded-full bg-ink/[0.08] dark:bg-white/[0.08] ring-1 ring-inset ring-hairline overflow-hidden flex items-stretch"
                  role="progressbar"
                  aria-valuenow={Math.round(quotaData.usage_percent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Personal Google Drive Storage Usage"
                >
                  {otherBarPct > 0 && (
                    <div
                      className={`h-full animate-quota-bar transition-[width] duration-500 ease-out ${
                        quotaData.is_critical
                          ? "bg-red-500"
                          : quotaData.is_near_full
                          ? "bg-amber-500"
                          : "bg-slate-400 dark:bg-slate-500"
                      }`}
                      style={{ width: `${otherBarPct}%` }}
                      title={`Other Google Storage: ${quotaData.other_gb ?? quotaData.usage_gb} GB`}
                    />
                  )}
                  {pgBarPct > 0 && (
                    <div
                      className={`h-full animate-quota-bar bg-primary transition-[width] duration-500 ease-out ${
                        otherBarPct > 0 ? "border-l border-surface" : ""
                      }`}
                      style={{ width: `${pgBarPct}%` }}
                      title={`PaperGrade AI Backups: ${pgLabel} (${pgFiles} files)`}
                    />
                  )}
                </div>

                {/* Color-coded Storage Partition Legend */}
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          quotaData.is_critical
                            ? "bg-red-500"
                            : quotaData.is_near_full
                            ? "bg-amber-500"
                            : "bg-slate-400 dark:bg-slate-500"
                        }`}
                      />
                      <span>
                        Other:{" "}
                        <strong className="font-mono text-ink-secondary">
                          {quotaData.other_gb ?? quotaData.usage_gb} GB
                        </strong>
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      <span>
                        PaperGrade:{" "}
                        <strong className="font-mono text-primary">{pgLabel}</strong>
                        <span className="opacity-75 ml-1">
                          ({pgFiles} {pgFiles === 1 ? "file" : "files"})
                        </span>
                      </span>
                    </span>
                  </div>
                  {freeGb !== null && (
                    <span className="font-mono text-[10.5px] text-ink-faint">
                      {freeGb} GB free
                    </span>
                  )}
                </div>

                {quotaData.is_near_full && (
                  <div
                    className={`flex items-start gap-2 p-2.5 rounded-md text-xs leading-snug ${
                      quotaData.is_critical
                        ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/40"
                        : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40"
                    }`}
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {quotaData.is_critical
                        ? "Your Google Drive storage is critically full (>95%). Please free up space so evaluated answer scripts can continue archiving."
                        : "Your Google Drive storage is nearly full (>85%). Free up some space for uninterrupted automatic backups."}
                    </span>
                  </div>
                )}
              </div>
            );
          })()
        ) : null}

        {/* Action Buttons for Linking / Disconnecting */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          {isStudent ? (
            !isDriveConnected ? (
              <button
                type="button"
                onClick={() => handleLinkGoogle("byos")}
                disabled={oauthConnecting}
                className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                <GoogleDriveIcon className="h-4 w-4" />
                <span>
                  {oauthConnecting
                    ? "Connecting to Google..."
                    : isGoogleLinked
                    ? "Connect Personal Google Drive"
                    : "Link Google Account & Connect Drive"}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleDisconnectGoogle(false)}
                disabled={disconnecting}
                className="inline-flex items-center justify-center gap-2 py-2 px-3.5 rounded-lg border border-hairline bg-surface hover:bg-canvas-soft text-xs font-semibold text-ink-secondary transition-colors disabled:opacity-50 cursor-pointer"
              >
                <span>Pause Drive Auto-Sync</span>
              </button>
            )
          ) : (
            !isGoogleLinked && (
              <button
                type="button"
                onClick={() => handleLinkGoogle("link")}
                disabled={oauthConnecting}
                className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-hairline bg-surface hover:bg-canvas-soft text-xs font-semibold text-ink shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                <GoogleLogoIcon className="h-4 w-4" />
                <span>{oauthConnecting ? "Connecting to Google..." : "Link Google Account"}</span>
              </button>
            )
          )}
        </div>
      </FeatureCard>

      {/* 3. Password Security */}
      <FeatureCard className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink">Password & Security</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              {canChangeInitialPassword
                ? "You are using your initial administrator-issued password. Update it now to secure your account."
                : "To reset a forgotten password, use Email OTP verification or administrator approval from the Sign-In page."}
            </p>
          </div>
          {canChangeInitialPassword && (
            <button
              type="button"
              onClick={() => setChangePasswordOpen(true)}
              className="self-start sm:self-center inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-hairline bg-canvas-soft hover:bg-canvas text-xs font-semibold text-ink transition-colors cursor-pointer shrink-0"
            >
              <KeyRound className="h-3.5 w-3.5 text-ink-muted" />
              <span>Set Personal Password</span>
            </button>
          )}
        </div>
      </FeatureCard>

      {/* 4. Active Sessions & Devices */}
      <FeatureCard className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-hairline">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-ink">Active Sessions & Devices</h3>
              {!sessionsInitialLoading && (
                <BadgePill
                  label={`${sessions.length || 1} Active`}
                  color="sky"
                />
              )}
            </div>
            <p className="text-xs text-ink-muted">
              Browsers and installed PWAs currently signed in to your account (valid up to 7 days).
            </p>
          </div>

          {otherSessionCount > 0 && (
            <ButtonUtility
              size="sm"
              variant="danger"
              onClick={handleRevokeOtherSessions}
              isLoading={revokingOthers}
              className="self-start sm:self-center shrink-0 text-xs"
            >
              {revokingOthers ? "Signing Out..." : "Sign Out Other Devices"}
            </ButtonUtility>
          )}
        </div>

        {sessionsInitialLoading && sessions.length === 0 ? (
          <div className="space-y-2.5">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-3.5 rounded-lg border border-hairline bg-canvas-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-surface border border-hairline flex items-center justify-center text-ink-muted shrink-0">
                <Monitor className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink">Current Browser Session</span>
                  <BadgePill label="This Device" color="green" />
                </div>
                <p className="text-[11px] text-ink-muted mt-0.5">
                  Authenticated session active on this device. Re-signing in upgrades this token with full device telemetry.
                </p>
              </div>
            </div>
            <ButtonUtility
              size="sm"
              variant="danger"
              onClick={handleSignOut}
              isLoading={signingOut}
              icon={<LogOut className="h-3.5 w-3.5" />}
              className="self-end sm:self-center shrink-0 text-xs"
            >
              {signingOut ? "Signing Out..." : "Sign Out"}
            </ButtonUtility>
          </div>
        ) : (
          <div className="divide-y divide-hairline rounded-lg border border-hairline overflow-hidden bg-surface">
            {sessions.map((sess) => {
              const lowerLabel = (sess.device_label || "").toLowerCase();
              const isPhone =
                lowerLabel.includes("iphone") || lowerLabel.includes("android");
              const isTablet = lowerLabel.includes("ipad");
              const DeviceIcon = isTablet
                ? Tablet
                : isPhone
                ? Smartphone
                : Monitor;

              const isRevokingThis = revokingSessionId === sess.id;

              return (
                <div
                  key={sess.id}
                  className="p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-canvas-soft/40 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div
                      className={`h-9 w-9 rounded-lg border flex items-center justify-center shrink-0 ${
                        sess.is_current
                          ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400"
                          : "bg-canvas-soft border-hairline text-ink-muted"
                      }`}
                    >
                      <DeviceIcon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-ink truncate">
                          {sess.device_label}
                        </span>
                        {sess.is_current && (
                          <BadgePill label="This Device" color="green" />
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-canvas-soft border border-hairline text-[10px] font-medium text-ink-secondary">
                          {formatAuthMethodLabel(sess.auth_method)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap text-[11px] text-ink-muted">
                        <span className="inline-flex items-center gap-1 font-medium text-ink-secondary">
                          {formatRelativeTime(sess.last_active_at)}
                        </span>
                        {sess.ip_address && (
                          <>
                            <span className="text-ink-faint">•</span>
                            <span className="inline-flex items-center gap-1 font-mono text-[10.5px]">
                              <Globe className="h-3 w-3 text-ink-faint" />
                              {sess.ip_address}
                            </span>
                          </>
                        )}
                        {sess.created_at && (
                          <>
                            <span className="text-ink-faint">•</span>
                            <span>Signed in {formatShortDateTime(sess.created_at)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="self-end sm:self-center shrink-0">
                    <ButtonUtility
                      size="sm"
                      variant={sess.is_current ? "danger" : "default"}
                      onClick={() =>
                        handleRevokeSession(sess.id, sess.device_label, sess.is_current)
                      }
                      isLoading={sess.is_current ? signingOut : isRevokingThis}
                      disabled={revokingOthers}
                      icon={sess.is_current ? <LogOut className="h-3.5 w-3.5" /> : undefined}
                      className="text-xs"
                    >
                      {sess.is_current
                        ? signingOut
                          ? "Signing Out..."
                          : "Sign Out"
                        : isRevokingThis
                        ? "Revoking..."
                        : "Revoke"}
                    </ButtonUtility>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </FeatureCard>

      {/* Initial Password Change Modal */}
      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        onSuccess={() => {
          try {
            if (currentUser) {
              const updated = { ...currentUser, has_changed_password: 1 };
              setStoredUser(updated);
              refreshTenancy(updated);
            }
          } catch {}
        }}
        userEmail={currentUser?.email}
      />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
          <div className="h-40 rounded-xl bg-canvas-soft border border-hairline animate-pulse" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
