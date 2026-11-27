import type { Metadata } from "next";
import React from "react";
import { SITE_URL } from "@/lib/seoSchema";

export const metadata: Metadata = {
  title: "About PaperGrade AI — Handwritten Exam Grading Philosophy",
  description:
    "How PaperGrade AI helps offline coaching institutes grade handwritten subjective test papers with teacher-locked rubrics, visual annotations, and human-controlled appeals.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About PaperGrade AI — Handwritten Exam Grading Philosophy",
    description:
      "Built so coaching institutes never have to choose between handwritten descriptive exams and timely student feedback.",
    url: `${SITE_URL}/about`,
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
