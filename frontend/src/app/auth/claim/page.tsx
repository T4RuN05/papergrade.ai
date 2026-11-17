"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LogoLoader from "@/components/LogoLoader/LogoLoader";

export default function ClaimAccountPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/auth/login?role=claim");
  }, [router]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4">
      <LogoLoader size={76} duration={1.8} label="Redirecting to account activation" />
      <p className="text-xs font-medium text-ink-muted animate-pulse">Redirecting to account activation...</p>
    </div>
  );
}
