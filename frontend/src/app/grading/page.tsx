"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MarksMatrixSkeleton } from "@/components/ui";

export default function GradingRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/marks");
  }, [router]);

  return <MarksMatrixSkeleton />;
}
