"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            use_fedcm_for_button?: boolean;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number;
            }
          ) => void;
        };
      };
    };
  }
}

export interface GoogleSessionPayload {
  access_token: string;
  role: string;
  full_name: string;
  branch_id: string;
  institute_id: string;
  google_email?: string;
  google_picture?: string;
}

interface GoogleSignInButtonProps {
  disabled?: boolean;
  isActive?: boolean;
  isConnectingRedirect?: boolean;
  onFallbackRedirect: () => void;
  onVerified: (session: GoogleSessionPayload) => void;
  onError: (message: string) => void;
}

const GIS_SCRIPT_ID = "google-gsi-client";
const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

// Module-level singletons prevent double google.accounts.id.initialize() calls
// when multiple auth panes (Student / Faculty) exist in the login carousel DOM.
let _gisConfigPromise: Promise<{ enabled: boolean; client_id?: string | null }> | null = null;
let _gisScriptPromise: Promise<void> | null = null;
let _gisInitializedClientId: string | null = null;
let _activeCredentialHandler: ((credential: string) => void) | null = null;

function getCachedGoogleConfig() {
  if (!_gisConfigPromise) {
    _gisConfigPromise = api.getGoogleClientConfig().catch((err) => {
      _gisConfigPromise = null;
      throw err;
    });
  }
  return _gisConfigPromise;
}

function loadGisScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (_gisScriptPromise) return _gisScriptPromise;

  _gisScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.accounts?.id) {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => {
            _gisScriptPromise = null;
            reject(new Error("GIS load failed"));
          },
          { once: true }
        );
      }
      return;
    }

    const script = document.createElement("script");
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      _gisScriptPromise = null;
      reject(new Error("GIS script blocked or unavailable"));
    };
    document.head.appendChild(script);
  });

  return _gisScriptPromise;
}

export function GoogleSignInButton({
  disabled = false,
  isActive = true,
  isConnectingRedirect = false,
  onFallbackRedirect,
  onVerified,
  onError,
}: GoogleSignInButtonProps) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  const onVerifiedRef = useRef(onVerified);
  const onErrorRef = useRef(onError);
  onVerifiedRef.current = onVerified;
  onErrorRef.current = onError;

  const [gisReady, setGisReady] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Register this instance's credential handler while it is the active pane
  useEffect(() => {
    if (!isActive) return;
    _activeCredentialHandler = async (credential: string) => {
      try {
        setVerifying(true);
        const data = await api.verifyGoogleIdToken(credential);
        onVerifiedRef.current(data);
      } catch (err: any) {
        setVerifying(false);
        onErrorRef.current(
          err?.message || "Google authentication failed. Please try again."
        );
      }
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;

    async function renderGisButton() {
      try {
        const [config] = await Promise.all([getCachedGoogleConfig(), loadGisScript()]);
        if (cancelled || !config?.enabled || !config.client_id) return;
        const gsi = window.google?.accounts?.id;
        const host = hostRef.current;
        if (!gsi || !host) return;

        // Initialize GIS strictly once per Google Client ID across the entire document
        if (_gisInitializedClientId !== config.client_id) {
          gsi.initialize({
            client_id: config.client_id,
            use_fedcm_for_button: true,
            auto_select: false,
            cancel_on_tap_outside: true,
            callback: (response) => {
              if (!response?.credential) {
                onErrorRef.current("Google did not return a sign-in credential.");
                return;
              }
              if (_activeCredentialHandler) {
                _activeCredentialHandler(response.credential);
              }
            },
          });
          _gisInitializedClientId = config.client_id;
        }

        // Wait a frame if carousel is mid-transition so containerRef reports real width
        const rawWidth = containerRef.current?.offsetWidth || 0;
        const width = Math.min(400, Math.max(220, rawWidth > 100 ? rawWidth : 336));

        host.innerHTML = "";
        gsi.renderButton(host, {
          type: "standard",
          theme: resolvedTheme === "dark" ? "filled_black" : "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width,
        });

        if (!cancelled && host.childElementCount > 0) {
          setGisReady(true);
        }
      } catch {
        // Silently keep our standard OAuth redirect fallback button if GIS is blocked/offline
      }
    }

    renderGisButton();
    return () => {
      cancelled = true;
    };
  }, [resolvedTheme, isActive]);

  return (
    <div ref={containerRef} className="relative w-full min-h-[40px]">
      {verifying && (
        <div className="w-full h-[40px] flex items-center justify-center gap-2 rounded-md border border-hairline bg-surface text-xs font-medium text-ink">
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
          <span>Signing in with Google...</span>
        </div>
      )}

      {/* Official Google Identity Services dynamic button ("Continue as <Name>") */}
      <div
        ref={hostRef}
        className={`w-full flex justify-center overflow-hidden rounded-md transition-opacity duration-150 ${
          gisReady && !verifying && !disabled && !isConnectingRedirect
            ? "opacity-100 min-h-[40px]"
            : "h-0 overflow-hidden opacity-0 pointer-events-none"
        }`}
      />

      {/* Fallback custom button (active while loading or if GIS script / origin isn't active) */}
      {!verifying && (!gisReady || disabled || isConnectingRedirect) && (
        <button
          type="button"
          onClick={onFallbackRedirect}
          disabled={disabled || isConnectingRedirect}
          className="notion-btn-utility w-full h-[40px] justify-center gap-2.5 text-xs font-medium disabled:opacity-50"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
          <span>{isConnectingRedirect ? "Connecting to Google..." : "Sign in with Google"}</span>
        </button>
      )}
    </div>
  );
}
