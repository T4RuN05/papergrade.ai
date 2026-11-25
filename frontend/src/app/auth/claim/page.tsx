"use client";

import { useEffect } from "react";
import LogoLoader from "@/components/LogoLoader/LogoLoader";

export default function ClaimAccountPage() {
  useEffect(() => {
    window.location.replace("/auth/login?role=claim");
  }, []);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-3">
      <LogoLoader size={38} duration={1.3} label="Redirecting to account activation" />
      <p className="text-xs font-medium text-ink-muted animate-pulse">Redirecting to account activation...</p>
    </div>
  );
}
