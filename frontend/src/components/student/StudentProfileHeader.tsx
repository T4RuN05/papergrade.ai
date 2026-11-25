"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, HardDrive, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useToast } from "@/lib/ToastContext";

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
    // Check if coming back from OAuth redirect
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
    };
  }, [toast]);

  const handleConnectDrive = async () => {
    try {
      setByosState((prev) => ({ ...prev, loading: true }));
      const res = await api.getGoogleAuthUrl("byos");
      if (res?.authorization_url) {
        window.location.href = res.authorization_url;
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
        {/* Google Drive BYOS Status / Connect Pill */}
        {byosState.isConnected ? (
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs"
            title={`Connected to Google Drive (${byosState.googleEmail || "Active"})`}
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-mono text-[11px] truncate max-w-[130px] sm:max-w-none">
              Drive Synced
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleConnectDrive}
            disabled={byosState.loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold btn-glass-utility transition-all cursor-pointer shadow-2xs disabled:opacity-50"
            title="Link personal Google Drive for immutable result paper archiving"
          >
            <HardDrive className="h-3.5 w-3.5 text-primary" />
            <span>{byosState.loading ? "Connecting..." : "Connect Drive (BYOS)"}</span>
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
