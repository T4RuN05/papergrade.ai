"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BatchesRosterSkeleton } from "@/components/ui";

export default function BatchesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/branch/batches");
  }, [router]);

  return <BatchesRosterSkeleton />;
}

