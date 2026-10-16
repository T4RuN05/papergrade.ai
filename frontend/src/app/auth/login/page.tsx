"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AlertCircle, ShieldCheck, Smartphone, ArrowRight, Download } from "lucide-react";
import { api } from "@/lib/api";
import { ButtonPrimary, FormInput, FeatureCard } from "@/components/ui";
import { useToast } from "@/lib/ToastContext";
import { useTenant } from "@/lib/TenantContext";
import { startNavigationProgress } from "@/components/NavigationProgressBar";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { refreshTenancy } = useTenant();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

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

  const handleInstallClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await api.login({
        email: email.trim(),
        password: password,
      });

      const enteredEmail = email.trim();
      let roleTitle = "Welcome Administrator";
      let dest = "/overview";

      if (user.role === "STUDENT") {
        roleTitle = "Welcome Student";
        dest = "/student/portal";
      } else if (user.role === "BRANCH_MANAGER") {
        roleTitle = "Welcome Branch Manager";
        dest = "/branch/batches";
      }

      const welcomeMsg = `Signed in as ${user.full_name || enteredEmail}.`;

      // 1. Show immediate toast on the screen (persists seamlessly across client routing)
      toast.success(welcomeMsg, { title: roleTitle, duration: 4500 });

      // 2. Refresh tenancy in the background without blocking the UI redirect
      refreshTenancy().catch(() => {});

      // 3. Smooth, immediate client-side SPA navigation
      startNavigationProgress();
      router.push(dest);
    } catch (err: any) {
      let msg = "Failed to sign in. Please verify your credentials.";
      if (typeof err === "string") {
        msg = err;
      } else if (err?.message && typeof err.message === "string") {
        msg = err.message;
      }
      if (msg === "[object Object]") {
        msg = "Invalid email, roll number, or password";
      }
      setError(msg);
      toast.error(msg, { title: "Authentication Failed" });
    } finally {
      setLoading(false);
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
          <h1 className="text-xl font-bold tracking-tight text-ink">Sign in to PaperGrade</h1>
          <p className="text-xs text-ink-muted">
            Enter your email, roll number, or student ID to continue.
          </p>
        </div>

        <FeatureCard className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2.5 rounded-md bg-red-50/90 border border-red-200/90 p-3 text-xs text-red-700 animate-in fade-in duration-150">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                <span className="leading-relaxed font-medium">{error}</span>
              </div>
            )}

            <FormInput
              label="Email, Roll Number, or Student ID"
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. user@institute.edu or ROLL-101"
            />

            <FormInput
              label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
            />

            <ButtonPrimary
              id="btn-login-submit"
              type="submit"
              className="w-full"
              isLoading={loading}
            >
              Sign In
            </ButtonPrimary>
          </form>

          {/* Student PWA Web App Section */}
          <div className="relative my-4 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-hairline" />
            </div>
            <span className="relative bg-surface px-2 text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
              Student Access
            </span>
          </div>

          <div className="space-y-2">
            <Link
              href="/student/portal"
              id="btn-student-pwa-portal"
              className="w-full flex items-center justify-between p-3 rounded-lg border border-hairline bg-canvas-soft hover:bg-surface hover:border-primary/50 hover:shadow-2xs transition-all group text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:scale-105 transition-transform shrink-0">
                  <Smartphone className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-ink group-hover:text-primary transition-colors">
                      Student PWA Web App
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200">
                      PWA
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted">
                    Open mobile portal for answer sheets & scores
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-ink-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
            </Link>

            {deferredPrompt && (
              <button
                type="button"
                onClick={handleInstallClick}
                id="btn-install-pwa"
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Install Student App on this Device</span>
              </button>
            )}
          </div>

          <div className="mt-3.5 pt-3 border-t border-hairline text-center text-xs text-ink-muted">
            Are you a student with a new admission ID?{" "}
            <Link href="/auth/claim" className="font-semibold text-primary hover:underline">
              Claim Account →
            </Link>
          </div>
        </FeatureCard>

        <div className="text-center text-[11px] text-ink-faint flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Protected by role-based tenant isolation • Antigravity Security Standard</span>
        </div>
      </div>
    </div>
  );
}
