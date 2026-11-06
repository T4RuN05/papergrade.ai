"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function StudentPastExamsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/student/portal?tab=exams");
  }, [router]);

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-8">
      <div className="flex items-center gap-2.5 text-xs font-semibold text-ink-muted">
        <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span>Opening past exam submissions...</span>
      </div>
    </div>
  );
}
