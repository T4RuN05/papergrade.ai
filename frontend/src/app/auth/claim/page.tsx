"use client";

import { useEffect } from "react";
import LogoLoader from "@/components/LogoLoader/LogoLoader";

export default function ClaimAccountPage() {
  useEffect(() => {
    window.location.replace("/auth/login?role=claim");
  }, []);

  return (
    <div className="flex min-h-[65vh] flex-col items-center justify-center px-4">
      <div className="notion-card px-6 py-8 flex flex-col items-center text-center space-y-3 max-w-xs w-full">
        <LogoLoader size={36} duration={1.3} label="Redirecting to account activation" />
        <div className="space-y-1">
          <p className="text-[13px] font-semibold text-ink">Account Activation</p>
          <p className="text-xs text-ink-muted">Redirecting to the student claim flow...</p>
        </div>
      </div>
    </div>
  );
}
