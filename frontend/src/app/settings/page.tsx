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
} from "lucide-react";
import { api, setStoredUser } from "@/lib/api";
import { useTenant } from "@/lib/TenantContext";
import { useToast } from "@/lib/ToastContext";
import { BadgePill, FeatureCard } from "@/components/ui";
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

function SettingsContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const {
    currentUser,
    selectedInstitute,
    selectedBranch,
    isMounted,
    logout,
    refreshTenancy,
  } = useTenant();

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState<{
    is_connected: boolean;
    google_email?: string;
    google_picture?: string;
    last_sync_at?: string;
    error_state?: string;
  }>({
    is_connected: false,
    google_email: currentUser?.google_email,
    google_picture: currentUser?.google_picture,
  });

  const [quotaData, setQuotaData] = useState<{
    is_connected: boolean;
    limit_bytes?: number;
    usage_bytes?: number;
    limit_gb?: number | null;
    usage_gb?: number;
    usage_percent?: number;
    is_near_full?: boolean;
    is_critical?: boolean;
  } | null>(null);

  const loadAccountData = React.useCallback(async () => {
    setStatusLoading(true);
    try {
      const [me, status] = await Promise.all([
        api.getMe(true).catch(() => null),
        api.getGoogleConnectionStatus().catch(() => null),
      ]);

      if (me) {
        setStoredUser(me);
        refreshTenancy(me);
      }

      if (status) {
        const connected = Boolean(status.is_connected);
        setConnectionStatus({
          is_connected: connected,
          google_email: status.google_email || me?.google_email || currentUser?.google_email,
          google_picture: status.google_picture || me?.google_picture || currentUser?.google_picture,
          last_sync_at: status.last_sync_at,
          error_state: status.error_state,
        });

        if (connected) {
          const q = await api.getGoogleDriveQuota().catch(() => null);
          if (q?.is_connected) {
            setQuotaData(q);
          }
        } else {
          setQuotaData(null);
        }
      }
    } finally {
      setStatusLoading(false);
    }
  }, [currentUser?.google_email, currentUser?.google_picture, refreshTenancy]);

  // Handle OAuth return params (?byos=connected, ?google_linked=1, ?byos_error=...) & load status
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
    } else if (googleLinked === "1") {
      toast.success(
        "Your Google account is now linked for 1-click Google Sign-In and profile avatar sync.",
        { title: "Google Account Linked", duration: 5000 }
      );
      window.history.replaceState({}, document.title, window.location.pathname);
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

    loadAccountData();
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
      await loadAccountData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to disconnect Google connection.");
    } finally {
      setDisconnecting(false);
    }
  };

  const isStudent = currentUser?.role === "STUDENT";
  const dashboardHref =
    currentUser?.role === "STUDENT"
      ? "/student/portal"
      : currentUser?.role === "ROOT_ADMIN"
      ? "/overview"
      : "/branch/batches";

  const rollNumber = currentUser?.roll_number || currentUser?.student?.roll_number;
  const studentIdNum =
    currentUser?.student_id_num || currentUser?.student?.student_id_num || currentUser?.student_id;

  const avatarUrl = connectionStatus.google_picture || currentUser?.google_picture;
  const linkedEmail = connectionStatus.google_email || currentUser?.google_email;
  const isGoogleLinked = Boolean(linkedEmail);
  const isDriveConnected = connectionStatus.is_connected;

  const handleSignOut = () => {
    if (signingOut) return;
    setSigningOut(true);
    logout();
  };

  const canChangeInitialPassword =
    currentUser &&
    currentUser.role !== "STUDENT" &&
    currentUser.role !== "ROOT_ADMIN" &&
    !currentUser.has_changed_password;

  const containerClass = isStudent
    ? "max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 pt-5 sm:pt-8 pb-16 space-y-5 sm:space-y-6"
    : "w-full space-y-5 sm:space-y-6";

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
          onClick={loadAccountData}
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
          <div className="relative h-16 w-16 rounded-full border border-hairline bg-canvas-soft flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={currentUser?.full_name || "User Avatar"}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xl font-bold text-ink select-none uppercase">
                {currentUser?.full_name ? currentUser.full_name.charAt(0) : <User className="h-6 w-6 text-ink-muted" />}
              </span>
            )}
            {isDriveConnected && (
              <span
                className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-surface"
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

            {isDriveConnected ? (
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
        {isGoogleLinked && (
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
        )}

        {/* Drive Storage Quota Meter (Shown when Drive BYOS is active) */}
        {isDriveConnected && quotaData && typeof quotaData.usage_percent === "number" && (
          <div className="space-y-2 p-3.5 rounded-lg bg-canvas-soft border border-hairline">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-ink-secondary flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-ink-muted" />
                Personal Google Drive Storage
              </span>
              <span className="font-mono font-bold text-ink">
                {quotaData.usage_gb} GB / {quotaData.limit_gb ? `${quotaData.limit_gb} GB` : "Unlimited"}{" "}
                <span className="text-ink-muted">({quotaData.usage_percent}%)</span>
              </span>
            </div>

            <div className="w-full h-2.5 rounded-full bg-surface border border-hairline overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  quotaData.is_critical
                    ? "bg-red-500"
                    : quotaData.is_near_full
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, Math.max(3, quotaData.usage_percent))}%` }}
              />
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
        )}

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

      {/* 3. Security & Session Actions */}
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

        <div className="pt-4 border-t border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-ink">Active Session</h4>
            <p className="text-[11px] text-ink-muted">
              Sign out from this browser or PWA installation.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/70 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100/80 dark:hover:bg-red-900/30 text-xs font-semibold transition-all cursor-pointer shrink-0 disabled:opacity-60 disabled:cursor-wait"
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            <span>{signingOut ? "Signing Out..." : "Sign Out"}</span>
          </button>
        </div>
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
