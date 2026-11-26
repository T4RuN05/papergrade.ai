"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  LogOut,
  ExternalLink,
  Copy,
  Check,
  HardDrive,
  RefreshCw,
  Mail,
  GraduationCap,
  Building,
  Hash,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/ToastContext";
import { BadgePill } from "./ui";

interface UserSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  onLogout: () => void;
  onChangePassword?: () => void;
}

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

export function UserSettingsDrawer({
  isOpen,
  onClose,
  currentUser,
  onLogout,
  onChangePassword,
}: UserSettingsDrawerProps) {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    is_connected: boolean;
    google_email?: string;
    google_picture?: string;
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

  // Fetch live Google Drive & Identity status when drawer opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setStatusLoading(true);

    api
      .getGoogleConnectionStatus()
      .then(async (status) => {
        if (!isMounted) return;
        const connected = Boolean(status?.is_connected);
        setConnectionStatus({
          is_connected: connected,
          google_email: status?.google_email || currentUser?.google_email,
          google_picture: status?.google_picture || currentUser?.google_picture,
        });

        if (connected) {
          try {
            const q = await api.getGoogleDriveQuota();
            if (isMounted && q?.is_connected) {
              setQuotaData(q);
            }
          } catch {}
        }
      })
      .catch((e) => {
        console.warn("Failed to check Google connection status:", e);
      })
      .finally(() => {
        if (isMounted) setStatusLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentUser]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast.success(`${label} copied to clipboard.`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleLinkGoogle = async () => {
    try {
      setDriveConnecting(true);
      const res = await api.getGoogleAuthUrl("byos");
      if (res?.authorization_url) {
        window.location.href = res.authorization_url;
      } else {
        setDriveConnecting(false);
        toast.error("Unable to initialize Google connection. Please try again.");
      }
    } catch (err: any) {
      setDriveConnecting(false);
      toast.error(err?.message || "Failed to initialize Google connection.");
    }
  };

  if (!isOpen) return null;

  const isStudent = currentUser?.role === "STUDENT";
  const rollNumber = currentUser?.roll_number || currentUser?.student?.roll_number;
  const studentIdNum = currentUser?.student_id_num || currentUser?.student?.student_id_num || currentUser?.student_id;
  const isGoogleLinked = Boolean(connectionStatus.google_email || currentUser?.google_email);
  const isDriveConnected = connectionStatus.is_connected;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside className="fixed inset-y-0 right-0 w-full max-w-md h-full h-[100dvh] bg-surface shadow-2xl border-l border-hairline flex flex-col transition-transform duration-300 ease-in-out transform translate-x-0 z-10">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-hairline bg-surface flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <User className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-ink tracking-tight">Account & Settings</h2>
              <p className="text-[11px] text-ink-muted">Profile identity, Google Drive sync, and preferences</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg text-ink-muted hover:text-ink hover:bg-canvas-soft transition-colors flex items-center justify-center cursor-pointer"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* User Profile Card */}
          <div className="p-4 rounded-xl border border-hairline bg-canvas-soft/60 space-y-3.5">
            <div className="flex items-center gap-3.5">
              <div className="relative h-13 w-13 rounded-full border border-hairline bg-surface flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                {currentUser?.google_picture ? (
                  <img
                    src={currentUser.google_picture}
                    alt={currentUser?.full_name || "User Avatar"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-base font-bold text-ink select-none uppercase">
                    {currentUser?.full_name ? currentUser.full_name.charAt(0) : "U"}
                  </span>
                )}
                {isDriveConnected && (
                  <span
                    className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-surface"
                    title="Google Drive Active"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-ink truncate">
                    {currentUser?.full_name || "Authenticated User"}
                  </h3>
                  <BadgePill
                    label={
                      currentUser?.role === "ROOT_ADMIN"
                        ? "Admin"
                        : currentUser?.role === "INSTITUTE_DIRECTOR"
                        ? "Director"
                        : currentUser?.role === "BRANCH_MANAGER"
                        ? "Branch Mgr"
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
                  <p className="text-xs text-ink-secondary truncate mt-0.5 flex items-center gap-1">
                    <Mail className="h-3 w-3 text-ink-muted shrink-0" />
                    {currentUser.email}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Student Identity Section (If Student) */}
          {isStudent && (
            <div className="space-y-2">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-ink-muted">
                Student Identification
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                {/* Roll Number Box */}
                <div className="p-3 rounded-lg border border-hairline bg-surface flex flex-col justify-between">
                  <span className="text-[10px] font-medium text-ink-muted uppercase tracking-wider flex items-center gap-1">
                    <Hash className="h-3 w-3" /> Roll Number
                  </span>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs font-bold text-ink font-mono truncate">
                      {rollNumber || "Not Assigned"}
                    </span>
                    {rollNumber && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(rollNumber, "Roll Number")}
                        className="text-ink-muted hover:text-ink transition-colors p-1"
                        title="Copy roll number"
                      >
                        {copiedField === "Roll Number" ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Student ID Box */}
                <div className="p-3 rounded-lg border border-hairline bg-surface flex flex-col justify-between">
                  <span className="text-[10px] font-medium text-ink-muted uppercase tracking-wider flex items-center gap-1">
                    <GraduationCap className="h-3 w-3" /> Student ID
                  </span>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs font-bold text-ink font-mono truncate">
                      {studentIdNum || "Enrolled"}
                    </span>
                    {studentIdNum && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(studentIdNum, "Student ID")}
                        className="text-ink-muted hover:text-ink transition-colors p-1"
                        title="Copy student ID"
                      >
                        {copiedField === "Student ID" ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Google Account & Personal Drive Archival */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-ink-muted">
                Google Account & Cloud Archival
              </span>
              {statusLoading && <RefreshCw className="h-3 w-3 text-ink-muted animate-spin" />}
            </div>

            <div className="p-4 rounded-xl border border-hairline bg-surface space-y-3.5">
              {/* Status Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isDriveConnected
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : isGoogleLinked
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        : "bg-canvas-soft text-ink-muted border border-hairline"
                    }`}
                  >
                    <GoogleDriveIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-ink">Personal Google Drive</h4>
                    <p className="text-[11px] text-ink-muted">
                      {isDriveConnected
                        ? "Connected for automatic exam backups"
                        : isGoogleLinked
                        ? "Google account linked"
                        : "Not connected"}
                    </p>
                  </div>
                </div>

                {isDriveConnected ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                    Connected
                  </span>
                ) : isGoogleLinked ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                    Linked
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-canvas-soft text-ink-muted border border-hairline">
                    Unlinked
                  </span>
                )}
              </div>

              {/* Linked Email Display */}
              {isGoogleLinked ? (
                <div className="p-2.5 rounded-lg bg-canvas-soft/80 border border-hairline flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <GoogleLogoIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-medium text-ink truncate">
                      {connectionStatus.google_email || currentUser?.google_email}
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                    Active
                  </span>
                </div>
              ) : null}

              {/* Google Drive Storage Meter */}
              {isDriveConnected && quotaData && typeof quotaData.usage_percent === "number" ? (
                <div className="space-y-1.5 p-3 rounded-lg bg-canvas-soft border border-hairline">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-medium text-ink-secondary flex items-center gap-1.5">
                      <HardDrive className="h-3 w-3 text-ink-muted" />
                      Drive Storage
                    </span>
                    <span className="font-mono text-[11px] font-bold text-ink">
                      {quotaData.usage_gb} GB / {quotaData.limit_gb ? `${quotaData.limit_gb} GB` : "Unlimited"}{" "}
                      <span className="text-ink-muted">({quotaData.usage_percent}%)</span>
                    </span>
                  </div>

                  {/* Visual Storage Bar */}
                  <div className="w-full h-2 rounded-full bg-surface border border-hairline overflow-hidden">
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

                  {/* Warning Banner if storage near full or critical */}
                  {quotaData.is_near_full && (
                    <div
                      className={`mt-2 flex items-start gap-2 p-2 rounded-md text-[11px] leading-tight ${
                        quotaData.is_critical
                          ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/40"
                          : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40"
                      }`}
                    >
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        {quotaData.is_critical
                          ? "Google Drive storage is critically full (>95%). Please free up space immediately so new graded papers can archive."
                          : "Google Drive storage is nearly full (>85%). We recommend freeing up space to ensure smooth automatic paper archiving."}
                      </span>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Informative Description */}
              <p className="text-[11px] text-ink-secondary leading-relaxed">
                {isDriveConnected
                  ? "All your evaluated answer scripts and official report cards are automatically archived into your personal Google Drive at 'My Drive / PaperGrade AI'."
                  : "Link your Google Account to enable 1-click Google Sign-In and automatically backup your graded answer scripts into your personal Google Drive."}
              </p>

              {/* Action Button */}
              {!isDriveConnected && (
                <button
                  type="button"
                  onClick={handleLinkGoogle}
                  disabled={driveConnecting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <GoogleDriveIcon className="h-4 w-4" />
                  {driveConnecting
                    ? "Redirecting to Google..."
                    : isGoogleLinked
                    ? "Activate Google Drive Sync"
                    : "Link Google Account & Drive"}
                </button>
              )}
            </div>
          </div>

          {/* Account Security Section */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold tracking-wider uppercase text-ink-muted">
              Security & Credentials
            </span>
            <div className="p-4 rounded-xl border border-hairline bg-surface space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-ink">Account Password</h4>
                  <p className="text-[11px] text-ink-muted">Keep your account secure with regular updates</p>
                </div>
                {onChangePassword && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onChangePassword();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-hairline bg-canvas-soft hover:bg-canvas text-xs font-semibold text-ink transition-colors cursor-pointer"
                  >
                    <KeyRound className="h-3.5 w-3.5 text-ink-muted" />
                    Change
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer with Sign Out */}
        <div className="p-4 border-t border-hairline bg-surface space-y-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100/60 dark:hover:bg-red-900/30 text-xs font-semibold transition-all cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign Out of PaperGrade
          </button>
          <div className="text-center text-[10px] text-ink-muted">
            PaperGrade AI &bull; Version 2.0 Secure Session
          </div>
        </div>
      </aside>
    </div>
  );
}

export default UserSettingsDrawer;
