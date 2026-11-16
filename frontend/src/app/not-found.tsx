"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Home, LayoutDashboard, FileQuestion, Sparkles } from "lucide-react";
import { getStoredUser } from "@/lib/api";
import { ButtonPrimary, ButtonUtility } from "@/components/ui";

export default function NotFound() {
  const [dashboardHref, setDashboardHref] = useState<string>("/");
  const [dashboardLabel, setDashboardLabel] = useState<string>("Take Me Home");

  useEffect(() => {
    try {
      const user = getStoredUser();
      if (user && user.role) {
        switch (user.role) {
          case "STUDENT":
            setDashboardHref("/student/portal");
            setDashboardLabel("Back to Student Portal");
            break;
          case "BRANCH_MANAGER":
            setDashboardHref("/branch/batches");
            setDashboardLabel("Back to Branch Batches");
            break;
          case "INSTITUTE_DIRECTOR":
            setDashboardHref("/branch/batches");
            setDashboardLabel("Back to Director Desk");
            break;
          case "ROOT_ADMIN":
            setDashboardHref("/overview");
            setDashboardLabel("Back to Admin Overview");
            break;
          default:
            setDashboardHref("/overview");
            setDashboardLabel("Back to Dashboard");
            break;
        }
      }
    } catch {
      // Fallback to home if storage is inaccessible
    }
  }, []);

  return (
    <main className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-16 text-center select-none">
      {/* Background radial ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center -z-10">
        <div className="w-[32rem] h-[32rem] rounded-full bg-gradient-to-tr from-primary/10 via-purple-500/5 to-transparent blur-3xl opacity-70" />
      </div>

      <div className="max-w-xl mx-auto flex flex-col items-center">
        {/* Subtle Academic Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 mb-6 shadow-sm">
          <FileQuestion className="w-3.5 h-3.5" />
          <span>404 • PAGE NOT FOUND</span>
        </div>

        {/* Giant 404 Typography with Grace Mark Badge */}
        <div className="relative mb-3">
          <h1 className="text-8xl sm:text-9xl font-black tracking-tight text-ink drop-shadow-sm font-mono">
            4<span className="text-primary">0</span>4
          </h1>
          <span className="absolute -top-1 -right-6 sm:-right-8 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono tracking-wide bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 shadow-sm rotate-6">
            <Sparkles className="w-3 h-3" />
            +0 Grace Marks
          </span>
        </div>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight mb-3">
          404: No Negative Marking Here
        </h2>

        {/* Subtitle */}
        <p className="text-sm sm:text-base text-ink-muted leading-relaxed max-w-md mx-auto mb-8">
          The page you’re looking for doesn&apos;t exist, but don&apos;t worry—zero marks deducted.
          Let&apos;s head back to the exam hall.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <ButtonPrimary href={dashboardHref} size="lg" className="w-full sm:w-auto gap-2">
            <LayoutDashboard className="w-4 h-4" />
            <span>{dashboardLabel}</span>
          </ButtonPrimary>

          <ButtonUtility href="/" size="lg" className="w-full sm:w-auto gap-2">
            <Home className="w-4 h-4" />
            <span>Return to Home</span>
          </ButtonUtility>
        </div>

        {/* Subtle Assistance Footnote */}
        <div className="mt-12 text-xs text-ink-faint flex items-center gap-1.5">
          <span>Looking for a specific exam or submission?</span>
          <Link
            href={dashboardHref}
            className="text-primary hover:underline font-medium inline-flex items-center gap-0.5"
          >
            Check your dashboard
            <ArrowLeft className="w-3 h-3 rotate-180" />
          </Link>
        </div>
      </div>
    </main>
  );
}
