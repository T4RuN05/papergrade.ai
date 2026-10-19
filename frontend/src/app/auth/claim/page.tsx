"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function ClaimAccountPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/auth/login?role=claim");
  }, [router]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-3">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-xs text-ink-muted">Redirecting to Claim ID console...</p>
    </div>
  );
}
