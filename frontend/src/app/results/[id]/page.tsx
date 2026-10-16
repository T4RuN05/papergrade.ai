"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { EvaluationViewerSkeleton } from "@/components/ui";

export default function ResultsRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  useEffect(() => {
    if (id) {
      router.replace(`/student/submissions/${id}`);
    } else {
      router.replace("/student/portal");
    }
  }, [id, router]);

  return <EvaluationViewerSkeleton isStudent />;
}

