import type { Metadata } from "next";
import React from "react";
import { HelpScrollToTopButton } from "@/components/help/HelpScrollToTopButton";
import { SITE_URL } from "@/lib/seoSchema";

export const metadata: Metadata = {
  title: "User Manual & Help Center",
  description:
    "Step-by-step documentation for students, coaching faculty, branch managers, and institute directors using PaperGrade AI for handwritten exam uploads, rubrics, grading, and revaluations.",
  alternates: {
    canonical: "/help",
  },
  openGraph: {
    title: "User Manual & Help Center | PaperGrade AI",
    description:
      "Role-by-role operational guides for uploading handwritten answer sheets, locking rubrics, reviewing marks, and resolving appeals.",
    url: `${SITE_URL}/help`,
  },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-canvas-soft text-ink relative">
      {children}
      <HelpScrollToTopButton />
    </div>
  );
}
