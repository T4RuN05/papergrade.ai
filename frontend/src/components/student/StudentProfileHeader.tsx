"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useToast } from "@/lib/ToastContext";

function GoogleDriveIcon({ className = "w-3.5 h-3.5 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.6 66.85L10.45 73.5C11.25 74.9 12.4 76 13.75 76.8L27.5 53H0C0 54.55 0.4 56.1 1.2 57.55L6.6 66.85Z" fill="currentColor" fillOpacity="0.7" />
      <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5C0.4 49.95 0 51.5 0 53.05H27.5L43.65 25Z" fill="currentColor" fillOpacity="0.7" />
      <path d="M73.55 76.8C74.9 76 76.05 74.9 76.85 73.5L86.1 57.55C86.9 56.1 87.3 54.55 87.3 53H59.8L73.55 76.8Z" fill="currentColor" fillOpacity="0.95" />
      <path d="M43.65 25L57.4 1.2C56.05 0.4 54.5 0 52.9 0H34.4C32.8 0 31.25 0.45 29.9 1.2L43.65 25Z" fill="currentColor" fillOpacity="0.95" />
      <path d="M59.8 53H27.5L13.75 76.8C15.1 77.6 16.65 78 18.25 78H69.05C70.65 78 72.2 77.55 73.55 76.8L59.8 53Z" fill="currentColor" fillOpacity="0.45" />
      <path d="M73.55 26.5L60.85 4.5C60.05 3.1 58.9 2 57.55 1.2L43.8 25L60.05 53H87.3C87.3 51.45 86.9 49.9 86.1 48.5L73.55 26.5Z" fill="currentColor" fillOpacity="0.95" />
    </svg>
  );
}

export interface StudentProfileHeaderProps {
  user: {
    full_name?: string;
    roll_number?: string;
    student?: {
      roll_number?: string;
    };
  } | null;
  onReportIssueClick: () => void;
  isLoading?: boolean;
}

export const StudentProfileHeader = React.memo(function StudentProfileHeader({
  user,
  onReportIssueClick,
  isLoading = false,
}: StudentProfileHeaderProps) {
  const { toast } = useToast();
  const rollNumber = user?.roll_number || user?.student?.roll_number || "Enrolled";

  const [byosState, setByosState] = useState<{
    isConnected: boolean;
    googleEmail?: string;
    loading: boolean;
  }>({
    isConnected: false,
    loading: true,
  });

  useEffect(() => {
    // 1. Popup bridge: if Google callback returned into this window as a popup
    if (typeof window !== "undefined" && window.opener && window.opener !== window) {
      const params = new URLSearchParams(window.location.search);
      const byos = params.get("byos");
      const byosError = params.get("byos_error");
      const conflictEmail = params.get("email");

      if (byos === "connected") {
        try {
          window.opener.postMessage({ type: "PG_BYOS_SUCCESS" }, window.location.origin);
        } catch {}
        window.close();
        return;
      }
      if (byosError) {
        try {
          window.opener.postMessage(
            { type: "PG_BYOS_ERROR", error: byosError, email: conflictEmail },
            window.location.origin
          );
        } catch {}
        window.close();
        return;
      }
    }

    // 2. Parent listener: handle popup completion messages
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "PG_BYOS_SUCCESS") {
        toast.success(
          "Google Drive successfully linked! Your graded exam papers will now be automatically archived to My Drive/PaperGrade AI.",
          { title: "Drive Connected", duration: 5000 }
        );
        api.getGoogleConnectionStatus().then((status) => {
          setByosState({
            isConnected: Boolean(status?.is_connected),
            googleEmail: status?.google_email,
            loading: false,
          });
        });
      } else if (event.data?.type === "PG_BYOS_ERROR") {
        setByosState((prev) => ({ ...prev, loading: false }));
        const em = event.data?.email || "This account";
        if (event.data?.error === "already_linked_elsewhere") {
          toast.error(`${em} is already linked to another account in PaperGrade AI. Please use a different Google account.`, {
            title: "Account Conflict",
            duration: 6000,
          });
        } else {
          toast.error("Could not link Google Drive. Please try again.", {
            title: "Connection Failed",
          });
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("message", handleMessage);
    }

    // 3. Fallback for full page redirects
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("byos") === "connected") {
        toast.success(
          "Google Drive successfully linked! Your graded exam papers will now be automatically archived to My Drive/PaperGrade AI.",
          { title: "Drive Connected", duration: 5000 }
        );
        // Clean URL parameter
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      } else if (params.get("byos_error")) {
        const err = params.get("byos_error");
        const conflictEmail = params.get("email");
        if (err === "already_linked_elsewhere") {
          toast.error(`${conflictEmail || "This account"} is already linked to another user account. Please use a different Google account.`, {
            title: "Account Conflict",
            duration: 6000,
          });
        }
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }
    }

    let isMounted = true;
    api
      .getGoogleConnectionStatus()
      .then((status) => {
        if (isMounted) {
          setByosState({
            isConnected: Boolean(status?.is_connected),
            googleEmail: status?.google_email,
            loading: false,
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setByosState((prev) => ({ ...prev, loading: false }));
        }
      });

    return () => {
      isMounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("message", handleMessage);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnectDrive = async () => {
    try {
      setByosState((prev) => ({ ...prev, loading: true }));
      const res = await api.getGoogleAuthUrl("byos", undefined, "/student/portal");
      if (res?.authorization_url) {
        window.location.href = res.authorization_url;
      } else {
        setByosState((prev) => ({ ...prev, loading: false }));
        toast.error("Unable to obtain Google Drive connection URL.", { title: "Connection Failed" });
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not connect to Google Drive. Please try again.", {
        title: "Connection Failed",
      });
      setByosState((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-3 border-b border-hairline">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {isLoading && !user ? (
            <Skeleton className="h-7 w-48 rounded-md" />
          ) : (
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              Welcome, {user?.full_name || "Student"}
            </h1>
          )}
        </div>
        <div className="text-xs text-ink-muted mt-1 leading-normal flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {isLoading && !user ? (
            <Skeleton className="h-4 w-32 rounded" />
          ) : (
            <>
              <span className="whitespace-nowrap">
                Roll No: <strong className="text-ink font-medium font-mono">{rollNumber}</strong>
              </span>
              <span className="text-ink-faint hidden xs:inline">•</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {/* Google Drive Status / Connect Pill */}
        {byosState.isConnected ? (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-2xs select-none"
            title={`Connected to Google Drive (${byosState.googleEmail || "Active"})`}
          >
            <GoogleDriveIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[130px] sm:max-w-none">
              Gdrive Linked
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleConnectDrive}
            disabled={byosState.loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold btn-glass-utility transition-all cursor-pointer shadow-2xs disabled:opacity-50"
            title="Link your Google Drive for automatic result paper archiving"
          >
            {byosState.loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            ) : (
              <GoogleDriveIcon className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{byosState.loading ? "Linking..." : "Link Gdrive"}</span>
          </button>
        )}

        {/* Report Issue Button */}
        <button
          type="button"
          onClick={onReportIssueClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold btn-glass-utility transition-all cursor-pointer shadow-2xs"
          title="Report a technical issue with the portal"
        >
          <AlertTriangle className="h-3.5 w-3.5 text-primary" />
          <span>Report Issue</span>
        </button>
      </div>
    </div>
  );
});
